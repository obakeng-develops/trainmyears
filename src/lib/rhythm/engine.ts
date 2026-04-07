export type RhythmStage = 'idle' | 'count-in' | 'playing';

export type DropoutConfig = {
	enabled: boolean;
	barsOn: number;
	barsSilent: number;
	dropPulse: boolean;
	dropSubdivision: boolean;
};

export type RhythmTick = {
	step: number;
	isGroupStart: boolean;
	stage: RhythmStage;
	totalSteps: number;
	dropoutPhase: 'on' | 'silent' | 'off';
	dropoutBarsRemaining: number;
};

export type RhythmEngineConfig = {
	bpm: number;
	grouping: number[];
	totalSteps: number;
	countIn: boolean;
	countInBars: number;
	pulseLevel: number;
	subdivisionLevel: number;
	groupingLevel: number;
	mode?: 'standard' | 'floors';
	floorSteps?: number;
	layerSteps?: number;
	dropout?: DropoutConfig;
};

type RhythmEngineCallbacks = {
	onTick?: (tick: RhythmTick) => void;
	onStageChange?: (stage: RhythmStage) => void;
};

const DEFAULT_CONFIG: RhythmEngineConfig = {
	bpm: 96,
	grouping: [4],
	totalSteps: 4,
	countIn: true,
	countInBars: 1,
	pulseLevel: 0.6,
	subdivisionLevel: 0.4,
	groupingLevel: 0.6,
	dropout: {
		enabled: false,
		barsOn: 2,
		barsSilent: 2,
		dropPulse: true,
		dropSubdivision: true
	}
};

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

const playTone = (
	ctx: AudioContext,
	frequency: number,
	duration: number,
	volume: number,
	type: OscillatorType = 'sine',
	startAt: number = ctx.currentTime
) => {
	const oscillator = ctx.createOscillator();
	const gain = ctx.createGain();

	oscillator.type = type;
	oscillator.frequency.setValueAtTime(frequency, startAt);

	gain.gain.setValueAtTime(0, startAt);
	gain.gain.linearRampToValueAtTime(volume, startAt + 0.005);
	gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

	oscillator.connect(gain);
	gain.connect(ctx.destination);

	oscillator.start(startAt);
	oscillator.stop(startAt + duration + 0.02);
};

const getGroupStarts = (grouping: number[]) => {
	const starts = new Set<number>();
	const total = grouping.reduce((sum, value) => sum + value, 0);
	let cursor = 0;
	starts.add(0);
	for (const size of grouping) {
		cursor += size;
		if (cursor < total) {
			starts.add(cursor);
		}
	}
	return starts;
};

export class RhythmEngine {
	private ctx: AudioContext | null = null;
	private schedulerTimer: ReturnType<typeof setInterval> | null = null;
	private rafId: number | null = null;
	private config: RhythmEngineConfig = { ...DEFAULT_CONFIG };
	private callbacks: RhythmEngineCallbacks;
	private stage: RhythmStage = 'idle';
	private lastStage: RhythmStage = 'idle';
	private startTime = 0;
	private nextNoteTime = 0;
	private nextBeatNumber = 0;
	private lastUiBeat = -1;
	private dropoutBarCount = 0;
	private dropoutPhase: 'on' | 'silent' = 'on';

	constructor(callbacks: RhythmEngineCallbacks = {}) {
		this.callbacks = callbacks;
	}

	setConfig(next: Partial<RhythmEngineConfig>) {
		this.config = {
			...this.config,
			...next,
			bpm: clamp(next.bpm ?? this.config.bpm, 40, 220),
			countInBars: clamp(next.countInBars ?? this.config.countInBars, 0, 4),
			pulseLevel: clamp(next.pulseLevel ?? this.config.pulseLevel, 0, 1),
			subdivisionLevel: clamp(next.subdivisionLevel ?? this.config.subdivisionLevel, 0, 1),
			groupingLevel: clamp(next.groupingLevel ?? this.config.groupingLevel, 0, 1),
			dropout:
				next.dropout !== undefined
					? { ...this.config.dropout, ...next.dropout }
					: this.config.dropout
		};
	}

