type ToneModule = typeof import('tone');

export type MelodyStage = 'idle' | 'count-in' | 'playing' | 'rest';

export type MelodyTick = {
	step: number;
	degree: string;
	stage: MelodyStage;
	phraseLength: number;
};

export type MelodyEngineConfig = {
	bpm: number;
	keyPc: number;
	mode: 'major' | 'minor';
	phraseLength: number;
	loopBars: number;
	countInBars: number;
	loop: boolean;
	maxLeap: number;
	rangeOctaves: number;
	regenerateOnLoop: boolean;
	allowedDegrees: string[];
};

export type MelodyPhraseNote = {
	degree: string;
	midi: number;
};

export type MelodyEngineCallbacks = {
	onTick?: (tick: MelodyTick) => void;
	onPhrase?: (phrase: MelodyPhraseNote[]) => void;
	onLoop?: (loopIndex: number) => void;
	onStageChange?: (stage: MelodyStage) => void;
};

const DEFAULT_CONFIG: MelodyEngineConfig = {
	bpm: 92,
	keyPc: 0,
	mode: 'major',
	phraseLength: 4,
	loopBars: 8,
	countInBars: 1,
	loop: true,
	maxLeap: 2,
	rangeOctaves: 1,
	regenerateOnLoop: true,
	allowedDegrees: ['1', '2', '3', '4', '5', '6', '7']
};

const FULL_DEGREES = [
	'1',
	'b2',
	'2',
	'#2',
	'b3',
	'3',
	'4',
	'#4',
	'b5',
	'5',
	'#5',
	'b6',
	'6',
	'#6',
	'b7',
	'7'
];

const DIATONIC_MAJOR = ['1', '2', '3', '4', '5', '6', '7'];
const DIATONIC_MINOR = ['1', '2', 'b3', '4', '5', 'b6', 'b7'];

const DEGREE_OFFSETS: Record<string, number> = {
	'1': 0,
	'b2': 1,
	'2': 2,
	'#2': 3,
	'b3': 3,
	'3': 4,
	'4': 5,
	'#4': 6,
	'b5': 6,
	'5': 7,
	'#5': 8,
	'b6': 8,
	'6': 9,
	'#6': 10,
	'b7': 10,
	'7': 11
};

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

export class MelodyEngine {
	private config: MelodyEngineConfig = { ...DEFAULT_CONFIG };
	private callbacks: MelodyEngineCallbacks;
	private tone: ToneModule | null = null;
	private synth: import('tone').FMSynth | null = null;
	private droneOsc: import('tone').Oscillator | null = null;
	private droneGain: import('tone').Gain | null = null;
	private droneFilter: import('tone').Filter | null = null;
	private schedulerTimer: ReturnType<typeof setInterval> | null = null;
	private rafId: number | null = null;
	private startTime = 0;
	private nextNoteTime = 0;
	private nextBeatNumber = 0;
	private lastUiBeat = -1;
	private lastLoopIndex = -1;
	private phrase: MelodyPhraseNote[] = [];
	private stage: MelodyStage = 'idle';
	private lastStage: MelodyStage = 'idle';

	constructor(callbacks: MelodyEngineCallbacks = {}) {
		this.callbacks = callbacks;
	}

	setConfig(next: Partial<MelodyEngineConfig>) {
		this.config = {
			...this.config,
			...next,
			bpm: clamp(next.bpm ?? this.config.bpm, 40, 200),
			phraseLength: clamp(next.phraseLength ?? this.config.phraseLength, 2, 8),
			loopBars: clamp(next.loopBars ?? this.config.loopBars, 2, 16),
			countInBars: clamp(next.countInBars ?? this.config.countInBars, 0, 4),
			maxLeap: clamp(next.maxLeap ?? this.config.maxLeap, 1, 4),
			rangeOctaves: clamp(next.rangeOctaves ?? this.config.rangeOctaves, 1, 2)
		};
	}

	getPhrase() {
		return this.phrase;
	}

	getStage() {
		return this.stage;
	}

	async unlock() {
		this.tone ??= await import('tone');
		await this.tone.start();
		this.ensureSynth();
	}

