type ToneModule = typeof import('tone');

export type TriadType = 'major' | 'minor' | 'diminished' | 'augmented';
export type SeventhType =
	| 'maj7' | 'dom7' | 'min7' | 'm7b5' | 'dim7'
	| 'dom7b5' | 'aug7' | 'dom7sus4' | 'dom9' | 'dom7b9' | 'dom7s9'
	| 'dom7s9s5' | 'dom7b9b5' | 'minMaj7';
export type ChordQuality = TriadType | SeventhType;

export type HarmonyChord = {
	rootPc: number;
	quality: ChordQuality;
	inversion: 0 | 1 | 2;
	spread?: boolean;
	useSampler?: boolean;
};

const A4_FREQUENCY = 440;
const A4_MIDI = 69;

const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
	major: [0, 4, 7],
	minor: [0, 3, 7],
	diminished: [0, 3, 6],
	augmented: [0, 4, 8],
	maj7: [0, 4, 7, 11],
	dom7: [0, 4, 7, 10],
	min7: [0, 3, 7, 10],
	m7b5: [0, 3, 6, 10],
	dim7: [0, 3, 6, 9],
	dom7b5: [0, 4, 6, 10],
	aug7: [0, 4, 8, 10],
	dom7sus4: [0, 5, 7, 10],
	dom9: [0, 4, 7, 10, 14],
	dom7b9: [0, 4, 7, 10, 13],
	dom7s9: [0, 4, 7, 10, 15],
	dom7s9s5: [0, 4, 8, 10, 15],
	dom7b9b5: [0, 4, 6, 10, 13],
	minMaj7: [0, 3, 7, 11]
};

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

const midiToFrequency = (midi: number) =>
	A4_FREQUENCY * Math.pow(2, (midi - A4_MIDI) / 12);

const createEnvelope = (ctx: AudioContext, duration: number, volume: number) => {
	const gain = ctx.createGain();
	const now = ctx.currentTime;

	gain.gain.setValueAtTime(0, now);
	gain.gain.linearRampToValueAtTime(volume, now + 0.03);
	gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

	return gain;
};

export class HarmonyEngine {
	private ctx: AudioContext | null = null;
	private droneNodes: GainNode[] = [];
	private droneOscillators: OscillatorNode[] = [];
	private droneFilters: BiquadFilterNode[] = [];
	private droneLfo: OscillatorNode | null = null;
	private droneLfoGain: GainNode | null = null;
	private tone: ToneModule | null = null;
	private sampler: import('tone').Sampler | null = null;
	private samplerReverb: import('tone').Reverb | null = null;
	private samplerReady = false;
	private samplerLoading: Promise<void> | null = null;
	private toneStarted = false;
	private droneVolume = 0.3;
	private droneBlend = 0.5;
	private keyPc = 0;

	private ensureContext() {
		this.ctx ??= new AudioContext();
		void this.ctx.resume();
		return this.ctx;
	}

	async unlock() {
		this.ctx ??= new AudioContext();
		await this.ctx.resume();
		await this.ensureTone(true);
		return this.ctx;
	}

	private async ensureTone(startAudio = false) {
		if (!this.tone) {
			this.tone = await import('tone');
		}
		if (startAudio && !this.toneStarted) {
			await this.tone.start();
			this.toneStarted = true;
		}
		return this.tone;
	}