	getStage() {
		return this.stage;
	}

	async unlock() {
		this.ctx ??= new AudioContext();
		await this.ctx.resume();
	}

	start() {
		if (this.schedulerTimer) return;
		this.ctx ??= new AudioContext();
		void this.ctx.resume();

		const { bpm, totalSteps, countIn, countInBars, mode, floorSteps } = this.config;
		const intervalSec = 60 / bpm;
		const countInSteps = mode === 'floors' && floorSteps ? floorSteps : totalSteps;
		const countInTotal = countIn ? countInSteps * Math.max(countInBars, 1) : 0;

		this.stage = countInTotal > 0 ? 'count-in' : 'playing';
		this.lastStage = this.stage;
		this.callbacks.onStageChange?.(this.stage);

		this.startTime = this.ctx.currentTime + 0.05;
		this.nextNoteTime = this.startTime;
		this.nextBeatNumber = 0;
		this.lastUiBeat = -1;
		this.dropoutBarCount = 0;
		this.dropoutPhase = 'on';

		this.schedulerTimer = setInterval(() => this.scheduleNotes(), 25);
		this.scheduleNotes();
		this.rafId = requestAnimationFrame(() => this.updateUi());
	}

	stop() {
		if (this.schedulerTimer) {
			clearInterval(this.schedulerTimer);
			this.schedulerTimer = null;
		}
		if (this.rafId) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
		this.stage = 'idle';
		this.lastStage = 'idle';
		this.callbacks.onStageChange?.(this.stage);
		this.nextBeatNumber = 0;
		this.lastUiBeat = -1;
		this.dropoutBarCount = 0;
		this.dropoutPhase = 'on';
	}

	private scheduleNotes() {
		if (!this.ctx) return;
		const { bpm } = this.config;
		const intervalSec = 60 / bpm;
		const currentTime = this.ctx.currentTime;
		const scheduleAhead = 0.12;
		while (this.nextNoteTime < currentTime + scheduleAhead) {
			this.scheduleBeat(this.nextBeatNumber, this.nextNoteTime);
			this.nextNoteTime += intervalSec;
			this.nextBeatNumber += 1;
		}
	}