	start() {
		if (this.schedulerTimer) return;
		this.ensureSynth();
		const tone = this.tone;
		if (!tone) return;
		this.startTime = tone.now() + 0.05;
		this.nextNoteTime = this.startTime;
		this.nextBeatNumber = 0;
		this.lastUiBeat = -1;
		this.lastLoopIndex = -1;
		this.stage = this.config.countInBars > 0 ? 'count-in' : 'playing';
		this.lastStage = this.stage;
		this.callbacks.onStageChange?.(this.stage);
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
		this.lastUiBeat = -1;
		this.nextBeatNumber = 0;
	}

	startDrone() {
		this.ensureSynth();
		const tone = this.tone;
		if (!tone) return;
		const baseMidi = 60 + (this.config.keyPc % 12);
		const freq = tone.Frequency(baseMidi, 'midi').toFrequency();
		this.stopDrone();
		this.droneGain = new tone.Gain(0).toDestination();
		this.droneFilter = new tone.Filter({
			frequency: 700,
			type: 'lowpass',
			Q: 0.3
		});
		this.droneOsc = new tone.Oscillator(freq, 'sine');
		this.droneOsc.connect(this.droneFilter);
		this.droneFilter.connect(this.droneGain);
		this.droneGain.gain.rampTo(0.16, 0.2);
		this.droneOsc.start();
	}

	stopDrone() {
		const tone = this.tone;
		const now = tone?.now() ?? 0;
		const release = 0.2;
		const cleanupDelay = (release + 0.05) * 1000;
		if (this.droneGain) {
			try {
				this.droneGain.gain.rampTo(0.0001, release);
			} catch {
				// ignore
			}
		}
		const osc = this.droneOsc;
		const filter = this.droneFilter;
		const gain = this.droneGain;
		this.droneOsc = null;
		this.droneFilter = null;
		this.droneGain = null;
		if (osc) {
			try {
				osc.stop(now + release + 0.02);
			} catch {
				// ignore
			}
		}
		setTimeout(() => {
			try {
				osc?.dispose();
				filter?.dispose();
				gain?.dispose();
			} catch {
				// ignore
			}
		}, cleanupDelay);
	}

	generatePhrase() {
		const { phraseLength, maxLeap, mode } = this.config;
		const allowedDegrees = this.getAllowedDegrees(mode);
		if (!allowedDegrees.length) return this.phrase;
		const phrase: MelodyPhraseNote[] = [];
		let lastDegree = allowedDegrees.includes('1') ? '1' : allowedDegrees[0];
		let lastBase = this.degreeBase(lastDegree);
		let lastMidi: number | null = null;
		for (let i = 0; i < phraseLength; i += 1) {
			const degree =
				i === 0
					? lastDegree
					: this.pickNextDegree(allowedDegrees, lastBase, maxLeap, lastDegree);
			const midi = this.degreeToMidi(degree, lastMidi ?? undefined);
			phrase.push({ degree, midi });
			lastDegree = degree;
			lastBase = this.degreeBase(degree);
			lastMidi = midi;
		}
		this.phrase = phrase;
		this.callbacks.onPhrase?.(phrase);
		return phrase;
	}

	setPhrase(phrase: MelodyPhraseNote[]) {
		this.phrase = phrase;
		this.callbacks.onPhrase?.(phrase);
	}