	async loadSampler() {
		if (this.samplerReady) return;
		if (this.samplerLoading) return this.samplerLoading;
		this.samplerLoading = (async () => {
			try {
				const tone = await this.ensureTone(false);
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

	setKeyPc(pc: number) {
		this.keyPc = pc % 12;
		if (this.droneOscillators.length) {
			this.startDrone();
		}
	}

	setDroneVolume(volume: number) {
		this.droneVolume = Math.max(0, Math.min(1, volume));
		this.updateDroneGains();
	}

	setDroneBlend(blend: number) {
		this.droneBlend = Math.max(0, Math.min(1, blend));
		this.updateDroneGains();
	}

	startDrone() {
		const ctx = this.ensureContext();
		this.stopDrone();

		const baseMidi = 48 + this.keyPc;
		const fifthMidi = baseMidi + 7;

		const rootGain = ctx.createGain();
		const fifthGain = ctx.createGain();
		const now = ctx.currentTime;
		rootGain.gain.setValueAtTime(0, now);
		fifthGain.gain.setValueAtTime(0, now);
		this.droneNodes = [rootGain, fifthGain];

		const createPadTone = (
			midi: number,
			gainNode: GainNode,
			waveforms: OscillatorType[],
			detunes: number[]
		) => {
			const oscList: OscillatorNode[] = [];
			waveforms.forEach((type, index) => {
				const osc = ctx.createOscillator();
				osc.type = type;
				osc.frequency.value = midiToFrequency(midi);
				osc.detune.value = detunes[index] ?? 0;
				const filter = ctx.createBiquadFilter();
				filter.type = 'lowpass';
				filter.frequency.value = 560;
				filter.Q.value = 0.25;
				const panner = ctx.createStereoPanner();
				panner.pan.value = index === 0 ? -0.35 : index === 1 ? 0.35 : 0;
				osc.connect(filter).connect(panner).connect(gainNode);
				this.droneFilters.push(filter);
				oscList.push(osc);
			});
			return oscList;
		};

		const rootOscs = createPadTone(baseMidi, rootGain, ['sine', 'triangle', 'sawtooth'], [-4, 4, 0]);
		const fifthOscs = createPadTone(fifthMidi, fifthGain, ['triangle', 'sine', 'sawtooth'], [-3, 3, 0]);
		this.droneOscillators = [...rootOscs, ...fifthOscs];

		rootGain.connect(ctx.destination);
		fifthGain.connect(ctx.destination);

		this.droneLfo = ctx.createOscillator();
		this.droneLfo.type = 'sine';
		this.droneLfo.frequency.value = 0.08;
		this.droneLfoGain = ctx.createGain();
		this.droneLfoGain.gain.value = 45;
		this.droneLfo.connect(this.droneLfoGain);
		this.droneFilters.forEach((filter) => {
			this.droneLfoGain?.connect(filter.frequency);
		});

		this.updateDroneGains();

		this.droneOscillators.forEach((osc) => osc.start());
		this.droneLfo.start();
	}

	stopDrone() {
		const ctx = this.ctx;
		const now = ctx?.currentTime ?? 0;
		const release = 0.9;
		this.droneNodes.forEach((gain) => {
			try {
				gain.gain.cancelScheduledValues(now);
				gain.gain.setValueAtTime(gain.gain.value || 0, now);
				gain.gain.linearRampToValueAtTime(0.0001, now + release);
			} catch {
				// ignore
			}
		});
		this.droneOscillators.forEach((osc) => {
			try {
				osc.stop(now + release + 0.02);
			} catch {
				// ignore
			}
		});
		if (this.droneLfo) {
			try {
				this.droneLfo.stop(now + release + 0.02);
			} catch {
				// ignore
			}
		}
		this.droneOscillators = [];
		this.droneNodes = [];
		this.droneFilters = [];
		this.droneLfo = null;
		this.droneLfoGain = null;
	}

	playChord({ rootPc, quality, inversion, spread, useSampler }: HarmonyChord) {
		const baseMidi = 60 + (rootPc % 12);
		const intervals = CHORD_INTERVALS[quality];
		const notes = intervals.map((interval) => baseMidi + interval);

		const reordered = [...notes];
		for (let i = 0; i < inversion; i += 1) {
			const note = reordered.shift();
			if (note !== undefined) reordered.push(note + 12);
		}
		if (spread && reordered.length >= 3) {
			reordered[1] = reordered[1] + 12;
		}

		if (useSampler !== false && this.samplerReady && this.sampler && this.tone) {
			const duration = 1.9;
			reordered.forEach((midi) => {
				const note = this.tone?.Frequency(midi, 'midi').toNote();
				if (note) {
					this.sampler?.triggerAttackRelease(note, duration, undefined, 0.65);
				}
			});
			return;
		}

		const ctx = this.ensureContext();
		const duration = 1.7;
		reordered.forEach((midi) => {
			const osc = ctx.createOscillator();
			osc.type = 'triangle';
			osc.frequency.value = midiToFrequency(midi);
			const gain = createEnvelope(ctx, duration, 0.2);
			osc.connect(gain).connect(ctx.destination);
			osc.start();
			osc.stop(ctx.currentTime + duration + 0.05);
		});
	}

	private updateDroneGains() {
		const [rootGain, fifthGain] = this.droneNodes;
		const ctx = this.ctx;
		if (!rootGain || !fifthGain || !ctx) return;
		const now = ctx.currentTime;
		const attack = 0.14;
		const boostedVolume = Math.min(1, this.droneVolume * 1.12);
		rootGain.gain.cancelScheduledValues(now);
		fifthGain.gain.cancelScheduledValues(now);
		rootGain.gain.setValueAtTime(rootGain.gain.value || 0, now);
		fifthGain.gain.setValueAtTime(fifthGain.gain.value || 0, now);
		rootGain.gain.linearRampToValueAtTime(
			boostedVolume * (1 - this.droneBlend * 0.6),
			now + attack
		);
		fifthGain.gain.linearRampToValueAtTime(
			boostedVolume * this.droneBlend,
			now + attack
		);
	}
}
