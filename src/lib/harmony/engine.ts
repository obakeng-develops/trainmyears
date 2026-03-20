export type TriadType = 'major' | 'minor' | 'diminished' | 'augmented';

export type HarmonyChord = {
	rootPc: number;
	triad: TriadType;
	inversion: 0 | 1 | 2;
};

const A4_FREQUENCY = 440;
const A4_MIDI = 69;

const TRIAD_INTERVALS: Record<TriadType, number[]> = {
	major: [0, 4, 7],
	minor: [0, 3, 7],
	diminished: [0, 3, 6],
	augmented: [0, 4, 8]
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
		return this.ctx;
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

		const rootOsc = ctx.createOscillator();
		const fifthOsc = ctx.createOscillator();
		rootOsc.type = 'sine';
		fifthOsc.type = 'triangle';
		rootOsc.frequency.value = midiToFrequency(baseMidi);
		fifthOsc.frequency.value = midiToFrequency(fifthMidi);

		const rootGain = ctx.createGain();
		const fifthGain = ctx.createGain();
		const rootFilter = ctx.createBiquadFilter();
		const fifthFilter = ctx.createBiquadFilter();
		rootFilter.type = 'lowpass';
		fifthFilter.type = 'lowpass';
		rootFilter.frequency.value = 900;
		fifthFilter.frequency.value = 900;
		this.droneNodes = [rootGain, fifthGain];
		this.droneOscillators = [rootOsc, fifthOsc];

		rootOsc.connect(rootFilter).connect(rootGain).connect(ctx.destination);
		fifthOsc.connect(fifthFilter).connect(fifthGain).connect(ctx.destination);

		this.updateDroneGains();

		rootOsc.start();
		fifthOsc.start();
	}

	stopDrone() {
		this.droneOscillators.forEach((osc) => {
			try {
				osc.stop();
			} catch {
				// ignore
			}
		});
		this.droneOscillators = [];
		this.droneNodes = [];
	}

	playChord({ rootPc, triad, inversion }: HarmonyChord) {
		const ctx = this.ensureContext();
		const baseMidi = 60 + (rootPc % 12);
		const intervals = TRIAD_INTERVALS[triad];
		const notes = intervals.map((interval) => baseMidi + interval);

		const reordered = [...notes];
		for (let i = 0; i < inversion; i += 1) {
			const note = reordered.shift();
			if (note !== undefined) reordered.push(note + 12);
		}

		const duration = 1.6;
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
		const attack = 0.08;
		rootGain.gain.cancelScheduledValues(now);
		fifthGain.gain.cancelScheduledValues(now);
		rootGain.gain.setValueAtTime(rootGain.gain.value || 0, now);
		fifthGain.gain.setValueAtTime(fifthGain.gain.value || 0, now);
		rootGain.gain.linearRampToValueAtTime(
			this.droneVolume * (1 - this.droneBlend * 0.6),
			now + attack
		);
		fifthGain.gain.linearRampToValueAtTime(
			this.droneVolume * this.droneBlend,
			now + attack
		);
	}
}