	private scheduleBeat(beatNumber: number, time: number) {
		if (!this.ctx) return;
		const {
			totalSteps,
			grouping,
			pulseLevel,
			subdivisionLevel,
			groupingLevel,
			mode,
			floorSteps,
			layerSteps,
			countIn,
			countInBars
		} = this.config;
		const countInSteps = mode === 'floors' && floorSteps ? floorSteps : totalSteps;
		const countInTotal = countIn ? countInSteps * Math.max(countInBars, 1) : 0;
		const inCountIn = beatNumber < countInTotal;
		const groupStarts = getGroupStarts(grouping);
		const floorStride = mode === 'floors' && floorSteps ? totalSteps / floorSteps : null;
		const layerStride = mode === 'floors' && layerSteps ? totalSteps / layerSteps : null;
		const step = inCountIn
			? beatNumber % countInSteps
			: (beatNumber - countInTotal) % totalSteps;
		const isGroupStart = groupStarts.has(step);
		const isBarStart = step === 0;

		if (inCountIn) {
			if (mode === 'floors' && floorSteps) {
				if (pulseLevel > 0) {
					playTone(this.ctx, 180, 0.08, 0.6 * pulseLevel, 'sine', time);
				}
				return;
			}
			if (subdivisionLevel > 0) {
				playTone(this.ctx, 900, 0.05, 0.25 * subdivisionLevel, 'triangle', time);
			}
			if (groupingLevel > 0 && isGroupStart) {
				playTone(this.ctx, 1200, 0.04, 0.35 * groupingLevel, 'square', time);
			}
			if (pulseLevel > 0 && isBarStart) {
				playTone(this.ctx, 180, 0.08, 0.6 * pulseLevel, 'sine', time);
			}
			return;
		}

		const { dropout } = this.config;
		if (dropout?.enabled && isBarStart) {
			this.dropoutBarCount += 1;
			if (this.dropoutPhase === 'on' && this.dropoutBarCount > dropout.barsOn) {
				this.dropoutPhase = 'silent';
				this.dropoutBarCount = 1;
			} else if (this.dropoutPhase === 'silent' && this.dropoutBarCount > dropout.barsSilent) {
				this.dropoutPhase = 'on';
				this.dropoutBarCount = 1;
			}
		}

		const inSilent = dropout?.enabled && this.dropoutPhase === 'silent';
		const effectivePulse = inSilent && dropout.dropPulse ? 0 : pulseLevel;
		const effectiveSub = inSilent && dropout.dropSubdivision ? 0 : subdivisionLevel;
		const effectiveGroup = inSilent && dropout.dropSubdivision ? 0 : groupingLevel;

		if (mode === 'floors' && floorStride && layerStride) {
			const isFloorStep = step % floorStride === 0;
			const isLayerStep = step % layerStride === 0;
			if (effectiveSub > 0 && isLayerStep) {
				playTone(this.ctx, 900, 0.05, 0.25 * effectiveSub, 'triangle', time);
			}
			if (effectivePulse > 0 && isFloorStep) {
				playTone(this.ctx, 180, 0.08, 0.6 * effectivePulse, 'sine', time);
			}
			return;
		}

		if (effectiveSub > 0) {
			playTone(this.ctx, 900, 0.05, 0.25 * effectiveSub, 'triangle', time);
		}
		if (effectiveGroup > 0 && isGroupStart) {
			playTone(this.ctx, 1200, 0.04, 0.35 * effectiveGroup, 'square', time);
		}
		if (effectivePulse > 0 && isBarStart) {
			playTone(this.ctx, 180, 0.08, 0.6 * effectivePulse, 'sine', time);
		}
	}

	private updateUi() {
		if (!this.ctx) return;
		const { bpm, totalSteps, grouping, mode, floorSteps, countIn, countInBars } = this.config;
		const intervalSec = 60 / bpm;
		const currentTime = this.ctx.currentTime;
		if (currentTime < this.startTime) {
			this.rafId = requestAnimationFrame(() => this.updateUi());
			return;
		}
		const beatNumber = Math.floor((currentTime - this.startTime) / intervalSec);
		if (beatNumber !== this.lastUiBeat) {
			this.lastUiBeat = beatNumber;
			const countInSteps = mode === 'floors' && floorSteps ? floorSteps : totalSteps;
			const countInTotal = countIn ? countInSteps * Math.max(countInBars, 1) : 0;
			const inCountIn = beatNumber < countInTotal;
			const step = inCountIn
				? beatNumber % countInSteps
				: (beatNumber - countInTotal) % totalSteps;
			const groupStarts = getGroupStarts(grouping);
			const tickStage: RhythmStage = inCountIn ? 'count-in' : 'playing';
			if (tickStage !== this.lastStage) {
				this.lastStage = tickStage;
				this.stage = tickStage;
				this.callbacks.onStageChange?.(tickStage);
			}
			const dropout = this.config.dropout;
			const dropoutPhase: 'on' | 'silent' | 'off' = !dropout?.enabled
				? 'off'
				: this.dropoutPhase;
			const dropoutBarsTotal =
				this.dropoutPhase === 'on' ? (dropout?.barsOn ?? 2) : (dropout?.barsSilent ?? 2);
			const dropoutBarsRemaining = dropout?.enabled
				? Math.max(1, dropoutBarsTotal - this.dropoutBarCount + 1)
				: 0;
			this.callbacks.onTick?.({
				step,
				isGroupStart: groupStarts.has(step),
				stage: tickStage,
				totalSteps,
				dropoutPhase,
				dropoutBarsRemaining
			});
		}
		this.rafId = requestAnimationFrame(() => this.updateUi());
	}
}
