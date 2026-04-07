type ToneModule = typeof import('tone');

const SALAMANDER_BASE_URL = 'https://tonejs.github.io/audio/salamander/';
const SALAMANDER_URLS: Record<string, string> = {
	A0: 'A0.mp3',
	C1: 'C1.mp3',
	'D#1': 'Ds1.mp3',
	'F#1': 'Fs1.mp3',
	A1: 'A1.mp3',
	C2: 'C2.mp3',
	'D#2': 'Ds2.mp3',
	'F#2': 'Fs2.mp3',
	A2: 'A2.mp3',
	C3: 'C3.mp3',
	'D#3': 'Ds3.mp3',
	'F#3': 'Fs3.mp3',
	A3: 'A3.mp3',
	C4: 'C4.mp3',
	'D#4': 'Ds4.mp3',
	'F#4': 'Fs4.mp3',
	A4: 'A4.mp3',
	C5: 'C5.mp3',
	'D#5': 'Ds5.mp3',
	'F#5': 'Fs5.mp3',
	A5: 'A5.mp3',
	C6: 'C6.mp3',
	'D#6': 'Ds6.mp3',
	'F#6': 'Fs6.mp3',
	A6: 'A6.mp3',
	C7: 'C7.mp3',
	'D#7': 'Ds7.mp3',
	'F#7': 'Fs7.mp3',
	A7: 'A7.mp3',
	C8: 'C8.mp3'
};

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
	startOnTonic: boolean;
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
	allowedDegrees: ['1', '2', '3', '4', '5', '6', '7'],
	startOnTonic: true
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
	b2: 1,
	'2': 2,
	'#2': 3,
	b3: 3,
	'3': 4,
	'4': 5,
	'#4': 6,
	b5: 6,
	'5': 7,
	'#5': 8,
	b6: 8,
	'6': 9,
	'#6': 10,
	b7: 10,
	'7': 11
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export class MelodyEngine {
	private config: MelodyEngineConfig = { ...DEFAULT_CONFIG };
	private callbacks: MelodyEngineCallbacks;
	private tone: ToneModule | null = null;
	private synth: import('tone').FMSynth | null = null;
	private sampler: import('tone').Sampler | null = null;
	private samplerReverb: import('tone').Reverb | null = null;
	private samplerReady = false;
	private samplerLoading: Promise<void> | null = null;
	private toneStarted = false;
	private droneOscillators: import('tone').Oscillator[] = [];
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
	private lastStartDegree: string | null = null;

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
		if (!this.toneStarted) {
			await this.tone.start();
			this.toneStarted = true;
		}
		this.ensureSynth();
	}

	async loadSampler() {
		if (this.samplerReady) return;
		if (this.samplerLoading) return this.samplerLoading;
		this.samplerLoading = (async () => {
			try {
				this.tone ??= await import('tone');
				const tone = this.tone;
				if (!tone) return;
				if (this.sampler) {
					this.sampler.dispose();
					this.sampler = null;
				}
				if (this.samplerReverb) {
					this.samplerReverb.dispose();
					this.samplerReverb = null;
				}
				const reverb = new tone.Reverb({ decay: 2.0, wet: 0.16, preDelay: 0.01 });
				await reverb.generate();
				reverb.toDestination();
				const sampler = new tone.Sampler({
					urls: SALAMANDER_URLS,
					baseUrl: SALAMANDER_BASE_URL,
					release: 1.1
				});
				sampler.connect(reverb);
				await tone.loaded();
				this.samplerReverb = reverb;
				this.sampler = sampler;
				this.samplerReady = true;
			} finally {
				this.samplerLoading = null;
			}
		})();
		return this.samplerLoading;
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
		const fifthFreq = tone.Frequency(baseMidi + 7, 'midi').toFrequency();
		this.stopDrone();
		this.droneGain = new tone.Gain(0).toDestination();
		this.droneFilter = new tone.Filter({
			frequency: 540,
			type: 'lowpass',
			Q: 0.45
		});
		const rootOsc = new tone.Oscillator(freq, 'sine');
		const fifthOsc = new tone.Oscillator(fifthFreq, 'triangle');
		rootOsc.volume.value = -8;
		fifthOsc.volume.value = -17;
		this.droneOscillators = [rootOsc, fifthOsc];
		const filter = this.droneFilter;
		if (filter) {
			this.droneOscillators.forEach((osc) => osc.connect(filter));
			filter.connect(this.droneGain);
		}
		const now = tone.now();
		this.droneGain.gain.cancelScheduledValues(now);
		this.droneGain.gain.setValueAtTime(0, now);
		this.droneGain.gain.linearRampToValueAtTime(0.14, now + 0.8);
		this.droneOscillators.forEach((osc) => osc.start());
	}

	stopDrone() {
		const tone = this.tone;
		const now = tone?.now() ?? 0;
		const release = 0.9;
		const cleanupDelay = (release + 0.05) * 1000;
		if (this.droneGain) {
			try {
				this.droneGain.gain.cancelScheduledValues(now);
				this.droneGain.gain.setValueAtTime(this.droneGain.gain.value, now);
				this.droneGain.gain.linearRampToValueAtTime(0.0001, now + release);
			} catch {
				// ignore
			}
		}
		const oscillators = [...this.droneOscillators];
		const filter = this.droneFilter;
		const gain = this.droneGain;
		this.droneOscillators = [];
		this.droneFilter = null;
		this.droneGain = null;
		oscillators.forEach((osc) => {
			try {
				osc.stop(now + release + 0.02);
			} catch {
				// ignore
			}
		});
		setTimeout(() => {
			try {
				oscillators.forEach((osc) => osc.dispose());
				filter?.dispose();
				gain?.dispose();
			} catch {
				// ignore
			}
		}, cleanupDelay);
	}

	generatePhrase() {
		const { phraseLength, maxLeap, mode, startOnTonic } = this.config;
		const allowedDegrees = this.getAllowedDegrees(mode);
		if (!allowedDegrees.length) return this.phrase;
		const phrase: MelodyPhraseNote[] = [];
		let lastDegree =
			startOnTonic && allowedDegrees.includes('1')
				? '1'
				: this.pickStartDegree(allowedDegrees, startOnTonic);
		let lastBase = this.degreeBase(lastDegree);
		let lastMidi: number | null = null;
		for (let i = 0; i < phraseLength; i += 1) {
			const degree =
				i === 0 ? lastDegree : this.pickNextDegree(allowedDegrees, lastBase, maxLeap, lastDegree);
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
		if (!this.tone) return;
		const { phraseLength, loopBars, countInBars, loop } = this.config;
		const countInTotal = countInBars * 4;
		if (beatNumber < countInTotal) return;
		const loopBeats = loop ? loopBars * 4 : phraseLength;
		const beatInLoop = (beatNumber - countInTotal) % loopBeats;
		if (!loop && beatNumber >= countInTotal + phraseLength) return;
		if (beatInLoop >= phraseLength) return;
		const note = this.phrase[beatInLoop];
		if (!note) return;
		if (this.samplerReady && this.sampler) {
			const noteName = this.tone.Frequency(note.midi, 'midi').toNote();
			if (noteName) {
				this.sampler.triggerAttackRelease(noteName, 0.75, time, 0.7);
			}
			return;
		}
		if (!this.synth) return;
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

	private pickNextDegree(allowed: string[], lastBase: number, maxLeap: number, fallback: string) {
		const candidates = allowed.filter((degree) => {
			const base = this.degreeBase(degree);
			return Math.abs(base - lastBase) <= maxLeap;
		});
		return candidates[Math.floor(Math.random() * candidates.length)] ?? fallback;
	}

	private pickStartDegree(allowed: string[], startOnTonic: boolean) {
		const weighted = allowed.flatMap((degree) => {
			const base = this.degreeBase(degree);
			let weight = 1;
			if (base === 3 || base === 5) {
				weight = 3;
			} else if (base === 1) {
				weight = startOnTonic ? 3 : 1;
			}
			return Array.from({ length: weight }, () => degree);
		});
		let next = weighted[Math.floor(Math.random() * weighted.length)] ?? allowed[0];
		if (this.lastStartDegree && allowed.length > 1) {
			let safety = 0;
			while (next === this.lastStartDegree && safety < 6) {
				next = weighted[Math.floor(Math.random() * weighted.length)] ?? allowed[0];
				safety += 1;
			}
		}
		this.lastStartDegree = next;
		return next;
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
		const allowed = this.config.allowedDegrees.filter(
			(degree) => DEGREE_OFFSETS[degree] !== undefined
		);
		if (allowed.length) return allowed;
		return mode === 'minor' ? [...DIATONIC_MINOR] : [...DIATONIC_MAJOR];
	}
}
