export type RhythmStage = 'idle' | 'count-in' | 'playing';

export type RhythmTick = {
	step: number;
	isGroupStart: boolean;
	stage: RhythmStage;
	totalSteps: number;
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
	groupingLevel: 0.6
};

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

const playTone = (
	ctx: AudioContext,
	frequency: number,
	duration: number,
	volume: number,
	type: OscillatorType = 'sine'
) => {
	const oscillator = ctx.createOscillator();
	const gain = ctx.createGain();
	const now = ctx.currentTime;

	oscillator.type = type;
	oscillator.frequency.setValueAtTime(frequency, now);

	gain.gain.setValueAtTime(0, now);
	gain.gain.linearRampToValueAtTime(volume, now + 0.005);
	gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

	oscillator.connect(gain);
	gain.connect(ctx.destination);

	oscillator.start(now);
	oscillator.stop(now + duration + 0.02);
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
	private timer: ReturnType<typeof setInterval> | null = null;
	private config: RhythmEngineConfig = { ...DEFAULT_CONFIG };
	private callbacks: RhythmEngineCallbacks;
	private stage: RhythmStage = 'idle';
	private step = -1;
	private countInRemaining = 0;

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
			groupingLevel: clamp(next.groupingLevel ?? this.config.groupingLevel, 0, 1)
		};
	}

	getStage() {
		return this.stage;
	}

	start() {
		if (this.timer) return;
		this.ctx ??= new AudioContext();
		void this.ctx.resume();

		const { bpm, totalSteps, countIn, countInBars, mode, floorSteps } = this.config;
		const intervalMs = (60_000 / bpm) | 0;

		this.step = -1;
		const countInSteps = mode === 'floors' && floorSteps ? floorSteps : totalSteps;
		this.countInRemaining = countIn ? countInSteps * Math.max(countInBars, 1) : 0;
		this.stage = this.countInRemaining > 0 ? 'count-in' : 'playing';
		this.callbacks.onStageChange?.(this.stage);

		this.timer = setInterval(() => this.tick(), intervalMs);
		this.tick();
	}

	stop() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.stage = 'idle';
		this.callbacks.onStageChange?.(this.stage);
		this.step = -1;
		this.countInRemaining = 0;
	}

	private tick() {
		if (!this.ctx) return;
		const {
			totalSteps,
			grouping,
			pulseLevel,
			subdivisionLevel,
			groupingLevel,
			mode,
			floorSteps,
			layerSteps
		} = this.config;
		const groupStarts = getGroupStarts(grouping);
		const isCountingIn = this.stage === 'count-in' && this.countInRemaining > 0;
		const floorStride = mode === 'floors' && floorSteps ? totalSteps / floorSteps : null;
		const layerStride = mode === 'floors' && layerSteps ? totalSteps / layerSteps : null;

		if (isCountingIn) {
			this.countInRemaining -= 1;
			const countInSteps = mode === 'floors' && floorSteps ? floorSteps : totalSteps;
			const countStep = (countInSteps - (this.countInRemaining % countInSteps)) % countInSteps;
			const isGroupStart = groupStarts.has(countStep);
			const isBarStart = countStep === 0;
			if (mode === 'floors' && floorSteps) {
				if (pulseLevel > 0) {
					playTone(this.ctx, 180, 0.08, 0.6 * pulseLevel, 'sine');
				}
			} else {
				if (subdivisionLevel > 0) {
					playTone(this.ctx, 900, 0.05, 0.25 * subdivisionLevel, 'triangle');
				}
				if (groupingLevel > 0 && isGroupStart) {
					playTone(this.ctx, 1200, 0.04, 0.35 * groupingLevel, 'square');
				}
				if (pulseLevel > 0 && isBarStart) {
					playTone(this.ctx, 180, 0.08, 0.6 * pulseLevel, 'sine');
				}
			}
			this.callbacks.onTick?.({
				step: countStep,
				isGroupStart,
				stage: 'count-in',
				totalSteps
			});
			if (this.countInRemaining <= 0) {
				this.stage = 'playing';
				this.callbacks.onStageChange?.(this.stage);
				this.step = -1;
			}
			return;
		}

		this.step = (this.step + 1) % totalSteps;
		const isGroupStart = groupStarts.has(this.step);
		const isBarStart = this.step === 0;
		if (mode === 'floors' && floorStride && layerStride) {
			const isFloorStep = this.step % floorStride === 0;
			const isLayerStep = this.step % layerStride === 0;
			if (subdivisionLevel > 0 && isLayerStep) {
				playTone(this.ctx, 900, 0.05, 0.25 * subdivisionLevel, 'triangle');
			}
			if (pulseLevel > 0 && isFloorStep) {
				playTone(this.ctx, 180, 0.08, 0.6 * pulseLevel, 'sine');
			}
		} else {
			if (subdivisionLevel > 0) {
				playTone(this.ctx, 900, 0.05, 0.25 * subdivisionLevel, 'triangle');
			}
			if (groupingLevel > 0 && isGroupStart) {
				playTone(this.ctx, 1200, 0.04, 0.35 * groupingLevel, 'square');
			}
			if (pulseLevel > 0 && isBarStart) {
				playTone(this.ctx, 180, 0.08, 0.6 * pulseLevel, 'sine');
			}
		}

		this.callbacks.onTick?.({
			step: this.step,
			isGroupStart,
			stage: 'playing',
			totalSteps
		});
	}
}