	private ensureSynth() {
		const tone = this.tone;
		if (!tone) return;
		if (!this.synth) {
			this.synth = new tone.FMSynth({
				harmonicity: 2,
				modulationIndex: 6,
				envelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.4 },
				modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.4 }
			}).toDestination();
			this.synth.volume.value = -6;
		}
	}

	private scheduleNotes() {
		const tone = this.tone;
		if (!tone) return;
		const currentTime = tone.now();
		const intervalSec = 60 / this.config.bpm;
		const scheduleAhead = 0.12;
		while (this.nextNoteTime < currentTime + scheduleAhead) {
			this.scheduleBeat(this.nextBeatNumber, this.nextNoteTime);
			this.nextNoteTime += intervalSec;
			this.nextBeatNumber += 1;
		}
	}

	private scheduleBeat(beatNumber: number, time: number) {
		if (!this.synth || !this.tone) return;
		const { phraseLength, loopBars, countInBars, loop } = this.config;
		const countInTotal = countInBars * 4;
		if (beatNumber < countInTotal) return;
		const loopBeats = loop ? loopBars * 4 : phraseLength;
		const beatInLoop = (beatNumber - countInTotal) % loopBeats;
		if (!loop && beatNumber >= countInTotal + phraseLength) return;
		if (beatInLoop >= phraseLength) return;
		const note = this.phrase[beatInLoop];
		if (!note) return;
		const freq = this.tone.Frequency(note.midi, 'midi').toFrequency();
		this.synth.triggerAttackRelease(freq, 0.55, time);
	}

	private updateUi() {
		const intervalSec = 60 / this.config.bpm;
		const tone = this.tone;
		if (!tone) return;
		const now = tone.now();
		if (now < this.startTime) {
			this.rafId = requestAnimationFrame(() => this.updateUi());
			return;
		}
		const beatNumber = Math.floor((now - this.startTime) / intervalSec);
		if (beatNumber !== this.lastUiBeat) {
			this.lastUiBeat = beatNumber;
			const { phraseLength, loopBars, countInBars, loop } = this.config;
			const countInTotal = countInBars * 4;
			const inCountIn = beatNumber < countInTotal;
			if (!loop && beatNumber >= countInTotal + phraseLength) {
				this.stop();
				return;
			}
			if (inCountIn) {
				this.stage = 'count-in';
				if (this.stage !== this.lastStage) {
					this.lastStage = this.stage;
					this.callbacks.onStageChange?.(this.stage);
				}
				this.callbacks.onTick?.({
					step: beatNumber % 4,
					degree: '',
					stage: 'count-in',
					phraseLength
				});
			} else {
				const loopBeats = loop ? loopBars * 4 : phraseLength;
				const beatInLoop = (beatNumber - countInTotal) % loopBeats;
				const loopIndex = Math.floor((beatNumber - countInTotal) / loopBeats);
				if (loopIndex !== this.lastLoopIndex) {
					this.lastLoopIndex = loopIndex;
					this.callbacks.onLoop?.(loopIndex);
					if (this.config.regenerateOnLoop) {
						this.generatePhrase();
					}
				}
				if (beatInLoop < phraseLength) {
					const note = this.phrase[beatInLoop];
					this.stage = 'playing';
					if (this.stage !== this.lastStage) {
						this.lastStage = this.stage;
						this.callbacks.onStageChange?.(this.stage);
					}
					this.callbacks.onTick?.({
						step: beatInLoop,
						degree: note ? note.degree : '',
						stage: 'playing',
						phraseLength
					});
				} else {
					this.stage = 'rest';
					if (this.stage !== this.lastStage) {
						this.lastStage = this.stage;
						this.callbacks.onStageChange?.(this.stage);
					}
					this.callbacks.onTick?.({
						step: beatInLoop,
						degree: '',
						stage: 'rest',
						phraseLength
					});
				}
			}
		}
		this.rafId = requestAnimationFrame(() => this.updateUi());
	}

	private pickNextDegree(
		allowed: string[],
		lastBase: number,
		maxLeap: number,
		fallback: string
	) {
		const candidates = allowed.filter((degree) => {
			const base = this.degreeBase(degree);
			return Math.abs(base - lastBase) <= maxLeap;
		});
		return candidates[Math.floor(Math.random() * candidates.length)] ?? fallback;
	}

	private degreeToMidi(degree: string, lastMidi?: number) {
		const baseMidi = 60 + (this.config.keyPc % 12);
		const offset = DEGREE_OFFSETS[degree] ?? 0;
		const base = baseMidi + offset;
		const range = Math.max(1, this.config.rangeOctaves);
		const minMidi = baseMidi;
		const maxMidi = baseMidi + 12 * range;
		const candidates = [base - 12, base, base + 12, base + 24].filter(
			(midi) => midi >= minMidi && midi <= maxMidi
		);
		if (!candidates.length) return clamp(base, minMidi, maxMidi);
		if (lastMidi === undefined) {
			return candidates.includes(base) ? base : candidates[0];
		}
		return candidates.reduce((closest, midi) =>
			Math.abs(midi - lastMidi) < Math.abs(closest - lastMidi) ? midi : closest
		);
	}

	private degreeBase(degree: string) {
		const match = degree.match(/\d+/);
		const base = match ? Number(match[0]) : 1;
		return clamp(base, 1, 7);
	}

	private getAllowedDegrees(mode: MelodyEngineConfig['mode']) {
		const allowed = this.config.allowedDegrees.filter((degree) => DEGREE_OFFSETS[degree] !== undefined);
		if (allowed.length) return allowed;
		return mode === 'minor' ? [...DIATONIC_MINOR] : [...DIATONIC_MAJOR];
	}
}
