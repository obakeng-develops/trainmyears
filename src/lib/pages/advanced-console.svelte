<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		RhythmEngine,
		type RhythmEngineConfig,
		type RhythmStage,
		type RhythmTick,
		type DropoutConfig
	} from '$lib/rhythm/engine';
	import { HarmonyEngine, type ChordQuality, type SeventhType, type TriadType } from '$lib/harmony/engine';
	import {
		MelodyEngine,
		type MelodyEngineConfig,
		type MelodyPhraseNote,
		type MelodyTick,
		type MelodyStage
	} from '$lib/melody/engine';
	import MelodyListeningTrainer from '$lib/melody/listening-trainer.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';

	type Pattern = {
		id: string;
		label: string;
		syllables: string[];
	};

	type GroupingPreset = {
		id: string;
		label: string;
		groups: number[];
	};

	const meterOptions = ['1', '2', '3', '4', '5', '6', '7', '8'];
	const roleOptions = ['instrumentalist', 'drummer', 'singer'] as const;
	const phaseOptions = ['rhythm', 'harmony', 'melody'] as const;
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
	const NEIGHBOR_DEGREES = ['b2', '#4', 'b6'];
	const SCALE_OPTIONS = ['major', 'naturalMinor', 'harmonicMinor', 'melodicMinor'] as const;
	const SCALE_LABELS: Record<(typeof SCALE_OPTIONS)[number], string> = {
		major: 'Major',
		naturalMinor: 'Natural Minor',
		harmonicMinor: 'Harmonic Minor',
		melodicMinor: 'Melodic Minor'
	};
	const SCALE_DEGREES: Record<(typeof SCALE_OPTIONS)[number], string[]> = {
		major: ['1', '2', '3', '4', '5', '6', '7'],
		naturalMinor: ['1', '2', 'b3', '4', '5', 'b6', 'b7'],
		harmonicMinor: ['1', '2', 'b3', '4', '5', 'b6', '7'],
		melodicMinor: ['1', '2', 'b3', '4', '5', '6', '7']
	};
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
	const FIXED_SINGLE_MIDI = 64;
	const solfegeMap: Record<string, string> = {
		'1': 'Do',
		'b2': 'Ra',
		'2': 'Re',
		'#2': 'Ri',
		'b3': 'Me',
		'3': 'Mi',
		'4': 'Fa',
		'#4': 'Fi',
		'b5': 'Se',
		'5': 'Sol',
		'#5': 'Si',
		'b6': 'Le',
		'6': 'La',
		'#6': 'Li',
		'b7': 'Te',
		'7': 'Ti'
	};

	type Role = (typeof roleOptions)[number];
	type Phase = (typeof phaseOptions)[number];

	let { initialPhase = 'rhythm', showPhaseToggle = false } = $props<{
		initialPhase?: Phase;
		showPhaseToggle?: boolean;
	}>();

	const patternBank: Record<number, Pattern[]> = {
		1: [{ id: '1-ta', label: 'Ta', syllables: ['Ta'] }],
		2: [{ id: '2-taka', label: 'Ta Ka', syllables: ['Ta', 'Ka'] }],
		3: [{ id: '3-takita', label: 'Ta Ki Ta', syllables: ['Ta', 'Ki', 'Ta'] }],
		4: [
			{ id: '4-takadimi', label: 'Ta Ka Di Mi', syllables: ['Ta', 'Ka', 'Di', 'Mi'] }
		],
		5: [
			{ id: '5-tatingenato', label: 'Ta Tin Ge Na To', syllables: ['Ta', 'Tin', 'Ge', 'Na', 'To'] }
		],
		6: [
			{
				id: '6-takita-takita',
				label: 'Ta Ki Ta Ta Ki Ta',
				syllables: ['Ta', 'Ki', 'Ta', 'Ta', 'Ki', 'Ta']
			}
		],
		7: [
			{
				id: '7-takita-takadimi',
				label: 'Ta Ki Ta Ta Ka Di Mi',
				syllables: ['Ta', 'Ki', 'Ta', 'Ta', 'Ka', 'Di', 'Mi']
			},
			{
				id: '7-takadimi-takita',
				label: 'Ta Ka Di Mi Ta Ki Ta',
				syllables: ['Ta', 'Ka', 'Di', 'Mi', 'Ta', 'Ki', 'Ta']
			}
		],
		8: [
			{
				id: '8-takadimi-takadimi',
				label: 'Ta Ka Di Mi Ta Ka Di Mi',
				syllables: ['Ta', 'Ka', 'Di', 'Mi', 'Ta', 'Ka', 'Di', 'Mi']
			},
			{
				id: '8-3-3-2',
				label: 'Ta Ki Ta Ta Ki Ta Ta Ka',
				syllables: ['Ta', 'Ki', 'Ta', 'Ta', 'Ki', 'Ta', 'Ta', 'Ka']
			}
		]
	};

const groupingPresets: Record<number, GroupingPreset[]> = {
		1: [{ id: '1-1', label: '1', groups: [1] }],
		2: [{ id: '2-2', label: '2', groups: [2] }],
		3: [
			{ id: '3-3', label: '3', groups: [3] },
			{ id: '3-1-2', label: '1 + 2', groups: [1, 2] }
		],
		4: [
			{ id: '4-4', label: '4', groups: [4] },
			{ id: '4-2-2', label: '2 + 2', groups: [2, 2] },
			{ id: '4-3-1', label: '3 + 1', groups: [3, 1] }
		],
		5: [
			{ id: '5-3-2', label: '3 + 2', groups: [3, 2] },
			{ id: '5-2-3', label: '2 + 3', groups: [2, 3] }
		],
		6: [
			{ id: '6-3-3', label: '3 + 3', groups: [3, 3] },
			{ id: '6-2-2-2', label: '2 + 2 + 2', groups: [2, 2, 2] }
		],
		7: [
			{ id: '7-3-2-2', label: '3 + 2 + 2', groups: [3, 2, 2] },
			{ id: '7-2-2-3', label: '2 + 2 + 3', groups: [2, 2, 3] },
			{ id: '7-2-3-2', label: '2 + 3 + 2', groups: [2, 3, 2] }
		],
		8: [
			{ id: '8-4-4', label: '4 + 4', groups: [4, 4] },
			{ id: '8-3-3-2', label: '3 + 3 + 2', groups: [3, 3, 2] },
			{ id: '8-2-3-3', label: '2 + 3 + 3', groups: [2, 3, 3] },
		{ id: '8-2-2-2-2', label: '2 + 2 + 2 + 2', groups: [2, 2, 2, 2] }
	]
};

const floorOptions = ['2', '3', '4', '5', '6', '7', '8'];
const layerOptions = ['1', '2', '3', '4', '5', '6', '7', '8'];
const maxLayerCount = 8;
const floorSyllables: Record<number, string[]> = {
	1: ['Ta'],
	2: ['Ta', 'Ka'],
	3: ['Ta', 'Ki', 'Ta'],
	4: ['Ta', 'Ka', 'Di', 'Mi'],
	5: ['Ta', 'Tin', 'Ge', 'Na', 'To'],
	6: ['Ta', 'Ki', 'Ta', 'Ta', 'Ki', 'Ta'],
	7: ['Ta', 'Ki', 'Ta', 'Ta', 'Ka', 'Di', 'Mi'],
	8: ['Ta', 'Ka', 'Di', 'Mi', 'Ta', 'Ka', 'Di', 'Mi']
};

	let role = $state<Role>('instrumentalist');
	let phase = $state<Phase>(initialPhase);
	let bpmValue = $state(96);
	let matchPlaybackBpm = $state(false);
	let meterValue = $state('4');
	let patternId = $state(patternBank[4][0].id);
	let groupingId = $state(groupingPresets[4][0].id);
	let countIn = $state(true);
	let isPlaying = $state(false);
	let stage: RhythmStage = $state('idle');
	let currentStep = $state(0);
	let currentIsGroupStart = $state(false);
	let lastConfigKey = $state('');
	let suppressRestart = $state(false);
	let lastRole = $state<Role>('instrumentalist');
	let settingsHydrated = $state(false);
	let patternSheetOpen = $state(false);
	let tipsSheetOpen = $state(false);
	let mobileBpmOpen = $state(false);
	let learnMode = $state(false);
	let learnStep = $state(0);
	let learnSkipped = $state(false);
	let pulseMix = $state(70);
	let subdivisionMix = $state(50);
	let groupAccentMode = $state<'off' | 'soft' | 'strong'>('soft');
	let floorsMode = $state(false);
	let floorDenom = $state('2');
	let layerCount = $state('3');
	let autoAdvanceFloors = $state(false);
	let barsPerFloor = $state(4);
	let barsRemainingInFloor = $state(4);
	let layerAdvanceDirection = $state<1 | -1>(1);
	let lockedPlaybackBpm = $state<number | null>(null);
	let lastMatchPlaybackBpm = $state(false);
	let harmonyKey = $state('0');
	let harmonyChordRoot = $state('0');
	let harmonyFunctionKey = $state('0');
	let harmonyKeyMode = $state<'major' | 'minor'>('major');
	let harmonyChordMode = $state<'function' | 'free'>('function');
	let harmonyChordSet = $state<'triads' | 'sevenths'>('triads');
	let harmonyAdvanceKey = $state(false);
	let harmonyFifthsDirection = $state<'1' | '-1'>('1');
	let harmonyFunction = $state('I');
	let harmonyTriad = $state<TriadType>('major');
	let harmonySeventh = $state<SeventhType>('dom7');
	let harmonyInversion = $state<0 | 1 | 2>(0);
	let harmonyDroneOn = $state(false);
	let harmonyDroneVolume = $state(40);
	let harmonyDroneBlend = $state(40);
	let harmonyQuizMode = $state(false);
	let harmonyReveal = $state(false);
	let harmonyContrastOn = $state(false);
	let harmonyContrastTriad = $state<TriadType>('minor');
	let harmonyContrastSeventh = $state<SeventhType>('min7');
	let harmonyLoopOn = $state(true);
	let harmonyLoopBars = $state('1');
	let harmonyLoopActive = $state(false);
	let harmonyLoopTimer: ReturnType<typeof setInterval> | null = null;
	let harmonySamplesLoading = $state(false);
	let harmonySamplesReady = $state(false);
	let harmonySamplesPromise: Promise<void> | null = null;
	let harmonyPreloadTriggered = $state(false);
	let lastHarmonyLoopConfigKey = $state('');
	let lastHarmonyChordKey = $state('');
	let melodyMode = $state<'interactive' | 'passive'>('interactive');
	let melodyPracticeMode = $state<'phrase' | 'scale' | 'single'>('phrase');
	let melodyScaleMode = $state<(typeof SCALE_OPTIONS)[number]>('major');
	let melodyShowScaleNames = $state(false);
	let melodyStartOnTonic = $state(true);
	let melodyScaleChoices = $state<(typeof SCALE_OPTIONS)[number][]>([]);
	let melodyScaleCorrect = $state<(typeof SCALE_OPTIONS)[number] | ''>('');
	let melodyScaleFeedback = $state<'idle' | 'correct' | 'incorrect'>('idle');
	let melodySingleChoices = $state<string[]>([]);
	let melodySingleCorrect = $state('');
	let melodySingleFeedback = $state<'idle' | 'correct' | 'incorrect'>('idle');
	let melodyRepresentation = $state<'solfege' | 'numbers'>('solfege');
	let melodyKey = $state('0');
	let melodyKeyMode = $state<'major' | 'minor'>('major');
	let melodyBpm = $state(92);
	let melodyPhraseLength = $state(4);
	let melodyLoopBars = $state(8);
	let melodyMaxLeap = $state(2);
	let melodyAutoAdvanceKey = $state(true);
	let melodyDroneOn = $state(false);
	let melodyStage = $state<'idle' | 'count-in' | 'playing' | 'rest'>('idle');
	let melodyStep = $state(0);
	let melodyDegrees = $state<string[]>([]);
	let melodyInput = $state<string[]>([]);
	let melodyFeedback = $state<'idle' | 'correct' | 'incorrect'>('idle');
	let melodyReveal = $state(false);
	let melodyAudioReady = $state(false);
	let melodyPlaying = $state(false);
	let melodyConfigKey = $state('');
	let melodyAllowedDegrees = $state<string[]>([...DIATONIC_MAJOR]);
	let rhythmAudioReady = $state(false);
	let harmonyAudioReady = $state(false);
	let dropoutEnabled = $state(false);
	let dropoutBarsOn = $state(2);
	let dropoutBarsSilent = $state(2);
	let dropoutDropPulse = $state(true);
	let dropoutDropSubdivision = $state(true);
	let dropoutPhase = $state<'on' | 'silent' | 'off'>('off');
	let dropoutBarsRemaining = $state(0);

	const engine = new RhythmEngine({
		onTick: (tick: RhythmTick) => {
			currentStep = tick.step;
			currentIsGroupStart = tick.isGroupStart;
			stage = tick.stage;
			dropoutPhase = tick.dropoutPhase;
			dropoutBarsRemaining = tick.dropoutBarsRemaining;
			if (autoAdvanceFloors && floorsMode && tick.stage === 'playing' && tick.step === 0) {
				barsRemainingInFloor = Math.max(0, barsRemainingInFloor - 1);
				if (barsRemainingInFloor === 0) {
					const nextLayer = getNextLayerStep(layerCountNum, layerAdvanceDirection);
					layerAdvanceDirection = nextLayer.direction;
					suppressRestart = true;
					layerCount = String(nextLayer.value);
					barsRemainingInFloor = barsPerFloor;
					if (isPlaying) {
						engine.setConfig(getFloorsConfig(nextLayer.value));
					}
				}
			}
		},
		onStageChange: (nextStage) => {
			stage = nextStage;
		}
	});

	const harmonyEngine = new HarmonyEngine();
	const melodyEngine = new MelodyEngine({
		onTick: (tick: MelodyTick) => {
			melodyStage = tick.stage;
			melodyStep = tick.step;
		},
		onStageChange: (nextStage: MelodyStage) => {
			melodyStage = nextStage;
			if (nextStage === 'idle') {
				melodyPlaying = false;
			}
		},
		onPhrase: (phrase: MelodyPhraseNote[]) => {
			melodyDegrees = phrase.map((note) => String(note.degree));
		},
		onLoop: (loopIndex: number) => {
			if (!melodyAutoAdvanceKey || melodyMode !== 'passive') return;
			const currentIndex = circleOfFifths.indexOf(Number(melodyKey));
			const nextIndex = (currentIndex + 1 + circleOfFifths.length) % circleOfFifths.length;
			melodyKey = String(circleOfFifths[nextIndex]);
			melodyEngine.setConfig({ keyPc: Number(melodyKey) });
			if (melodyDroneOn) {
				melodyEngine.startDrone();
			}
			void loopIndex;
		}
	} as any);

	const labelForMelodyDegree = (degree: string) =>
		melodyRepresentation === 'solfege' ? solfegeMap[degree] ?? degree : degree;
	const labelForMelodyScale = (scale: (typeof SCALE_OPTIONS)[number] | '') =>
		scale ? SCALE_LABELS[scale] : '';
	const labelForMelodyScaleChoice = (scale: (typeof SCALE_OPTIONS)[number], index: number) =>
		melodyShowScaleNames ? SCALE_LABELS[scale] : `Option ${index + 1}`;
	const melodyScaleFeel = (scale: (typeof SCALE_OPTIONS)[number]) => {
		if (scale === 'major' || scale === 'melodicMinor') return 'Bright';
		if (scale === 'harmonicMinor') return 'Tense';
		return 'Dark';
	};
	const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);

	const getNextLayerStep = (current: number, direction: 1 | -1) => {
		if (direction === 1) {
			if (current >= maxLayerCount) {
				return { value: Math.max(1, current - 1), direction: -1 as const };
			}
			return { value: Math.min(maxLayerCount, current + 1), direction };
		}
		if (current <= 1) {
			return { value: Math.min(maxLayerCount, current + 1), direction: 1 as const };
		}
		return { value: Math.max(1, current - 1), direction };
	};

	const getFloorsConfig = (nextLayerSteps: number) => {
		const nextFloorsLcm = lcm(floorDenomNum, nextLayerSteps);
		const nextPlaybackMultiplier = nextFloorsLcm / floorDenomNum;
		let nextEngineBpm = engineBpm;
		if (autoAdvanceFloors && floorsMode && !matchPlaybackBpm && lockedPlaybackBpm !== null) {
			nextEngineBpm = lockedPlaybackBpm;
		} else {
			const nextBaseBpm = matchPlaybackBpm ? bpmValue / nextPlaybackMultiplier : bpmValue;
			nextEngineBpm = nextBaseBpm * nextPlaybackMultiplier;
		}
		return {
			bpm: nextEngineBpm,
			grouping: [nextFloorsLcm],
			totalSteps: nextFloorsLcm,
			countIn,
			countInBars: 1,
			pulseLevel: effectiveMix.pulse,
			subdivisionLevel: effectiveMix.subdivision,
			groupingLevel: 0,
			mode: 'floors',
			floorSteps: floorDenomNum,
			layerSteps: nextLayerSteps
		} as Partial<RhythmEngineConfig>;
	};

	const toggleMelodyDegree = (degree: string) => {
		if (melodyAllowedDegrees.includes(degree)) {
			melodyAllowedDegrees = melodyAllowedDegrees.filter((value) => value !== degree);
		} else {
			melodyAllowedDegrees = [...melodyAllowedDegrees, degree];
		}
	};

	const applyMelodyPreset = (preset: 'diatonic' | 'neighbors' | 'chromatic') => {
		if (preset === 'diatonic') {
			melodyAllowedDegrees = [...melodyDiatonicRow];
			return;
		}
		if (preset === 'neighbors') {
			melodyAllowedDegrees = Array.from(new Set([...melodyDiatonicRow, ...NEIGHBOR_DEGREES]));
			return;
		}
		melodyAllowedDegrees = [...FULL_DEGREES];
	};

	const unlockRhythmAudio = async () => {
		if (rhythmAudioReady) return;
		try {
			await engine.unlock();
			rhythmAudioReady = true;
		} catch {
			rhythmAudioReady = false;
		}
	};

	const unlockHarmonyAudio = async () => {
		if (harmonyAudioReady) return;
		try {
			await harmonyEngine.unlock();
			harmonyAudioReady = true;
		} catch {
			harmonyAudioReady = false;
		}
	};

	const unlockMelodyAudio = async () => {
		if (melodyAudioReady) return;
		try {
			await melodyEngine.unlock();
			melodyAudioReady = true;
		} catch {
			melodyAudioReady = false;
		}
	};

	const stopPlayback = () => {
		engine.stop();
		isPlaying = false;
		stage = 'idle';
		currentStep = 0;
		currentIsGroupStart = false;
	};

	const startPlayback = async () => {
		await unlockRhythmAudio();
		if (autoAdvanceFloors && floorsMode) {
			barsRemainingInFloor = barsPerFloor;
			if (!matchPlaybackBpm) {
				lockedPlaybackBpm = engineBpm;
			}
		}
		engine.setConfig({
			bpm: playbackBpm,
			grouping: floorsMode ? [engineSteps] : grouping.groups,
			totalSteps: engineSteps,
			countIn,
			countInBars: 1,
			pulseLevel: effectiveMix.pulse,
			subdivisionLevel: effectiveMix.subdivision,
			groupingLevel: floorsMode ? 0 : effectiveMix.grouping,
			mode: floorsMode ? 'floors' : 'standard',
			floorSteps: floorsMode ? floorDenomNum : undefined,
			layerSteps: floorsMode ? layerCountNum : undefined,
			dropout: {
				enabled: dropoutEnabled,
				barsOn: dropoutBarsOn,
				barsSilent: dropoutBarsSilent,
				dropPulse: dropoutDropPulse,
				dropSubdivision: dropoutDropSubdivision
			} satisfies DropoutConfig
		} as Partial<RhythmEngineConfig>);
		engine.start();
		isPlaying = true;
	};

	const togglePlayback = () => {
		if (isPlaying) {
			stopPlayback();
		} else {
			void startPlayback();
		}
	};

	const roleLabels: Record<Role, string> = {
		instrumentalist: 'Instrumentalist',
		drummer: 'Drummer',
		singer: 'Singer'
	};

	const phaseLabels: Record<Phase, string> = {
		rhythm: 'Rhythm',
		harmony: 'Harmony',
		melody: 'Melody'
	};

	const consoleTitle = $derived(
		phase === 'rhythm'
			? 'Rhythm Console'
			: phase === 'harmony'
				? 'Harmony Console'
				: 'Melody Console'
	);

	const rolePresets: Record<Role, { bpm: number; countIn: boolean }> = {
		instrumentalist: { bpm: 96, countIn: true },
		drummer: { bpm: 104, countIn: true },
		singer: { bpm: 84, countIn: true }
	};

	const roleCopy: Record<
		Role,
		{
			header: string;
			instructions: string;
			lanes: { foot: string; clap: string; voice: string };
			laneFocus: { foot: string; clap: string; voice: string };
		}
	> = {
		instrumentalist: {
			header: 'Balance pulse, grouping, and syllables while keeping phrasing clear.',
			instructions: 'Tap the pulse, clap subdivisions, and speak syllables to lock in grouping.',
			lanes: {
				foot: 'Pulse',
				clap: 'Subdivision',
				voice: 'Syllables'
			},
			laneFocus: {
				foot: 'Tap the base pulse evenly.',
				clap: 'Clap every subdivision with clarity.',
				voice: 'Speak konnakol with steady flow.'
			}
		},
		drummer: {
			header: 'Drive the groove with strong accents and crisp subdivisions.',
			instructions: 'Foot the group accents, clap the subdivisions, and speak syllables.',
			lanes: {
				foot: 'Foot',
				clap: 'Stick',
				voice: 'Syllables'
			},
			laneFocus: {
				foot: 'Mark the group accents solidly.',
				clap: 'Keep subdivision clicks tight.',
				voice: 'Speak syllables to anchor the grid.'
			}
		},
		singer: {
			header: 'Lead with the voice while keeping the pulse grounded.',
			instructions: 'Use body pulse, clap subdivisions lightly, and sing the syllables.',
			lanes: {
				foot: 'Pulse',
				clap: 'Light clap',
				voice: 'Voice'
			},
			laneFocus: {
				foot: 'Feel pulse in your body.',
				clap: 'Keep subdivisions soft and even.',
				voice: 'Sing the syllables clearly.'
			}
		}
	};

	const learnSteps = [
		{
			id: 'pulse',
			label: 'Pulse only',
			focus: 'foot' as const,
			copy: {
				instrumentalist: 'Tap the pulse. Keep it steady for 8 bars.',
				drummer: 'Foot the pulse. Keep the accents locked.',
				singer: 'Feel the pulse in your body. Keep it calm and even.'
			}
		},
		{
			id: 'subdivision',
			label: 'Subdivision only',
			focus: 'clap' as const,
			copy: {
				instrumentalist: 'Clap every subdivision. No rushing.',
				drummer: 'Stick the subdivisions with precision.',
				singer: 'Lightly clap subdivisions without tension.'
			}
		},
		{
			id: 'syllables',
			label: 'Syllables only',
			focus: 'voice' as const,
			copy: {
				instrumentalist: 'Speak the syllables clearly and evenly.',
				drummer: 'Speak syllables to anchor the grid.',
				singer: 'Sing the syllables with relaxed breath.'
			}
		},
		{
			id: 'combine',
			label: 'Combine all three',
			focus: 'all' as const,
			copy: {
				instrumentalist: 'Pulse, subdivisions, and syllables together.',
				drummer: 'Foot + stick + syllables in one loop.',
				singer: 'Body pulse + clap + voice together.'
			}
		},
		{
			id: 'grouping',
			label: 'Feel grouping',
			focus: 'grouping' as const,
			copy: {
				instrumentalist: 'Listen for the grouping click. Count 3 + 2, then 2 + 3.',
				drummer: 'Listen for the grouping click and drive the accents.',
				singer: 'Listen for the grouping click and phrase it.'
			}
		},
		{
			id: 'floors',
			label: 'Floor + layer',
			focus: 'floors' as const,
			copy: {
				instrumentalist: 'Hold the floor steady while speaking the layer syllables.',
				drummer: 'Lock the floor with your foot and speak the layer.',
				singer: 'Feel the floor and sing the layer syllables.'
			}
		}
	] as const;

	const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
	const lcm = (a: number, b: number) => (a * b) / gcd(a, b);
	const floorDenomNum = $derived(Number(floorDenom));
	const layerCountNum = $derived(Number(layerCount));
	const floorsLcm = $derived(lcm(floorDenomNum, layerCountNum));
	const floorStride = $derived(floorsLcm / floorDenomNum);
	const layerStride = $derived(floorsLcm / layerCountNum);
	const currentFloorIndex = $derived(
		floorStride ? Math.floor(currentStep / floorStride) % floorDenomNum : 0
	);
	const currentLayerIndex = $derived(
		layerStride ? Math.floor(currentStep / layerStride) % layerCountNum : 0
	);
	const floorHit = $derived(currentStep % floorStride === 0);
	const layerHit = $derived(currentStep % layerStride === 0);

	const meter = $derived(Number(meterValue));
	const patterns = $derived(patternBank[meter]);
	const currentPattern = $derived(
		patterns.find((pattern) => pattern.id === patternId) ?? patterns[0]
	);
	const groupings = $derived(groupingPresets[meter]);
	const grouping = $derived(
		groupings.find((preset) => preset.id === groupingId) ?? groupings[0]
	);
	const activeSyllables = $derived(
		floorsMode ? floorSyllables[layerCountNum] ?? floorSyllables[1] : currentPattern.syllables
	);
	const engineSteps = $derived(floorsMode ? floorsLcm : activeSyllables.length);
	const playbackMultiplier = $derived(floorsLcm / floorDenomNum);
	const baseBpm = $derived(
		floorsMode && matchPlaybackBpm ? bpmValue / playbackMultiplier : bpmValue
	);
	const engineBpm = $derived(
		floorsMode ? baseBpm * playbackMultiplier : baseBpm
	);
	const playbackBpm = $derived.by(() => {
		if (autoAdvanceFloors && floorsMode && !matchPlaybackBpm && lockedPlaybackBpm !== null) {
			return lockedPlaybackBpm;
		}
		return engineBpm;
	});
	const displaySteps = $derived(floorsMode ? layerCountNum : activeSyllables.length);
	const stepIndices = $derived(Array.from({ length: displaySteps }, (_, index) => index));
	const floorIndices = $derived(Array.from({ length: floorDenomNum }, (_, index) => index));
	const layerIndices = $derived(Array.from({ length: layerCountNum }, (_, index) => index));
	const groupSegments = $derived(
		floorsMode
			? Array.from({ length: floorDenomNum }, (_, index) => ({
				start: index * layerCountNum,
				size: 1
			}))
			: grouping.groups.reduce((acc: { start: number; size: number }[], size) => {
				const start = acc.length ? acc[acc.length - 1].start + acc[acc.length - 1].size : 0;
				return [...acc, { start, size }];
			}, [])
	);
	const playheadLeft = $derived(`${(currentStep / Math.max(engineSteps, 1)) * 100}%`);
	const configKey = $derived(
		`${bpmValue}-${matchPlaybackBpm}-${meter}-${patternId}-${groupingId}-${countIn}-${pulseMix}-${subdivisionMix}-${groupAccentMode}-${learnMode}-${learnStep}-${floorsMode}-${floorDenom}-${layerCount}-${autoAdvanceFloors}-${barsPerFloor}-${dropoutEnabled}-${dropoutBarsOn}-${dropoutBarsSilent}-${dropoutDropPulse}-${dropoutDropSubdivision}`
	);
	const gridLabel = $derived(
		floorsMode
			? `Floor 1/${floorDenom} · Layer ${layerCount}/${floorDenom}`
			: `${meter} steps · ${grouping.label} · ${roleLabels[role]}`
	);
	const bpmLabel = $derived(
		floorsMode ? (matchPlaybackBpm ? 'Playback BPM' : 'Floor BPM') : 'Pulse BPM'
	);
	const nextLayerLabel = $derived.by(() => {
		if (!autoAdvanceFloors || !floorsMode) return null;
		return getNextLayerStep(layerCountNum, layerAdvanceDirection).value;
	});
	const laneLabels = $derived(
		floorsMode
			? { foot: `Floor`, clap: `Layer`, voice: `Konnakol` }
			: roleCopy[role].lanes
	);
	const roleStyle = $derived(
		role === 'drummer'
			? {
				foot: 'text-foreground',
				clap: 'text-foreground',
				voice: 'text-muted-foreground'
			}
			: role === 'singer'
				? {
					foot: 'text-muted-foreground',
					clap: 'text-muted-foreground',
					voice: 'text-foreground'
				}
				: {
					foot: 'text-foreground',
					clap: 'text-foreground',
					voice: 'text-foreground'
				}
	);
	const currentLearnStep = $derived(learnSteps[learnStep] ?? learnSteps[0]);
	const learnFocus = $derived(currentLearnStep.focus);
	const learnEmphasis = $derived({
		foot: learnMode && (learnFocus === 'foot' || learnFocus === 'all' || learnFocus === 'floors'),
		clap: learnMode && (learnFocus === 'clap' || learnFocus === 'all' || learnFocus === 'floors'),
		voice: learnMode && (learnFocus === 'voice' || learnFocus === 'all'),
		grouping: learnMode && learnFocus === 'grouping'
	});
	const groupingLevel = $derived(
		groupAccentMode === 'off' ? 0 : groupAccentMode === 'strong' ? 0.85 : 0.45
	);
	const effectiveMix = $derived.by(() => {
		if (!learnMode) {
			return {
				pulse: pulseMix / 100,
				subdivision: subdivisionMix / 100,
				grouping: groupingLevel
			};
		}
		if (learnFocus === 'grouping') {
			return {
				pulse: 0.1,
				subdivision: 0,
				grouping: 1
			};
		}
		if (learnFocus === 'foot') {
			return {
				pulse: 0.8,
				subdivision: 0.2,
				grouping: groupingLevel
			};
		}
		if (learnFocus === 'clap') {
			return {
				pulse: 0.2,
				subdivision: 0.8,
				grouping: groupingLevel
			};
		}
		if (learnFocus === 'voice') {
			return {
				pulse: 0.3,
				subdivision: 0.3,
				grouping: groupingLevel
			};
		}
		return {
			pulse: pulseMix / 100,
			subdivision: subdivisionMix / 100,
			grouping: groupingLevel
		};
	});

	const harmonyKeys = [
		{ label: 'C', pc: 0 },
		{ label: 'C#/Db', pc: 1 },
		{ label: 'D', pc: 2 },
		{ label: 'D#/Eb', pc: 3 },
		{ label: 'E', pc: 4 },
		{ label: 'F', pc: 5 },
		{ label: 'F#/Gb', pc: 6 },
		{ label: 'G', pc: 7 },
		{ label: 'G#/Ab', pc: 8 },
		{ label: 'A', pc: 9 },
		{ label: 'A#/Bb', pc: 10 },
		{ label: 'B', pc: 11 }
	];
	const harmonyFunctionsMajor = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
	const harmonyFunctionsMinor = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
	const circleOfFifths = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
	const harmonyTriads: { value: TriadType; label: string }[] = [
		{ value: 'major', label: 'Major' },
		{ value: 'minor', label: 'Minor' },
		{ value: 'diminished', label: 'Diminished' },
		{ value: 'augmented', label: 'Augmented' }
	];
	const harmonySevenths: { value: SeventhType; label: string }[] = [
		{ value: 'maj7', label: 'Major 7' },
		{ value: 'dom7', label: 'Dom 7' },
		{ value: 'min7', label: 'Minor 7' },
		{ value: 'm7b5', label: 'Half-dim 7' },
		{ value: 'dim7', label: 'Dim 7' },
		{ value: 'dom7b5', label: '7b5' },
		{ value: 'aug7', label: 'Aug 7' },
		{ value: 'dom7sus4', label: '7sus4' },
		{ value: 'dom9', label: '9' },
		{ value: 'dom7b9', label: '7b9' },
		{ value: 'dom7s9', label: '7#9' },
		{ value: 'dom7s9s5', label: '7#9#5' },
		{ value: 'dom7b9b5', label: '7b9b5' },
		{ value: 'minMaj7', label: 'min(maj7)' }
	];
	const majorScaleOffsets = [0, 2, 4, 5, 7, 9, 11];
	const minorScaleOffsets = [0, 2, 3, 5, 7, 8, 10];
	const majorQualities: TriadType[] = ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'];
	const minorQualities: TriadType[] = [
		'minor',
		'diminished',
		'major',
		'minor',
		'minor',
		'major',
		'major'
	];
	const majorSevenths: ChordQuality[] = ['maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'm7b5'];
	const minorSevenths: ChordQuality[] = ['min7', 'm7b5', 'maj7', 'min7', 'min7', 'maj7', 'dom7'];
	const harmonyKeyLabel = $derived(
		harmonyKeys.find((key) => String(key.pc) === harmonyKey)?.label ?? 'C'
	);
	const harmonyChordRootLabel = $derived(
		harmonyKeys.find((key) => String(key.pc) === harmonyChordRoot)?.label ?? 'C'
	);
	const melodyKeyLabel = $derived(
		harmonyKeys.find((key) => String(key.pc) === melodyKey)?.label ?? 'C'
	);
	const melodyNextKeyLabel = $derived((() => {
		if (!melodyAutoAdvanceKey) return null;
		const currentIndex = circleOfFifths.indexOf(Number(melodyKey));
		const nextIndex = (currentIndex + 1 + circleOfFifths.length) % circleOfFifths.length;
		const nextKeyPc = circleOfFifths[nextIndex];
		return harmonyKeys.find((key) => key.pc === nextKeyPc)?.label ?? 'C';
	})());
	const melodyDiatonicRow = $derived(
		melodyKeyMode === 'minor' ? DIATONIC_MINOR : DIATONIC_MAJOR
	);
	const melodyChromaticRow = $derived(
		FULL_DEGREES.filter((degree) => !melodyDiatonicRow.includes(degree))
	);
	const melodyDiatonicSelected = $derived(
		melodyDiatonicRow.filter((degree) => melodyAllowedDegrees.includes(degree))
	);
	const melodyChromaticSelected = $derived(
		melodyChromaticRow.filter((degree) => melodyAllowedDegrees.includes(degree))
	);
	const harmonyFunctionKeyLabel = $derived(
		harmonyKeys.find((key) => String(key.pc) === harmonyFunctionKey)?.label ?? 'C'
	);
	const melodyProgressPercent = $derived(
		melodyPhraseLength
			? Math.min(((melodyStep + 1) / melodyPhraseLength) * 100, 100)
			: 0
	);
	const melodySettingsKey = $derived(
		`${melodyPracticeMode}-${melodyScaleMode}-${melodyMode}-${melodyRepresentation}-${melodyKey}-${melodyKeyMode}-${melodyBpm}-${melodyPhraseLength}-${melodyLoopBars}-${melodyMaxLeap}-${melodyAutoAdvanceKey}-${melodyDroneOn}-${melodyStartOnTonic}-${
			melodyAllowedDegrees.join(',')
		}`
	);
	const harmonyFunctions = $derived(
		harmonyKeyMode === 'major' ? harmonyFunctionsMajor : harmonyFunctionsMinor
	);
	const harmonyFunctionIndex = $derived(harmonyFunctions.indexOf(harmonyFunction));
	const harmonyRootPc = $derived(
		(Number(harmonyFunctionKey) +
			(harmonyKeyMode === 'major'
				? majorScaleOffsets[harmonyFunctionIndex]
				: minorScaleOffsets[harmonyFunctionIndex])!) %
			12
	);
	const harmonyRootLabel = $derived(
		harmonyKeys.find((key) => key.pc === harmonyRootPc)?.label ?? 'C'
	);
	const harmonyDerivedTriad = $derived(
		harmonyKeyMode === 'major'
			? majorQualities[harmonyFunctionIndex]
			: minorQualities[harmonyFunctionIndex]
	);
	const harmonyDerivedSeventh = $derived(
		harmonyKeyMode === 'major'
			? majorSevenths[harmonyFunctionIndex]
			: minorSevenths[harmonyFunctionIndex]
	);
	const harmonyDerivedQuality = $derived(
		harmonyChordSet === 'triads' ? harmonyDerivedTriad : harmonyDerivedSeventh
	);
	const harmonyContrastQuality = $derived<ChordQuality>(
		harmonyChordSet === 'triads' ? harmonyContrastTriad : harmonyContrastSeventh
	);
	const harmonyContrastQualityLabel = $derived.by(() => {
		const set = harmonyChordSet === 'triads' ? harmonyTriads : harmonySevenths;
		return set.find((c) => c.value === harmonyContrastQuality)?.label ?? String(harmonyContrastQuality);
	});
	const harmonyNowHearing = $derived(
		harmonyContrastOn
			? `${harmonyFunction} in ${harmonyFunctionKeyLabel} → ${harmonyRootLabel} ${harmonyDerivedQuality} vs ${harmonyContrastQualityLabel}`
			: `${harmonyFunction} in ${harmonyFunctionKeyLabel} → ${harmonyRootLabel} ${harmonyDerivedQuality}`
	);
	const harmonyChordQualityLabel = $derived.by(() => {
		const set = harmonyChordSet === 'triads' ? harmonyTriads : harmonySevenths;
		return set.find((chord) => chord.value === (harmonyChordSet === 'triads' ? harmonyTriad : harmonySeventh))
			?.label ?? (harmonyChordSet === 'triads' ? harmonyTriad : harmonySeventh);
	});
	const harmonyLoopBarsNum = $derived(Math.max(1, Number(harmonyLoopBars) || 1));
	const harmonySimpleNowHearing = $derived(
		`${harmonyChordRootLabel} ${harmonyChordQualityLabel} over ${harmonyKeyLabel}`
	);
	const harmonyInversionLabel = $derived(
		harmonyInversion === 0 ? 'Root position' : harmonyInversion === 1 ? '1st inversion' : '2nd inversion'
	);

	$effect(() => {
		if (!patterns.find((pattern) => pattern.id === patternId)) {
			patternId = patterns[0].id;
		}
	});

	$effect(() => {
		if (!groupings.find((preset) => preset.id === groupingId)) {
			groupingId = groupings[0].id;
		}
	});

	$effect(() => {
		if (!settingsHydrated) {
			lastRole = role;
			return;
		}
		if (role !== lastRole) {
			const preset = rolePresets[role];
			bpmValue = preset.bpm;
			countIn = preset.countIn;
			lastRole = role;
		}
	});

	$effect(() => {
		if (isPlaying && configKey !== lastConfigKey) {
			if (!suppressRestart) {
				stopPlayback();
				startPlayback();
			}
		}
		suppressRestart = false;
		lastConfigKey = configKey;
	});

	$effect(() => {
		if (!floorsMode || !autoAdvanceFloors || matchPlaybackBpm) {
			lockedPlaybackBpm = null;
			return;
		}
		if (lockedPlaybackBpm === null && isPlaying) {
			lockedPlaybackBpm = engineBpm;
		}
	});

	$effect(() => {
		if (!autoAdvanceFloors) return;
		if (!floorsMode) return;
		barsRemainingInFloor = barsPerFloor;
		layerAdvanceDirection = 1;
		if (layerCountNum < 1) {
			layerCount = '1';
		} else if (layerCountNum > maxLayerCount) {
			layerCount = String(maxLayerCount);
		}
	});

	$effect(() => {
		if (!floorsMode) {
			lastMatchPlaybackBpm = matchPlaybackBpm;
			return;
		}
		if (matchPlaybackBpm && !lastMatchPlaybackBpm) {
			bpmValue = Math.round(playbackBpm);
		}
		lastMatchPlaybackBpm = matchPlaybackBpm;
	});

	$effect(() => {
		if (phase === 'harmony') {
			stopPlayback();
		} else {
			harmonyEngine.stopDrone();
			stopHarmonyLoop();
		}
	});

	const harmonyLoopConfigKey = $derived(`${bpmValue}-${meter}-${harmonyLoopBars}`);
	const harmonyChordKey = $derived(
		`${harmonyChordRoot}-${harmonyChordSet}-${harmonyTriad}-${harmonySeventh}-${harmonyKey}`
	);

	$effect(() => {
		if (!harmonyLoopActive) {
			lastHarmonyLoopConfigKey = harmonyLoopConfigKey;
			return;
		}
		if (harmonyLoopConfigKey === lastHarmonyLoopConfigKey) return;
		lastHarmonyLoopConfigKey = harmonyLoopConfigKey;
		stopHarmonyLoop();
		void playHarmonyChord(true);
	});

	$effect(() => {
		if (!harmonyLoopActive) {
			lastHarmonyChordKey = harmonyChordKey;
			return;
		}
		if (harmonyChordKey === lastHarmonyChordKey) return;
		lastHarmonyChordKey = harmonyChordKey;
		void playHarmonyChord(false);
	});

	$effect(() => {
		if (!harmonyLoopOn) {
			stopHarmonyLoop();
		}
	});

	$effect(() => {
		if (phase !== 'melody') {
			stopMelody();
		}
	});

	$effect(() => {
		if (!harmonyFunctions.includes(harmonyFunction)) {
			harmonyFunction = harmonyFunctions[0];
		}
	});

	$effect(() => {
		harmonyEngine.setKeyPc(Number(harmonyKey));
	});

	$effect(() => {
		harmonyEngine.setDroneVolume(harmonyDroneVolume / 100);
	});

	$effect(() => {
		harmonyEngine.setDroneBlend(harmonyDroneBlend / 100);
	});

	$effect(() => {
		if (!harmonyAudioReady) return;
		if (harmonyDroneOn) {
			harmonyEngine.startDrone();
		} else {
			harmonyEngine.stopDrone();
		}
	});

	$effect(() => {
		if (!melodyPlaying && melodyMode === 'passive') {
			generateMelodyPhrase();
		}
	});

	$effect(() => {
		if (melodyPlaying && melodySettingsKey !== melodyConfigKey) {
			stopMelody();
			void startMelody();
		}
		melodyConfigKey = melodySettingsKey;
	});

	$effect(() => {
		if (!melodyAudioReady) return;
		if (melodyDroneOn) {
			melodyEngine.startDrone();
		} else {
			melodyEngine.stopDrone();
		}
	});

	const nextLearnStep = () => {
		if (learnStep < learnSteps.length - 1) {
			learnStep += 1;
		} else {
			learnMode = false;
			learnSkipped = true;
		}
	};

	const prevLearnStep = () => {
		if (learnStep > 0) learnStep -= 1;
	};

	const exitLearnMode = () => {
		learnMode = false;
		learnSkipped = true;
	};

	const toggleLearnMode = () => {
		learnMode = !learnMode;
		if (learnMode) {
			learnStep = 0;
			learnSkipped = false;
		}
	};

	const advanceHarmonyKey = () => {
		const currentIndex = circleOfFifths.indexOf(Number(harmonyFunctionKey));
		const direction = Number(harmonyFifthsDirection) as 1 | -1;
		const nextIndex = (currentIndex + direction + circleOfFifths.length) % circleOfFifths.length;
		harmonyFunctionKey = String(circleOfFifths[nextIndex]);
	};

	const stopHarmonyLoop = () => {
		if (harmonyLoopTimer) {
			clearInterval(harmonyLoopTimer);
			harmonyLoopTimer = null;
		}
		harmonyLoopActive = false;
	};

	const ensureHarmonySamples = async () => {
		if (harmonySamplesReady) return;
		if (harmonySamplesPromise) return harmonySamplesPromise;
		harmonySamplesPromise = (async () => {
			harmonySamplesLoading = true;
			try {
				await harmonyEngine.loadSampler();
				harmonySamplesReady = true;
			} finally {
				harmonySamplesLoading = false;
				harmonySamplesPromise = null;
			}
		})();
		return harmonySamplesPromise;
	};

	const preloadHarmonySamples = () => {
		if (harmonyPreloadTriggered || harmonySamplesReady) return;
		harmonyPreloadTriggered = true;
		void ensureHarmonySamples();
	};

	const playHarmonyChord = async (startLoop = false) => {
		await unlockHarmonyAudio();
		preloadHarmonySamples();
		const inversion = Math.floor(Math.random() * 3) as 0 | 1 | 2;
		harmonyInversion = inversion;
		harmonyEngine.playChord({
			rootPc: Number(harmonyChordRoot),
			quality: harmonyChordSet === 'triads' ? harmonyTriad : harmonySeventh,
			inversion
		});
		lastHarmonyChordKey = harmonyChordKey;
		if (startLoop && harmonyLoopOn) {
			stopHarmonyLoop();
			const intervalMs = Math.max(200, Math.round((60_000 / bpmValue) * meter * harmonyLoopBarsNum));
			harmonyLoopTimer = setInterval(() => {
				harmonyEngine.playChord({
					rootPc: Number(harmonyChordRoot),
					quality: harmonyChordSet === 'triads' ? harmonyTriad : harmonySeventh,
					inversion: Math.floor(Math.random() * 3) as 0 | 1 | 2
				});
			}, intervalMs);
			harmonyLoopActive = true;
			lastHarmonyLoopConfigKey = harmonyLoopConfigKey;
		}
	};

	const playFunctionChord = async () => {
		await unlockHarmonyAudio();
		preloadHarmonySamples();
		const inversion = Math.floor(Math.random() * 3) as 0 | 1 | 2;
		harmonyInversion = inversion;
		const primaryQuality =
			harmonyChordMode === 'function'
				? harmonyDerivedQuality
				: harmonyChordSet === 'triads'
					? harmonyTriad
					: harmonySeventh;
		harmonyEngine.playChord({
			rootPc: harmonyRootPc,
			quality: primaryQuality,
			inversion
		});
		if (harmonyContrastOn) {
			setTimeout(() => {
				harmonyEngine.playChord({
					rootPc: harmonyRootPc,
					quality: harmonyContrastQuality,
					inversion
				});
			}, 800);
		}
		if (harmonyQuizMode) harmonyReveal = false;
		if (harmonyAdvanceKey) {
			advanceHarmonyKey();
		}
	};

	const generateMelodyPhrase = () => {
		let allowed = melodyAllowedDegrees;
		let nextKeyPc = Number(melodyKey);
		if (melodyPracticeMode === 'scale') {
			allowed = SCALE_DEGREES[melodyScaleMode];
		} else if (melodyPracticeMode === 'single') {
			const candidates = melodyAllowedDegrees.length ? melodyAllowedDegrees : melodyDiatonicRow;
			const degree = shuffle(candidates)[0] ?? '1';
			const offset = DEGREE_OFFSETS[degree] ?? 0;
			nextKeyPc = (FIXED_SINGLE_MIDI - 60 - offset + 1200) % 12;
			allowed = [degree];
			melodySingleCorrect = degree;
			melodySingleChoices = shuffle(Array.from(new Set([degree, ...melodyDiatonicRow]))).slice(0, 4);
			melodySingleFeedback = 'idle';
			melodyKey = String(nextKeyPc);
		}
		melodyEngine.setConfig({
			bpm: melodyBpm,
			keyPc: nextKeyPc,
			mode: melodyKeyMode,
			phraseLength: melodyPracticeMode === 'single' ? 1 : melodyPhraseLength,
			loopBars: melodyLoopBars,
			maxLeap: melodyMaxLeap,
			loop: melodyMode === 'passive',
			countInBars: 1,
			regenerateOnLoop: melodyMode === 'passive',
			allowedDegrees: allowed,
			startOnTonic: melodyStartOnTonic
		} as Partial<MelodyEngineConfig>);
		melodyEngine.generatePhrase();
	};

	const startMelody = async () => {
		await unlockMelodyAudio();
		melodyFeedback = 'idle';
		melodyReveal = false;
		melodyInput = [];
		if (melodyPracticeMode === 'scale') {
			melodyScaleCorrect = melodyScaleMode;
			melodyScaleChoices = shuffle([...SCALE_OPTIONS]);
			melodyScaleFeedback = 'idle';
		}
		if (melodyMode === 'passive' || melodyDegrees.length === 0) {
			generateMelodyPhrase();
		}
		melodyEngine.start();
		if (melodyDroneOn) melodyEngine.startDrone();
		melodyPlaying = true;
	};

	const stopMelody = () => {
		melodyEngine.stop();
		melodyEngine.stopDrone();
		melodyPlaying = false;
		melodyStage = 'idle';
		melodyStep = 0;
	};

	const toggleMelodyPlayback = () => {
		if (melodyPlaying) stopMelody();
		else void startMelody();
	};

	const onTapMelodyDegree = (degree: string) => {
		if (melodyMode !== 'interactive') return;
		if (melodyInput.length >= melodyPhraseLength) return;
		melodyInput = [...melodyInput, degree];
	};

	const submitMelody = () => {
		const isCorrect =
			melodyInput.length === melodyDegrees.length &&
			melodyInput.every((value, index) => value === melodyDegrees[index]);
		melodyFeedback = isCorrect ? 'correct' : 'incorrect';
	};

	const submitMelodyScale = (choice: (typeof SCALE_OPTIONS)[number]) => {
		melodyScaleFeedback = choice === melodyScaleCorrect ? 'correct' : 'incorrect';
	};

	const submitMelodySingle = (choice: string) => {
		melodySingleFeedback = choice === melodySingleCorrect ? 'correct' : 'incorrect';
	};

	const clearMelodyInput = () => {
		melodyInput = [];
	};

	const backspaceMelodyInput = () => {
		melodyInput = melodyInput.slice(0, -1);
	};

	onMount(() => {
		if (typeof window === 'undefined') return;
		const raw = window.localStorage.getItem('rhythm-console');
		const shared = window.localStorage.getItem('tm:melodySettings');
		if (raw) {
			try {
					const saved = JSON.parse(raw) as Partial<{
						phase: Phase;
						role: Role;
						bpm: number;
						matchPlaybackBpm: boolean;
						meterValue: string;
						patternId: string;
						groupingId: string;
						countIn: boolean;
						learnMode: boolean;
						learnStep: number;
						learnSkipped: boolean;
						pulseMix: number;
						subdivisionMix: number;
						groupAccentMode: 'off' | 'soft' | 'strong';
						floorsMode: boolean;
						floorDenom: string;
						layerCount: string;
						autoAdvanceFloors: boolean;
						barsPerFloor: number;
						harmonyKey: string;
						harmonyChordRoot: string;
						harmonyFunctionKey: string;
						harmonyKeyMode: 'major' | 'minor';
						harmonyChordMode: 'function' | 'free';
						harmonyChordSet: 'triads' | 'sevenths';
						harmonyAdvanceKey: boolean;
						harmonyFifthsDirection: '1' | '-1';
						harmonyFunction: string;
						harmonyTriad: TriadType;
						harmonySeventh: SeventhType;
						harmonyDroneOn: boolean;
						harmonyDroneVolume: number;
						harmonyDroneBlend: number;
						harmonyQuizMode: boolean;
						harmonyContrastOn: boolean;
						harmonyContrastTriad: TriadType;
						harmonyContrastSeventh: SeventhType;
						harmonyLoopOn: boolean;
						harmonyLoopBars: string | number;
						melodyMode: 'interactive' | 'passive';
						melodyPracticeMode: 'phrase' | 'scale' | 'single';
						melodyScaleMode: (typeof SCALE_OPTIONS)[number];
						melodyShowScaleNames: boolean;
						melodyStartOnTonic: boolean;
						melodyRepresentation: 'solfege' | 'numbers';
						melodyKey: string;
						melodyKeyMode: 'major' | 'minor';
						melodyBpm: number;
						melodyPhraseLength: number;
						melodyLoopBars: number;
						melodyMaxLeap: number;
						melodyAutoAdvanceKey: boolean;
						melodyDroneOn: boolean;
						melodyAllowedDegrees: string[];
					}>;
			if (showPhaseToggle && saved.phase && phaseOptions.includes(saved.phase)) phase = saved.phase;
				if (saved.role && roleOptions.includes(saved.role)) role = saved.role;
					if (typeof saved.bpm === 'number') bpmValue = saved.bpm;
										if (typeof saved.matchPlaybackBpm === 'boolean')
											matchPlaybackBpm = saved.matchPlaybackBpm;
				if (typeof saved.meterValue === 'string') meterValue = saved.meterValue;
				if (typeof saved.patternId === 'string') patternId = saved.patternId;
				if (typeof saved.groupingId === 'string') groupingId = saved.groupingId;
					if (typeof saved.countIn === 'boolean') countIn = saved.countIn;
					if (typeof saved.learnMode === 'boolean') learnMode = saved.learnMode;
					if (typeof saved.learnStep === 'number') learnStep = saved.learnStep;
					if (typeof saved.learnSkipped === 'boolean') learnSkipped = saved.learnSkipped;
					if (typeof saved.pulseMix === 'number') pulseMix = saved.pulseMix;
					if (typeof saved.subdivisionMix === 'number') subdivisionMix = saved.subdivisionMix;
					if (saved.groupAccentMode) groupAccentMode = saved.groupAccentMode;
					if (typeof saved.floorsMode === 'boolean') floorsMode = saved.floorsMode;
					if (typeof saved.floorDenom === 'string') floorDenom = saved.floorDenom;
					if (typeof saved.layerCount === 'string') layerCount = saved.layerCount;
					if (typeof saved.autoAdvanceFloors === 'boolean')
						autoAdvanceFloors = saved.autoAdvanceFloors;
					if (typeof saved.barsPerFloor === 'number') barsPerFloor = saved.barsPerFloor;
					if (typeof (saved as any).dropoutEnabled === 'boolean') dropoutEnabled = (saved as any).dropoutEnabled;
					if (typeof (saved as any).dropoutBarsOn === 'number') dropoutBarsOn = (saved as any).dropoutBarsOn;
					if (typeof (saved as any).dropoutBarsSilent === 'number') dropoutBarsSilent = (saved as any).dropoutBarsSilent;
					if (typeof (saved as any).dropoutDropPulse === 'boolean') dropoutDropPulse = (saved as any).dropoutDropPulse;
					if (typeof (saved as any).dropoutDropSubdivision === 'boolean') dropoutDropSubdivision = (saved as any).dropoutDropSubdivision;
					if (typeof saved.harmonyKey === 'string') harmonyKey = saved.harmonyKey;
					if (typeof saved.harmonyChordRoot === 'string') {
						harmonyChordRoot = saved.harmonyChordRoot;
					} else if (typeof saved.harmonyKey === 'string') {
						harmonyChordRoot = saved.harmonyKey;
					}
					if (typeof saved.harmonyFunctionKey === 'string')
						harmonyFunctionKey = saved.harmonyFunctionKey;
					if (saved.harmonyKeyMode) harmonyKeyMode = saved.harmonyKeyMode;
					if (saved.harmonyChordMode) harmonyChordMode = saved.harmonyChordMode;
					if (saved.harmonyChordSet) harmonyChordSet = saved.harmonyChordSet;
					if (typeof saved.harmonyAdvanceKey === 'boolean')
						harmonyAdvanceKey = saved.harmonyAdvanceKey;
					if (saved.harmonyFifthsDirection)
						harmonyFifthsDirection = saved.harmonyFifthsDirection;
					if (typeof saved.harmonyFunction === 'string') harmonyFunction = saved.harmonyFunction;
					if (saved.harmonyTriad) harmonyTriad = saved.harmonyTriad;
					if (saved.harmonySeventh) harmonySeventh = saved.harmonySeventh;
				if (typeof saved.harmonyDroneOn === 'boolean') harmonyDroneOn = saved.harmonyDroneOn;
				if (typeof saved.harmonyDroneVolume === 'number')
					harmonyDroneVolume = saved.harmonyDroneVolume;
				if (typeof saved.harmonyDroneBlend === 'number')
					harmonyDroneBlend = saved.harmonyDroneBlend;
					if (typeof saved.harmonyQuizMode === 'boolean')
						harmonyQuizMode = saved.harmonyQuizMode;
					if (typeof saved.harmonyContrastOn === 'boolean')
						harmonyContrastOn = saved.harmonyContrastOn;
					if (saved.harmonyContrastTriad)
						harmonyContrastTriad = saved.harmonyContrastTriad;
					if (saved.harmonyContrastSeventh)
						harmonyContrastSeventh = saved.harmonyContrastSeventh;
					if (typeof saved.harmonyLoopOn === 'boolean') harmonyLoopOn = saved.harmonyLoopOn;
					if (typeof saved.harmonyLoopBars === 'string') harmonyLoopBars = saved.harmonyLoopBars;
					if (typeof saved.harmonyLoopBars === 'number')
						harmonyLoopBars = String(saved.harmonyLoopBars);
					if (saved.melodyMode) melodyMode = saved.melodyMode;
					if (saved.melodyPracticeMode) melodyPracticeMode = saved.melodyPracticeMode;
					if (saved.melodyScaleMode) melodyScaleMode = saved.melodyScaleMode;
					if (typeof saved.melodyShowScaleNames === 'boolean')
						melodyShowScaleNames = saved.melodyShowScaleNames;
					if (typeof saved.melodyStartOnTonic === 'boolean')
						melodyStartOnTonic = saved.melodyStartOnTonic;
					if (saved.melodyRepresentation) melodyRepresentation = saved.melodyRepresentation;
					if (typeof saved.melodyKey === 'string') melodyKey = saved.melodyKey;
					if (saved.melodyKeyMode) melodyKeyMode = saved.melodyKeyMode;
					if (typeof saved.melodyBpm === 'number') melodyBpm = saved.melodyBpm;
					if (typeof saved.melodyPhraseLength === 'number')
						melodyPhraseLength = saved.melodyPhraseLength;
					if (typeof saved.melodyLoopBars === 'number') melodyLoopBars = saved.melodyLoopBars;
					if (typeof saved.melodyMaxLeap === 'number') melodyMaxLeap = saved.melodyMaxLeap;
					if (typeof saved.melodyAutoAdvanceKey === 'boolean')
						melodyAutoAdvanceKey = saved.melodyAutoAdvanceKey;
					if (typeof saved.melodyDroneOn === 'boolean') melodyDroneOn = saved.melodyDroneOn;
					if (Array.isArray(saved.melodyAllowedDegrees))
						melodyAllowedDegrees = saved.melodyAllowedDegrees;
				} catch (error) {
					console.warn('Failed to load rhythm settings', error);
				}
			}
			if (shared) {
				try {
					const saved = JSON.parse(shared) as Partial<{ allowedDegrees: string[] }>;
					if (Array.isArray(saved.allowedDegrees)) melodyAllowedDegrees = saved.allowedDegrees;
				} catch {
					// ignore
				}
			}
		if (!raw && !learnSkipped) {
			learnMode = true;
			learnStep = 0;
		}
		settingsHydrated = true;
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		window.localStorage.setItem(
			'rhythm-console',
			JSON.stringify({
				phase,
				role,
					bpm: bpmValue,
					matchPlaybackBpm,
					meterValue,
					patternId,
					groupingId,
					countIn,
					learnMode,
					learnStep,
					learnSkipped,
					pulseMix,
					subdivisionMix,
					groupAccentMode,
					floorsMode,
					floorDenom,
					layerCount,
					autoAdvanceFloors,
					barsPerFloor,
					dropoutEnabled,
					dropoutBarsOn,
					dropoutBarsSilent,
					dropoutDropPulse,
					dropoutDropSubdivision,
				harmonyKey,
				harmonyChordRoot,
				harmonyFunctionKey,
				harmonyKeyMode,
				harmonyChordMode,
				harmonyChordSet,
				harmonyAdvanceKey,
				harmonyFifthsDirection,
				harmonyFunction,
				harmonyTriad,
				harmonySeventh,
				harmonyDroneOn,
				harmonyDroneVolume,
				harmonyDroneBlend,
				harmonyQuizMode,
				harmonyContrastOn,
				harmonyContrastTriad,
				harmonyContrastSeventh,
				harmonyLoopOn,
				harmonyLoopBars,
					melodyMode,
					melodyPracticeMode,
					melodyScaleMode,
					melodyShowScaleNames,
					melodyStartOnTonic,
					melodyRepresentation,
				melodyKey,
				melodyKeyMode,
				melodyBpm,
				melodyPhraseLength,
				melodyLoopBars,
				melodyMaxLeap,
					melodyAutoAdvanceKey,
					melodyDroneOn,
					melodyAllowedDegrees
			})
		);
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		window.localStorage.setItem(
			'tm:melodySettings',
			JSON.stringify({ allowedDegrees: melodyAllowedDegrees })
		);
	});

	$effect(() => {
		if (!melodyAllowedDegrees.length) {
			melodyAllowedDegrees = [...melodyDiatonicRow];
		}
	});

	onDestroy(() => {
		engine.stop();
		harmonyEngine.stopDrone();
		stopHarmonyLoop();
		melodyEngine.stop();
		melodyEngine.stopDrone();
	});
</script>

<div class="min-h-screen px-6 py-10 pb-32 lg:px-10 lg:pb-10">
	<div class="mx-auto flex max-w-6xl flex-col gap-6 lg:gap-8">
		<header class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
			<div class="space-y-2">
				<div class="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
					{phaseLabels[phase]}
				</div>
			<h1 class="font-display text-2xl font-semibold text-foreground md:text-4xl">
				{consoleTitle}
			</h1>
			{#if phase === 'rhythm'}
				<p class="hidden max-w-xl text-sm text-muted-foreground md:block md:text-base">
					{roleCopy[role].header} {roleCopy[role].instructions}
				</p>
			{:else if phase === 'harmony'}
				<p class="hidden max-w-xl text-sm text-muted-foreground md:block md:text-base">
					Hear a chord against a tonic drone and listen for how it feels.
				</p>
			{:else}
				<p class="hidden max-w-xl text-sm text-muted-foreground md:block md:text-base">
					Movable Do phrases with adjustable range, leap size, and loop length.
				</p>
			{/if}
				<p class="text-xs text-muted-foreground">
					iOS: Silent Mode mutes web audio. Flip the ring switch if you hear nothing.
				</p>
				{#if showPhaseToggle}
					<ToggleGroup.Root type="single" bind:value={phase} class="mt-3 flex flex-wrap gap-2">
						{#each phaseOptions as option}
							<ToggleGroup.Item value={option} class="px-4 text-xs">
								{phaseLabels[option]}
							</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
				{/if}
			</div>
		<div class="hidden items-center gap-3 lg:flex">
			<Badge class="px-3 py-1 text-xs">Studio Console</Badge>
			{#if phase === 'rhythm'}
				<Badge variant="secondary" class="px-3 py-1 text-xs">
					{roleLabels[role]}
				</Badge>
				<Badge variant="secondary" class="px-3 py-1 text-xs">
					Odd meter focus
				</Badge>
			{:else if phase === 'harmony'}
				<Badge variant="secondary" class="px-3 py-1 text-xs">
					Function + inversion
				</Badge>
				<Badge variant="secondary" class="px-3 py-1 text-xs">
					Drone anchored
				</Badge>
			{:else}
				<Badge variant="secondary" class="px-3 py-1 text-xs">
					Movable Do
				</Badge>
				<Badge variant="secondary" class="px-3 py-1 text-xs">
					Phrase builder
				</Badge>
			{/if}
		</div>
		</header>

		{#if phase === 'rhythm'}
		<div class="flex flex-col gap-6 lg:grid lg:grid-cols-[320px,1fr]">
			<aside class="order-2 space-y-6 lg:order-none">
				<div class="space-y-4 lg:hidden">
				<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
						<Card.Header>
							<Card.Title class="font-display text-lg">Role</Card.Title>
							<Card.Description>Pick a focus for this session.</Card.Description>
						</Card.Header>
						<Card.Content class="space-y-3">
							<ToggleGroup.Root type="single" bind:value={role} class="flex flex-wrap gap-2">
								{#each roleOptions as roleValue}
									<ToggleGroup.Item value={roleValue} class="px-3 text-xs capitalize">
										{roleLabels[roleValue]}
									</ToggleGroup.Item>
								{/each}
							</ToggleGroup.Root>
							<div class="rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
								{roleCopy[role].instructions}
							</div>
							<div class="flex items-center justify-between rounded-lg border border-border/60 bg-[var(--surface-2)] px-3 py-2">
								<span class="text-xs text-muted-foreground">Learn mode</span>
								<Button
									size="sm"
									variant={learnMode ? 'default' : 'secondary'}
									onclick={toggleLearnMode}
								>
									{learnMode ? 'On' : 'Off'}
								</Button>
							</div>
						</Card.Content>
					</Card.Root>

					<details class="rounded-xl border border-border/60 bg-card/80 p-4 shadow-none backdrop-blur lg:shadow-lg">
						<summary class="flex cursor-pointer items-center justify-between text-sm font-semibold">
							Pulse & Meter
							<span class="text-xs text-muted-foreground">{Math.round(playbackBpm)} bpm · {meter}</span>
						</summary>
						<div class="mt-4 space-y-4">
							<div class="space-y-2">
								<div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									<span>{bpmLabel}</span>
									<span class="text-foreground">{Math.round(playbackBpm)}</span>
							</div>
							<Slider type="single" min={40} max={180} step={1} bind:value={bpmValue} />
							<div class="mt-2 text-xs text-muted-foreground">
								Playback BPM: {Math.round(playbackBpm)}
								{#if floorsMode && !autoAdvanceFloors}
									<span class="ml-2">
										= {Math.round(baseBpm)} × {playbackMultiplier.toFixed(2)}
									</span>
								{/if}
							</div>
						</div>
						{#if floorsMode}
							<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
								<div>
									<div class="text-sm font-semibold">Match playback BPM</div>
									<div class="text-xs text-muted-foreground">
										Slider controls actual playback tempo.
									</div>
								</div>
								<Switch bind:checked={matchPlaybackBpm} />
							</div>
						{/if}
							<div class="hidden lg:block">
								<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Meter
								</div>
								<ToggleGroup.Root type="single" bind:value={meterValue} class="mt-2 flex flex-wrap gap-2">
									{#each meterOptions as value}
										<ToggleGroup.Item value={value} class="px-3">
											{value}
										</ToggleGroup.Item>
									{/each}
								</ToggleGroup.Root>
							</div>
							<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
								<div>
									<div class="text-sm font-semibold">Count-in bar</div>
									<div class="text-xs text-muted-foreground">One bar before playback.</div>
								</div>
								<Switch bind:checked={countIn} />
							</div>
						</div>
					</details>

					<details class="rounded-xl border border-border/60 bg-card/80 p-4 shadow-none backdrop-blur lg:shadow-lg">
						<summary class="flex cursor-pointer items-center justify-between text-sm font-semibold">
							Rhythmic floors
							<span class="text-xs text-muted-foreground">
								{floorsMode ? `On · ${layerCount}/${floorDenom}` : 'Off'}
							</span>
						</summary>
						<div class="mt-4 space-y-4">
							<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
								<div>
									<div class="text-sm font-semibold">Enable floors</div>
									<div class="text-xs text-muted-foreground">Layer pulses inside a floor.</div>
								</div>
								<Switch bind:checked={floorsMode} />
							</div>
							{#if floorsMode}
								<div class="space-y-2">
									<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Floor denominator
									</div>
									<ToggleGroup.Root type="single" bind:value={floorDenom} class="flex flex-wrap gap-2">
										{#each floorOptions as value}
											<ToggleGroup.Item value={value} class="px-3 text-xs">
												1/{value}
											</ToggleGroup.Item>
										{/each}
									</ToggleGroup.Root>
								</div>
								<div class="space-y-2">
									<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Layer count
									</div>
									<ToggleGroup.Root type="single" bind:value={layerCount} class="flex flex-wrap gap-2">
										{#each layerOptions as value}
											<ToggleGroup.Item value={value} class="px-3 text-xs">
												{value}/{floorDenom}
											</ToggleGroup.Item>
										{/each}
									</ToggleGroup.Root>
								</div>
							<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
								<div>
									<div class="text-sm font-semibold">Auto‑advance layers</div>
									<div class="text-xs text-muted-foreground">
										Ping‑pong 1→8→1 inside the current floor.
									</div>
								</div>
								<Switch bind:checked={autoAdvanceFloors} />
							</div>
							{#if autoAdvanceFloors}
								<div class="space-y-2">
									<div class="flex items-center justify-between text-xs text-muted-foreground">
										<span>Bars per floor</span>
										<span class="text-foreground">{barsPerFloor}</span>
									</div>
									<Slider type="single" min={2} max={16} step={1} bind:value={barsPerFloor} />
								</div>
								<div class="text-xs text-muted-foreground">
									Now: {layerCount}/{floorDenom}
									{#if nextLayerLabel}
										<span class="ml-2">
											Next: {nextLayerLabel}/{floorDenom} in {barsRemainingInFloor} bars
										</span>
									{/if}
								</div>
							{/if}
						{/if}
						</div>
					</details>

					{#if !learnMode && !floorsMode}
						<details class="rounded-xl border border-border/60 bg-card/80 p-4 shadow-none backdrop-blur lg:shadow-lg">
						<summary class="flex cursor-pointer items-center justify-between text-sm font-semibold">
							Grouping
							<span class="text-xs text-muted-foreground">{grouping.label}</span>
						</summary>
						<div class="mt-4 space-y-4">
							<ToggleGroup.Root type="single" bind:value={groupingId} class="flex flex-wrap gap-2">
								{#each groupings as preset}
									<ToggleGroup.Item value={preset.id} class="px-3 text-xs">
										{preset.label}
									</ToggleGroup.Item>
								{/each}
							</ToggleGroup.Root>
							<div class="space-y-2 text-xs text-muted-foreground">
								<div class="flex items-center justify-between">
									<span>{roleCopy[role].lanes.foot}</span>
									<span>Group accents</span>
								</div>
								<div class="flex items-center justify-between">
									<span>{roleCopy[role].lanes.clap}</span>
									<span>Every subdivision</span>
								</div>
								<div class="flex items-center justify-between">
									<span>{roleCopy[role].lanes.voice}</span>
									<span>Konnakol syllables</span>
								</div>
							</div>
						</div>
						</details>
					{/if}

					{#if !learnMode}
						<details class="rounded-xl border border-border/60 bg-card/80 p-4 shadow-none backdrop-blur lg:shadow-lg">
							<summary class="flex cursor-pointer items-center justify-between text-sm font-semibold">
								Sound
								<span class="text-xs text-muted-foreground">Pulse + Group</span>
							</summary>
							<div class="mt-4 space-y-4">
								<div class="space-y-2">
									<div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										<span>Pulse level</span>
										<span class="text-foreground">{pulseMix}%</span>
									</div>
									<Slider type="single" min={0} max={100} step={5} bind:value={pulseMix} />
								</div>
								<div class="space-y-2">
									<div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										<span>Subdivision level</span>
										<span class="text-foreground">{subdivisionMix}%</span>
									</div>
									<Slider type="single" min={0} max={100} step={5} bind:value={subdivisionMix} />
								</div>
								<div class="space-y-2">
									<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Group accent
									</div>
									<ToggleGroup.Root type="single" bind:value={groupAccentMode} class="flex flex-wrap gap-2">
										<ToggleGroup.Item value="off" class="px-3 text-xs">Off</ToggleGroup.Item>
										<ToggleGroup.Item value="soft" class="px-3 text-xs">Soft</ToggleGroup.Item>
										<ToggleGroup.Item value="strong" class="px-3 text-xs">Strong</ToggleGroup.Item>
									</ToggleGroup.Root>
								</div>
							</div>
						</details>
					{/if}

					{#if !learnMode && !floorsMode}
						<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
						<Card.Header>
							<Card.Title class="font-display text-lg">Pattern</Card.Title>
							<Card.Description>Open the full-screen pattern list.</Card.Description>
						</Card.Header>
						<Card.Content>
							<Button variant="secondary" class="w-full" onclick={() => (patternSheetOpen = true)}>
								Choose pattern
							</Button>
						</Card.Content>
						</Card.Root>
					{/if}
				</div>

				<div class="hidden space-y-6 lg:block">
					<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
					<Card.Header>
						<Card.Title class="font-display text-lg">Role</Card.Title>
						<Card.Description>Optimize the exercise for how you play.</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-4" on:click={preloadHarmonySamples}>
						<ToggleGroup.Root type="single" bind:value={role} class="flex flex-wrap gap-2">
							{#each roleOptions as roleValue}
								<ToggleGroup.Item value={roleValue} class="px-3 text-xs capitalize">
									{roleLabels[roleValue]}
								</ToggleGroup.Item>
							{/each}
						</ToggleGroup.Root>
						<div class="rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
							{roleCopy[role].instructions}
						</div>
						<div class="flex items-center justify-between rounded-lg border border-border/60 bg-[var(--surface-2)] px-3 py-2">
							<span class="text-xs text-muted-foreground">Learn mode</span>
							<Button
								size="sm"
								variant={learnMode ? 'default' : 'secondary'}
								onclick={toggleLearnMode}
							>
								{learnMode ? 'On' : 'Off'}
							</Button>
						</div>
					</Card.Content>
				</Card.Root>
					<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
						<Card.Header>
							<Card.Title class="font-display text-lg">Pulse & Meter</Card.Title>
							<Card.Description>Set the pulse, meter, and count-in.</Card.Description>
						</Card.Header>
						<Card.Content class="space-y-6">
							<div class="space-y-2">
								<div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									<span>{bpmLabel}</span>
								<span class="text-foreground">{Math.round(playbackBpm)}</span>
							</div>
							<Slider type="single" min={40} max={180} step={1} bind:value={bpmValue} />
							<div class="mt-2 text-xs text-muted-foreground">
								Playback BPM: {Math.round(playbackBpm)}
								{#if floorsMode && !autoAdvanceFloors}
									<span class="ml-2">
										= {Math.round(baseBpm)} × {playbackMultiplier.toFixed(2)}
									</span>
								{/if}
							</div>
						</div>
						{#if floorsMode}
							<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
								<div>
									<div class="text-sm font-semibold">Match playback BPM</div>
									<div class="text-xs text-muted-foreground">
										Slider controls actual playback tempo.
									</div>
								</div>
								<Switch bind:checked={matchPlaybackBpm} />
							</div>
						{/if}
							<div class="space-y-2">
								<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Meter
								</div>
								<ToggleGroup.Root type="single" bind:value={meterValue} class="flex flex-wrap gap-2">
									{#each meterOptions as value}
										<ToggleGroup.Item value={value} class="px-3">
											{value}
										</ToggleGroup.Item>
									{/each}
								</ToggleGroup.Root>
							</div>
							<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
								<div>
									<div class="text-sm font-semibold">Count-in bar</div>
									<div class="text-xs text-muted-foreground">One bar before playback.</div>
								</div>
								<Switch bind:checked={countIn} />
							</div>
						</Card.Content>
					</Card.Root>
					<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
						<Card.Header>
							<Card.Title class="font-display text-lg">Rhythmic floors</Card.Title>
							<Card.Description>Layer pulses inside a floor.</Card.Description>
						</Card.Header>
						<Card.Content class="space-y-4">
							<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
								<div>
									<div class="text-sm font-semibold">Enable floors</div>
									<div class="text-xs text-muted-foreground">
										Use ratios like 3/2 or 5/3.
									</div>
								</div>
								<Switch bind:checked={floorsMode} />
							</div>
							{#if floorsMode}
								<div class="space-y-2">
									<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Floor denominator
									</div>
									<ToggleGroup.Root type="single" bind:value={floorDenom} class="flex flex-wrap gap-2">
										{#each floorOptions as value}
											<ToggleGroup.Item value={value} class="px-3 text-xs">
												1/{value}
											</ToggleGroup.Item>
										{/each}
									</ToggleGroup.Root>
								</div>
								<div class="space-y-2">
									<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Layer count
									</div>
									<ToggleGroup.Root type="single" bind:value={layerCount} class="flex flex-wrap gap-2">
										{#each layerOptions as value}
											<ToggleGroup.Item value={value} class="px-3 text-xs">
												{value}/{floorDenom}
											</ToggleGroup.Item>
										{/each}
									</ToggleGroup.Root>
								</div>
								<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
									<div>
										<div class="text-sm font-semibold">Auto‑advance layers</div>
										<div class="text-xs text-muted-foreground">Ping‑pong 1→8→1 inside the floor.</div>
									</div>
									<Switch bind:checked={autoAdvanceFloors} />
								</div>
								{#if autoAdvanceFloors}
									<div class="space-y-2">
										<div class="flex items-center justify-between text-xs text-muted-foreground">
											<span>Bars per floor</span>
											<span class="text-foreground">{barsPerFloor}</span>
										</div>
										<Slider type="single" min={2} max={16} step={1} bind:value={barsPerFloor} />
									</div>
									<div class="text-xs text-muted-foreground">
										Now: {layerCount}/{floorDenom}
										{#if nextLayerLabel}
											<span class="ml-2">
												Next: {nextLayerLabel}/{floorDenom} in {barsRemainingInFloor} bars
											</span>
										{/if}
									</div>
								{/if}
							{/if}
						</Card.Content>
					</Card.Root>

					{#if !learnMode && !floorsMode}
						<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
					<Card.Header>
						<Card.Title class="font-display text-lg">Grouping</Card.Title>
						<Card.Description>Feel the meter in different groupings.</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-4">
						<ToggleGroup.Root type="single" bind:value={groupingId} class="flex flex-wrap gap-2">
							{#each groupings as preset}
								<ToggleGroup.Item value={preset.id} class="px-3 text-xs">
									{preset.label}
								</ToggleGroup.Item>
							{/each}
						</ToggleGroup.Root>
						<Separator />
						<div class="space-y-2 text-xs text-muted-foreground">
							<div class="flex items-center justify-between">
								<span>{roleCopy[role].lanes.foot}</span>
								<span>Group accents</span>
							</div>
							<div class="flex items-center justify-between">
								<span>{roleCopy[role].lanes.clap}</span>
								<span>Every subdivision</span>
							</div>
							<div class="flex items-center justify-between">
								<span>{roleCopy[role].lanes.voice}</span>
								<span>Konnakol syllables</span>
							</div>
						</div>
					</Card.Content>
				</Card.Root>

					<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
					<Card.Header>
						<Card.Title class="font-display text-lg">Pattern</Card.Title>
						<Card.Description>Pick the syllable sequence to sing.</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-4">
						<ToggleGroup.Root type="single" bind:value={patternId} class="flex flex-col gap-2">
							{#each patterns as pattern}
								<ToggleGroup.Item
									value={pattern.id}
									class="w-full justify-start px-3 text-xs"
								>
									{pattern.label}
								</ToggleGroup.Item>
							{/each}
						</ToggleGroup.Root>
					</Card.Content>
						</Card.Root>
					{/if}
					{#if !learnMode}
						<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
							<Card.Header>
								<Card.Title class="font-display text-lg">Sound</Card.Title>
								<Card.Description>Mix pulse, grouping, and subdivision clicks.</Card.Description>
							</Card.Header>
							<Card.Content class="space-y-4">
								<div class="space-y-2">
									<div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										<span>Pulse level</span>
										<span class="text-foreground">{pulseMix}%</span>
									</div>
									<Slider type="single" min={0} max={100} step={5} bind:value={pulseMix} />
								</div>
								<div class="space-y-2">
									<div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										<span>Subdivision level</span>
										<span class="text-foreground">{subdivisionMix}%</span>
									</div>
									<Slider type="single" min={0} max={100} step={5} bind:value={subdivisionMix} />
								</div>
								<div class="space-y-2">
									<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Group accent
									</div>
									<ToggleGroup.Root type="single" bind:value={groupAccentMode} class="flex flex-wrap gap-2">
										<ToggleGroup.Item value="off" class="px-3 text-xs">Off</ToggleGroup.Item>
										<ToggleGroup.Item value="soft" class="px-3 text-xs">Soft</ToggleGroup.Item>
										<ToggleGroup.Item value="strong" class="px-3 text-xs">Strong</ToggleGroup.Item>
									</ToggleGroup.Root>
								</div>
							</Card.Content>
						</Card.Root>
						<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
							<Card.Header>
								<Card.Title class="font-display text-lg">Dropout</Card.Title>
								<Card.Description>Hold the pulse internally during silent bars.</Card.Description>
							</Card.Header>
							<Card.Content class="space-y-4">
								<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
									<span class="text-xs text-muted-foreground">Enable dropout</span>
									<Switch bind:checked={dropoutEnabled} />
								</div>
								{#if dropoutEnabled}
									<div class="space-y-2">
										<div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
											<span>Bars on</span>
											<span class="text-foreground">{dropoutBarsOn}</span>
										</div>
										<Slider type="single" min={1} max={16} step={1} bind:value={dropoutBarsOn} />
									</div>
									<div class="space-y-2">
										<div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
											<span>Bars silent</span>
											<span class="text-foreground">{dropoutBarsSilent}</span>
										</div>
										<Slider type="single" min={1} max={16} step={1} bind:value={dropoutBarsSilent} />
									</div>
									<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
										<span class="text-xs text-muted-foreground">Drop pulse</span>
										<Switch bind:checked={dropoutDropPulse} />
									</div>
									<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
										<span class="text-xs text-muted-foreground">Drop subdivisions</span>
										<Switch bind:checked={dropoutDropSubdivision} />
									</div>
									{#if stage === 'playing'}
										<div class={`rounded-lg border px-3 py-2 text-xs ${dropoutPhase === 'silent' ? 'border-rose-400/30 bg-rose-500/10 text-rose-300' : 'border-border/60 text-muted-foreground'}`}>
											{dropoutPhase === 'silent'
												? `Silent — hold it. ${dropoutBarsRemaining} bar${dropoutBarsRemaining === 1 ? '' : 's'} to return`
												: `Playing — ${dropoutBarsRemaining} bar${dropoutBarsRemaining === 1 ? '' : 's'} until dropout`}
										</div>
									{/if}
								{/if}
							</Card.Content>
						</Card.Root>
					{/if}
				</div>
		</aside>

			<main class="order-1 space-y-6 lg:order-none">
				<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-xl">
					<Card.Header class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<div>
							<Card.Title class="font-display text-xl">Playback</Card.Title>
						<Card.Description>
							Pulse grid with foot, clap, and voice lanes.
						</Card.Description>
					</div>
						<div class="flex items-center gap-3">
							<Badge variant={stage === 'count-in' ? 'secondary' : 'default'} class="text-xs">
								{stage === 'count-in'
									? 'Count-in'
									: stage === 'playing'
										? 'Playing'
										: 'Idle'}
							</Badge>
							<Button onclick={togglePlayback} class="hidden px-5 lg:inline-flex">
								{isPlaying ? 'Stop' : 'Start'}
							</Button>
							<Button
								variant="secondary"
								size="sm"
								class="lg:hidden"
								onclick={() => (tipsSheetOpen = true)}
							>
								Tips
							</Button>
						</div>
					</Card.Header>
					<Card.Content>
						<div class="space-y-6">
							{#if learnMode}
								<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
									<div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										<span>Learn mode</span>
										<span>{learnStep + 1} / {learnSteps.length}</span>
									</div>
									<div class="mt-2 text-sm font-semibold">{currentLearnStep.label}</div>
									<div class="mt-1 text-sm text-muted-foreground">
										{currentLearnStep.copy[role]}
									</div>
									<div class="mt-3 flex flex-wrap gap-2">
										<Button size="sm" variant="secondary" onclick={prevLearnStep} disabled={learnStep === 0}>
											Back
										</Button>
										<Button size="sm" onclick={nextLearnStep}>
											{learnStep === learnSteps.length - 1 ? 'Finish' : 'Next step'}
										</Button>
										<Button size="sm" variant="ghost" onclick={exitLearnMode}>
											Skip tutorial
										</Button>
									</div>
								</div>
							{/if}
							<div
								class="relative rounded-2xl border border-border/70 bg-[var(--surface-1)] p-4 lg:p-6"
								data-stage={stage}
							>
									<div class="mb-4 flex items-center justify-between text-xs text-muted-foreground">
										<span>Grid</span>
										<span>{gridLabel}</span>
									</div>

								<div class="relative">
								<div
									class="grid gap-3 [grid-template-columns:minmax(72px,90px)_1fr] lg:[grid-template-columns:120px_1fr] lg:[--label-width:120px]"
									style="--label-width: 90px;"
								>
									<div class="space-y-8 text-[11px] font-semibold uppercase tracking-wide lg:text-xs">
										<div class={`${roleStyle.foot} ${learnMode && !learnEmphasis.foot ? 'opacity-40' : ''}`}>
											{laneLabels.foot}
										</div>
										<div class={`${roleStyle.clap} ${learnMode && !learnEmphasis.clap ? 'opacity-40' : ''}`}>
											{laneLabels.clap}
										</div>
										<div class={`${roleStyle.voice} ${learnMode && !learnEmphasis.voice ? 'opacity-40' : ''}`}>
											{laneLabels.voice}
										</div>
									</div>

										<div class="space-y-6">
										<div class="grid gap-2">
											{#if floorsMode}
												<div
													class={`grid ${learnMode && !learnEmphasis.foot ? 'opacity-40' : ''}`}
													style={`grid-template-columns: repeat(${floorDenomNum}, minmax(0, 1fr));`}
												>
													{#each floorIndices as index}
														<div class="flex flex-col items-center gap-2">
															<div
																class={`h-1 w-full rounded-full ${
																	floorHit && currentFloorIndex === index && stage !== 'idle'
																		? 'bg-primary/70'
																		: 'bg-border/60'
																}`}
															></div>
															<div
																class={`text-[10px] font-semibold ${
																	floorHit && currentFloorIndex === index && stage !== 'idle'
																		? 'text-foreground'
																		: 'text-muted-foreground'
																}`}
															>
																{index + 1}
															</div>
														</div>
													{/each}
												</div>
											{:else}
												<div
													class={`grid ${learnMode && !learnEmphasis.foot ? 'opacity-40' : ''}`}
													style={`grid-template-columns: repeat(${displaySteps}, minmax(0, 1fr));`}
												>
													{#each groupSegments as segment}
														<div
															class="flex flex-col items-center gap-2"
															style={`grid-column: ${segment.start + 1} / ${segment.start + segment.size + 1};`}
														>
															<div
																class={`h-1 w-full rounded-full ${
																	learnEmphasis.grouping ? 'bg-primary/70' : 'bg-border/60'
																}`}
															></div>
															<div
																class={`text-[10px] font-semibold ${
																	learnEmphasis.grouping ? 'text-foreground' : 'text-muted-foreground'
																}`}
															>
																{segment.size}
															</div>
														</div>
													{/each}
												</div>
											{/if}
											<div
												class={`grid ${learnMode && !learnEmphasis.foot ? 'opacity-40' : ''}`}
												style={`grid-template-columns: repeat(${
													floorsMode ? floorDenomNum : displaySteps
												}, minmax(0, 1fr));`}
											>
												{#each floorsMode ? floorIndices : stepIndices as step}
													<div class="flex items-center justify-center">
														<div
															class={`h-3 w-3 rounded-full ${
																floorsMode
																	? floorHit && currentFloorIndex === step && stage !== 'idle'
																			? 'bg-[var(--pulse)] lg:shadow-[0_0_18px_rgba(162,103,47,0.6)]'
																			: 'bg-border/70'
																	: currentStep === step && stage !== 'idle' && currentIsGroupStart
																			? 'bg-[var(--pulse)] lg:shadow-[0_0_18px_rgba(162,103,47,0.6)]'
																			: 'bg-border/70'
																}`}
														></div>
													</div>
												{/each}
											</div>
										</div>

									<div
										class={`grid ${learnMode && !learnEmphasis.clap ? 'opacity-40' : ''}`}
										style={`grid-template-columns: repeat(${
											floorsMode ? layerCountNum : displaySteps
										}, minmax(0, 1fr));`}
									>
										{#each floorsMode ? layerIndices : stepIndices as step}
											<div class="flex items-center justify-center">
												<div
													class={`h-2 w-2 rounded-full ${
														floorsMode
															? layerHit && currentLayerIndex === step && stage !== 'idle'
																	? 'bg-primary/80 lg:shadow-[0_0_14px_rgba(186,120,52,0.4)]'
																	: 'bg-border/60'
																: currentStep === step && stage !== 'idle'
																	? 'bg-primary/80 lg:shadow-[0_0_14px_rgba(186,120,52,0.4)]'
																	: 'bg-border/60'
															}`}
												></div>
											</div>
										{/each}
									</div>

									<div
										class={`grid text-xs font-semibold uppercase tracking-wide ${
											learnMode && !learnEmphasis.voice ? 'opacity-40' : ''
										}`}
										style={`grid-template-columns: repeat(${activeSyllables.length}, minmax(0, 1fr));`}
									>
										{#each activeSyllables as syllable, index}
											<div
													class={`text-center ${
														floorsMode
															? layerHit && currentLayerIndex === index && stage !== 'idle'
																	? 'text-foreground'
																	: 'text-muted-foreground'
															: currentStep === index && stage !== 'idle'
																? 'text-foreground'
																: 'text-muted-foreground'
													}`}
											>
												{syllable}
											</div>
										{/each}
									</div>
									</div>

									<div
										class="pointer-events-none absolute inset-y-0"
										style={`left: calc(var(--label-width) + ${playheadLeft});`}
									>
										<div class="h-full w-px bg-primary/40"></div>
									</div>
								</div>
							</div>

							<div class="hidden gap-4 md:grid md:grid-cols-3">
								<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
									<div class={`text-xs font-semibold uppercase tracking-wide ${roleStyle.foot}`}>
										{roleCopy[role].lanes.foot}
									</div>
									<div class="text-sm">{roleCopy[role].laneFocus.foot}</div>
								</div>
								<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
									<div class={`text-xs font-semibold uppercase tracking-wide ${roleStyle.clap}`}>
										{roleCopy[role].lanes.clap}
									</div>
									<div class="text-sm">{roleCopy[role].laneFocus.clap}</div>
								</div>
								<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
									<div class={`text-xs font-semibold uppercase tracking-wide ${roleStyle.voice}`}>
										{roleCopy[role].lanes.voice}
									</div>
									<div class="text-sm">{roleCopy[role].laneFocus.voice}</div>
								</div>
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			</main>
		</div>
	{:else if phase === 'harmony'}
		<div
			class="flex flex-col gap-6 lg:grid lg:grid-cols-[320px,1fr]"
			onpointerenter={preloadHarmonySamples}
			onpointerdown={preloadHarmonySamples}
		>
			<aside class="order-2 space-y-6 lg:order-none">
				<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
					<Card.Header>
						<Card.Title class="font-display text-lg">Chord focus</Card.Title>
						<Card.Description>Hear a chord over a tonic drone.</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-4">
						<div class="space-y-2">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chord root</div>
							<Select.Root type="single" bind:value={harmonyChordRoot as never}>
								<Select.Trigger class="w-full">
									<span>{harmonyChordRootLabel}</span>
								</Select.Trigger>
								<Select.Content>
									{#each harmonyKeys as key}
										<Select.Item value={String(key.pc)}>{key.label}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
							<Button size="sm" variant="secondary" class="w-full" onclick={() => (harmonyChordRoot = harmonyKey)}>
								Match tonic
							</Button>
						</div>
						<div class="space-y-2">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chord set</div>
							<ToggleGroup.Root type="single" bind:value={harmonyChordSet} class="flex flex-wrap gap-2">
								<ToggleGroup.Item value="triads" class="px-3 text-xs">Triads</ToggleGroup.Item>
								<ToggleGroup.Item value="sevenths" class="px-3 text-xs">7ths</ToggleGroup.Item>
							</ToggleGroup.Root>
						</div>
						<div class="space-y-2">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chord quality</div>
							{#if harmonyChordSet === 'triads'}
								<ToggleGroup.Root type="single" bind:value={harmonyTriad} class="flex flex-wrap gap-2">
									{#each harmonyTriads as triad}
										<ToggleGroup.Item value={triad.value} class="px-3 text-xs">
											{triad.label}
										</ToggleGroup.Item>
									{/each}
								</ToggleGroup.Root>
							{:else}
								<ToggleGroup.Root type="single" bind:value={harmonySeventh} class="flex flex-wrap gap-2">
									{#each harmonySevenths as chord}
										<ToggleGroup.Item value={chord.value} class="px-3 text-xs">
											{chord.label}
										</ToggleGroup.Item>
									{/each}
								</ToggleGroup.Root>
							{/if}
						</div>
						<div class="space-y-2">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Drone tonic</div>
							<Select.Root type="single" bind:value={harmonyKey as never}>
								<Select.Trigger class="w-full">
									<span>{harmonyKeyLabel}</span>
								</Select.Trigger>
								<Select.Content>
									{#each harmonyKeys as key}
										<Select.Item value={String(key.pc)}>{key.label}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
						<div class="rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
							Now hearing: {harmonySimpleNowHearing}
						</div>
						<div
							class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2"
							onclick={() => void unlockHarmonyAudio()}
						>
							<div>
								<div class="text-sm font-semibold">Drone</div>
								<div class="text-xs text-muted-foreground">Tonic + fifth blend.</div>
							</div>
							<Switch bind:checked={harmonyDroneOn} />
						</div>
						<div class="space-y-2">
							<div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								<span>Drone volume</span>
								<span class="text-foreground">{harmonyDroneVolume}%</span>
							</div>
							<Slider type="single" min={0} max={100} step={5} bind:value={harmonyDroneVolume} />
						</div>
						<div class="space-y-2">
							<div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								<span>Fifth blend</span>
								<span class="text-foreground">{harmonyDroneBlend}%</span>
							</div>
							<Slider type="single" min={0} max={100} step={5} bind:value={harmonyDroneBlend} />
						</div>
						<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
							<div>
								<div class="text-sm font-semibold">Chord loop</div>
								<div class="text-xs text-muted-foreground">Syncs to rhythm BPM.</div>
							</div>
							<Switch bind:checked={harmonyLoopOn} />
						</div>
						{#if harmonyLoopOn}
							<div class="space-y-2">
								<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Loop rate</div>
								<ToggleGroup.Root type="single" bind:value={harmonyLoopBars} class="flex flex-wrap gap-2">
									<ToggleGroup.Item value="1" class="px-3 text-xs">1 bar</ToggleGroup.Item>
									<ToggleGroup.Item value="2" class="px-3 text-xs">2 bars</ToggleGroup.Item>
									<ToggleGroup.Item value="4" class="px-3 text-xs">4 bars</ToggleGroup.Item>
								</ToggleGroup.Root>
								<div class="text-xs text-muted-foreground">BPM {Math.round(bpmValue)}</div>
							</div>
						{/if}
					</Card.Content>
				</Card.Root>

				<details class="rounded-xl border border-border/60 bg-card/80 p-4 shadow-none backdrop-blur lg:shadow-lg">
					<summary class="flex cursor-pointer items-center justify-between text-sm font-semibold">
						Function trainer (advanced)
						<span class="text-xs text-muted-foreground">
							{harmonyFunction} ·
							{harmonyChordMode === 'function'
								? harmonyDerivedQuality
								: harmonyChordSet === 'triads'
									? harmonyTriad
									: harmonySeventh}
						</span>
					</summary>
					<div class="mt-4 space-y-4">
						<div class="rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
							Use function labels when you're ready to think in roles (I, ii, V, etc.).
						</div>
						<div class="rounded-lg border border-border/60 bg-[var(--surface-2)] px-3 py-2 text-xs text-muted-foreground">
							Now hearing: {harmonyNowHearing}
						</div>
						<Button class="w-full" onclick={playFunctionChord}>Play function chord</Button>
						<div class="space-y-2">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mode</div>
							<ToggleGroup.Root type="single" bind:value={harmonyKeyMode} class="flex flex-wrap gap-2">
								<ToggleGroup.Item value="major" class="px-3 text-xs">Major</ToggleGroup.Item>
								<ToggleGroup.Item value="minor" class="px-3 text-xs">Minor</ToggleGroup.Item>
							</ToggleGroup.Root>
						</div>
						<div class="space-y-2">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chord mode</div>
							<ToggleGroup.Root type="single" bind:value={harmonyChordMode} class="flex flex-wrap gap-2">
								<ToggleGroup.Item value="function" class="px-3 text-xs">Function</ToggleGroup.Item>
								<ToggleGroup.Item value="free" class="px-3 text-xs">Free</ToggleGroup.Item>
							</ToggleGroup.Root>
						</div>
						<div class="space-y-2">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chord set</div>
							<ToggleGroup.Root type="single" bind:value={harmonyChordSet} class="flex flex-wrap gap-2">
								<ToggleGroup.Item value="triads" class="px-3 text-xs">Triads</ToggleGroup.Item>
								<ToggleGroup.Item value="sevenths" class="px-3 text-xs">7ths</ToggleGroup.Item>
							</ToggleGroup.Root>
						</div>
						<div class="space-y-2">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Home base for function
							</div>
							<Select.Root type="single" bind:value={harmonyFunctionKey as never}>
								<Select.Trigger class="w-full">
									<span>{harmonyFunctionKeyLabel}</span>
								</Select.Trigger>
								<Select.Content>
									{#each harmonyKeys as key}
										<Select.Item value={String(key.pc)}>{key.label}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
							<div class="grid gap-2 sm:grid-cols-2">
								<Button size="sm" variant="secondary" class="w-full" onclick={advanceHarmonyKey}>
									Advance key (fifths)
								</Button>
								<Button
									size="sm"
									variant="ghost"
									class="w-full"
									onclick={() => {
										harmonyKey = harmonyFunctionKey;
									}}
								>
									Use as drone
								</Button>
							</div>
						</div>
						<div class="grid gap-3 sm:grid-cols-2">
							<div class="space-y-2">
								<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Function
								</div>
								<ToggleGroup.Root type="single" bind:value={harmonyFunction} class="flex flex-wrap gap-2">
									{#each harmonyFunctions as fn}
										<ToggleGroup.Item value={fn} class="px-3 text-xs">
											{fn}
										</ToggleGroup.Item>
									{/each}
								</ToggleGroup.Root>
							</div>
						{#if harmonyChordMode === 'free'}
							<div class="space-y-2">
								<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									{harmonyChordSet === 'triads' ? 'Triad quality' : '7th quality'}
								</div>
								{#if harmonyChordSet === 'triads'}
									<ToggleGroup.Root type="single" bind:value={harmonyTriad} class="flex flex-wrap gap-2">
										{#each harmonyTriads as triad}
											<ToggleGroup.Item value={triad.value} class="px-3 text-xs">
												{triad.label}
											</ToggleGroup.Item>
										{/each}
									</ToggleGroup.Root>
								{:else}
									<ToggleGroup.Root type="single" bind:value={harmonySeventh} class="flex flex-wrap gap-2">
										{#each harmonySevenths as chord}
											<ToggleGroup.Item value={chord.value} class="px-3 text-xs">
												{chord.label}
											</ToggleGroup.Item>
										{/each}
									</ToggleGroup.Root>
								{/if}
							</div>
						{/if}
						</div>
						<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
							<div>
								<div class="text-sm font-semibold">Auto-advance key</div>
								<div class="text-xs text-muted-foreground">Step by fifths after play.</div>
							</div>
							<Switch bind:checked={harmonyAdvanceKey} />
						</div>
						{#if harmonyAdvanceKey}
							<ToggleGroup.Root type="single" bind:value={harmonyFifthsDirection} class="flex flex-wrap gap-2">
								<ToggleGroup.Item value="1" class="px-3 text-xs">Clockwise</ToggleGroup.Item>
								<ToggleGroup.Item value="-1" class="px-3 text-xs">Counter</ToggleGroup.Item>
							</ToggleGroup.Root>
						{/if}
						<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
							<div>
								<div class="text-sm font-semibold">Quiz mode</div>
								<div class="text-xs text-muted-foreground">Hide inversion until reveal.</div>
							</div>
							<Switch bind:checked={harmonyQuizMode} />
						</div>
						<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
							<div>
								<div class="text-sm font-semibold">Contrast</div>
								<div class="text-xs text-muted-foreground">Play derived then comparison.</div>
							</div>
							<Switch bind:checked={harmonyContrastOn} />
						</div>
						{#if harmonyContrastOn}
							<div class="space-y-2">
								<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Compare with
								</div>
								{#if harmonyChordSet === 'triads'}
									<ToggleGroup.Root type="single" bind:value={harmonyContrastTriad} class="flex flex-wrap gap-2">
										{#each harmonyTriads as triad}
											<ToggleGroup.Item value={triad.value} class="px-3 text-xs">
												{triad.label}
											</ToggleGroup.Item>
										{/each}
									</ToggleGroup.Root>
								{:else}
									<ToggleGroup.Root type="single" bind:value={harmonyContrastSeventh} class="flex flex-wrap gap-2">
										{#each harmonySevenths as chord}
											<ToggleGroup.Item value={chord.value} class="px-3 text-xs">
												{chord.label}
											</ToggleGroup.Item>
										{/each}
									</ToggleGroup.Root>
								{/if}
							</div>
						{/if}
					</div>
				</details>
			</aside>

			<main class="order-1 space-y-6 lg:order-none">
				<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-xl">
					<Card.Header class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<div>
							<Card.Title class="font-display text-xl">Harmony Listener</Card.Title>
							<Card.Description>
								Hear a chord over a tonic drone.
							</Card.Description>
						</div>
						<div class="flex items-center gap-3">
							<Badge variant="secondary" class="text-xs">Drone {harmonyKeyLabel}</Badge>
							<Button onclick={() => void playHarmonyChord(true)} class="px-5">Play chord</Button>
						</div>
					</Card.Header>
					<Card.Content on:click={preloadHarmonySamples}>
						<div class="rounded-2xl border border-border/70 bg-[var(--surface-1)] p-6">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">How to use</div>
							<div class="mt-2 text-sm">
								1) Turn on the drone. 2) Choose a chord. 3) Press Play and listen against the tonic.
							</div>
						</div>
						<div class="grid gap-4 md:grid-cols-3">
							<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
								<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chord</div>
								<div class="text-sm font-semibold">
									{harmonyChordRootLabel} {harmonyChordQualityLabel}
								</div>
								<div class="text-xs text-muted-foreground">Root + quality</div>
							</div>
							<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
								<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Drone</div>
								<div class="text-sm font-semibold">{harmonyKeyLabel}</div>
								<div class="text-xs text-muted-foreground">Tonic drone</div>
							</div>
							<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
								<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inversion</div>
								{#if harmonyQuizMode && !harmonyReveal}
									<div class="text-sm font-semibold">Hidden</div>
									<Button size="sm" variant="secondary" class="mt-2" onclick={() => (harmonyReveal = true)}>
										Reveal
									</Button>
								{:else}
									<div class="text-sm font-semibold">{harmonyInversionLabel}</div>
									<div class="text-xs text-muted-foreground">Last play</div>
								{/if}
							</div>
						</div>
						<div class="mt-6 rounded-2xl border border-border/70 bg-[var(--surface-1)] p-6">
							<div class="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
								<span>Drone: {harmonyKeyLabel} · {harmonyDroneOn ? 'On' : 'Off'}</span>
								<span>Chord: {harmonyChordRootLabel} {harmonyChordQualityLabel}</span>
								<span>Inversion: {harmonyInversionLabel}</span>
							</div>
							<div class="mt-3 text-sm">Now hearing: {harmonySimpleNowHearing}</div>
							<div class="mt-2 text-xs text-muted-foreground">
								Chord loop syncs to the rhythm BPM when enabled.
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			</main>
		</div>
	{:else}
		<div class="flex flex-col gap-6">
			<MelodyListeningTrainer bind:bpm={bpmValue} />
		</div>
		{#if false}
		<div class="flex flex-col gap-6 lg:grid lg:grid-cols-[320px,1fr]">
			<aside class="order-2 space-y-6 lg:order-none">
				<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
					<Card.Header>
						<Card.Title class="font-display text-lg">Mode</Card.Title>
						<Card.Description>Interactive tapback or passive sing-along.</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-4">
						<ToggleGroup.Root type="single" bind:value={melodyMode} class="flex flex-wrap gap-2">
							<ToggleGroup.Item value="interactive" class="px-3 text-xs">Interactive</ToggleGroup.Item>
							<ToggleGroup.Item value="passive" class="px-3 text-xs">Passive</ToggleGroup.Item>
						</ToggleGroup.Root>
						<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
							<span class="text-xs text-muted-foreground">Auto‑advance key</span>
							<Switch bind:checked={melodyAutoAdvanceKey} />
						</div>
						<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
							<span class="text-xs text-muted-foreground">Drone</span>
							<Switch bind:checked={melodyDroneOn} onclick={() => void unlockMelodyAudio()} />
						</div>
					</Card.Content>
				</Card.Root>

				<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
					<Card.Header>
						<Card.Title class="font-display text-lg">Key & Mode</Card.Title>
						<Card.Description>Movable Do follows the selected key.</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-3">
						<Select.Root type="single" bind:value={melodyKey as never}>
							<Select.Trigger class="w-full">
								<span>{melodyKeyLabel}</span>
							</Select.Trigger>
							<Select.Content>
								{#each harmonyKeys as keyOption}
									<Select.Item value={String(keyOption.pc)}>{keyOption.label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<ToggleGroup.Root type="single" bind:value={melodyKeyMode} class="flex flex-wrap gap-2">
							<ToggleGroup.Item value="major" class="px-3 text-xs">Major</ToggleGroup.Item>
							<ToggleGroup.Item value="minor" class="px-3 text-xs">Minor</ToggleGroup.Item>
						</ToggleGroup.Root>
					</Card.Content>
				</Card.Root>

				<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
					<Card.Header>
						<Card.Title class="font-display text-lg">Phrase</Card.Title>
						<Card.Description>Set the contour and density.</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-4">
						<div class="space-y-2">
							<div class="flex items-center justify-between text-xs text-muted-foreground">
								<span>Length</span>
								<span class="text-foreground">{melodyPhraseLength} notes</span>
							</div>
							<Slider type="single" min={2} max={7} step={1} bind:value={melodyPhraseLength} />
						</div>
						<div class="space-y-2">
							<div class="flex items-center justify-between text-xs text-muted-foreground">
								<span>Max leap</span>
								<span class="text-foreground">{melodyMaxLeap}</span>
							</div>
							<Slider type="single" min={1} max={4} step={1} bind:value={melodyMaxLeap} />
						</div>
						<div class="space-y-2">
							<div class="flex items-center justify-between text-xs text-muted-foreground">
								<span>Loop length</span>
								<span class="text-foreground">{melodyLoopBars} bars</span>
							</div>
							<Slider type="single" min={4} max={16} step={1} bind:value={melodyLoopBars} />
						</div>
						<div class="space-y-2">
							<div class="flex items-center justify-between text-xs text-muted-foreground">
								<span>BPM</span>
								<span class="text-foreground">{melodyBpm}</span>
							</div>
							<Slider type="single" min={60} max={130} step={1} bind:value={melodyBpm} />
						</div>
						<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
							<span class="text-xs text-muted-foreground">Start on tonic</span>
							<Switch bind:checked={melodyStartOnTonic} />
						</div>
						{#if melodyPracticeMode === 'scale'}
							<div class="space-y-2">
								<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scale</div>
								<ToggleGroup.Root type="single" bind:value={melodyScaleMode} class="flex flex-wrap gap-2">
									{#each SCALE_OPTIONS as option}
										<ToggleGroup.Item value={option} class="px-3 text-xs">
											{SCALE_LABELS[option]}
										</ToggleGroup.Item>
									{/each}
								</ToggleGroup.Root>
							</div>
							<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
								<span class="text-xs text-muted-foreground">Show scale names</span>
								<Switch bind:checked={melodyShowScaleNames} />
							</div>
						{/if}
						<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
							<span class="text-xs text-muted-foreground">Representation</span>
							<ToggleGroup.Root type="single" bind:value={melodyRepresentation} class="flex gap-2">
								<ToggleGroup.Item value="solfege" class="px-3 text-xs">Solfege</ToggleGroup.Item>
								<ToggleGroup.Item value="numbers" class="px-3 text-xs">Numbers</ToggleGroup.Item>
							</ToggleGroup.Root>
						</div>
					</Card.Content>
				</Card.Root>

				<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
					<Card.Header>
						<Card.Title class="font-display text-lg">Notes to practice</Card.Title>
						<Card.Description>Choose diatonic and chromatic targets.</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-4">
						<div class="flex flex-wrap gap-2">
							<Button
								variant="secondary"
								onclick={() => applyMelodyPreset('diatonic')}
							>
								Diatonic
							</Button>
							<Button
								variant="secondary"
								onclick={() => applyMelodyPreset('neighbors')}
							>
								Neighbors
							</Button>
							<Button
								variant="secondary"
								onclick={() => applyMelodyPreset('chromatic')}
							>
								Chromatic
							</Button>
						</div>
						<div class="space-y-2">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Diatonic</div>
							<div class="grid grid-cols-7 gap-2">
								{#each melodyDiatonicRow as degree}
									<Button
										variant={melodyAllowedDegrees.includes(degree) ? 'default' : 'secondary'}
										onclick={() => toggleMelodyDegree(degree)}
									>
										{labelForMelodyDegree(degree)}
									</Button>
								{/each}
							</div>
						</div>
						<div class="space-y-2">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chromatic</div>
							<div class="grid grid-cols-9 gap-2">
								{#each melodyChromaticRow as degree}
									<Button
										variant={melodyAllowedDegrees.includes(degree) ? 'default' : 'secondary'}
										onclick={() => toggleMelodyDegree(degree)}
									>
										{labelForMelodyDegree(degree)}
									</Button>
								{/each}
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			</aside>

			<main class="order-1 space-y-6 lg:order-none">
				<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-xl">
					<Card.Header class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<div>
							<Card.Title class="font-display text-xl">Melody Trainer</Card.Title>
							<Card.Description>
								{melodyMode === 'interactive'
									? 'Listen once, then tap the phrase.'
									: 'Looped phrases with a rotating key center.'}
							</Card.Description>
						</div>
						<div class="flex items-center gap-3">
							<Badge variant="secondary" class="text-xs">Key {melodyKeyLabel}</Badge>
							<Badge variant={melodyStage === 'playing' ? 'default' : 'secondary'} class="text-xs">
								{melodyStage === 'count-in'
									? 'Count-in'
									: melodyStage === 'playing'
										? 'Playing'
										: melodyStage === 'rest'
											? 'Rest'
											: 'Idle'}
							</Badge>
							<Button onclick={toggleMelodyPlayback} class="px-5">
								{melodyPlaying ? 'Stop' : 'Play'}
							</Button>
						</div>
					</Card.Header>
					<Card.Content class="space-y-6">
						<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
							<span class="rounded-full border border-border/70 bg-background/60 px-3 py-1">
								Key {melodyKeyLabel} · {melodyKeyMode}
							</span>
							<span class="rounded-full border border-border/70 bg-background/60 px-3 py-1">
								{melodyPhraseLength} notes · max leap {melodyMaxLeap}
							</span>
							<span class="rounded-full border border-border/70 bg-background/60 px-3 py-1">
								{melodyRepresentation === 'solfege' ? 'Solfege' : 'Numbers'}
							</span>
							{#if melodyAutoAdvanceKey && melodyNextKeyLabel}
								<span class="rounded-full border border-border/70 bg-background/60 px-3 py-1">
									Next key {melodyNextKeyLabel}
								</span>
							{/if}
						</div>
						<div class="flex flex-wrap items-center gap-2">
							<ToggleGroup.Root type="single" bind:value={melodyPracticeMode} class="flex gap-2">
								<ToggleGroup.Item value="phrase" class="px-3 text-xs">Phrase</ToggleGroup.Item>
								<ToggleGroup.Item value="scale" class="px-3 text-xs">Scale color</ToggleGroup.Item>
								<ToggleGroup.Item value="single" class="px-3 text-xs">Single note</ToggleGroup.Item>
							</ToggleGroup.Root>
						</div>
						<div class="h-2 w-full rounded-full bg-border/60">
							<div
								class="h-full rounded-full bg-primary/70 transition-all"
								style={`width: ${melodyProgressPercent}%;`}
							></div>
						</div>

						{#if melodyPracticeMode === 'phrase' && melodyMode === 'interactive'}
							<div class="space-y-4">
								<div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/60 px-3 py-2">
									<span class="text-xs text-muted-foreground">Representation</span>
									<ToggleGroup.Root type="single" bind:value={melodyRepresentation} class="flex gap-2">
										<ToggleGroup.Item value="solfege" class="px-3 text-xs">Solfege</ToggleGroup.Item>
										<ToggleGroup.Item value="numbers" class="px-3 text-xs">Numbers</ToggleGroup.Item>
									</ToggleGroup.Root>
								</div>
								<div class="grid grid-cols-4 gap-2">
									{#each Array.from({ length: melodyPhraseLength }) as _, index}
										<div
											class={`rounded-lg border border-border/60 px-2 py-3 text-center text-sm font-semibold uppercase tracking-wide ${
												melodyStep === index && melodyStage === 'playing'
													? 'bg-[var(--surface-2)] text-foreground'
													: 'text-muted-foreground'
											}`}
										>
									{melodyInput[index] ? labelForMelodyDegree(melodyInput[index]) : '·'}
								</div>
							{/each}
						</div>
						<div class="grid grid-cols-7 gap-2">
							{#each melodyDiatonicSelected as degree}
								<Button
									variant="secondary"
									onclick={() => onTapMelodyDegree(degree)}
								>
									{labelForMelodyDegree(degree)}
								</Button>
							{/each}
						</div>
						<div class="grid grid-cols-9 gap-2">
							{#each melodyChromaticSelected as degree}
								<Button
									variant="secondary"
									onclick={() => onTapMelodyDegree(degree)}
								>
									{labelForMelodyDegree(degree)}
								</Button>
							{/each}
						</div>
								<div class="flex flex-wrap items-center gap-2">
									<Button onclick={submitMelody}>Submit</Button>
									<Button variant="secondary" onclick={backspaceMelodyInput}>
										Backspace
									</Button>
									<Button variant="secondary" onclick={clearMelodyInput}>
										Clear
									</Button>
									<Button variant="ghost" onclick={() => (melodyReveal = !melodyReveal)}>
										{melodyReveal ? 'Hide' : 'Reveal'}
									</Button>
									<Button variant="ghost" onclick={generateMelodyPhrase}>
										New phrase
									</Button>
								</div>
								{#if melodyFeedback !== 'idle'}
									<div
										class={`rounded-lg border border-border/60 px-3 py-2 text-sm ring-1 ${
											melodyFeedback === 'correct'
												? 'bg-emerald-500/10 text-emerald-200 ring-emerald-400/30'
												: 'bg-rose-500/10 text-rose-200 ring-rose-400/30'
										}`}
									>
										{melodyFeedback === 'correct'
											? 'Correct. Sing it once more.'
											: 'Not quite. Try again or reveal.'}
									</div>
								{/if}
								{#if melodyReveal}
									<div class="rounded-lg border border-border/60 bg-[var(--surface-2)] px-3 py-2 text-sm text-muted-foreground">
										Answer: {melodyDegrees
											.map((degree) =>
												labelForMelodyDegree(degree)
											)
											.join(' · ')}
									</div>
							{/if}
						</div>
						{:else if melodyPracticeMode === 'phrase'}
							<div class="space-y-4">
								<div class="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									{#each melodyDegrees as degree, index}
										<div
											class={`rounded-lg border border-border/60 px-2 py-3 ${
												melodyStep === index && melodyStage === 'playing'
													? 'bg-[var(--surface-2)] text-foreground'
													: 'bg-transparent'
											}`}
										>
									{labelForMelodyDegree(degree)}
								</div>
							{/each}
						</div>
								<div class="rounded-lg border border-border/60 bg-[var(--surface-2)] px-3 py-2 text-sm text-muted-foreground">
									Auto-advance key is {melodyAutoAdvanceKey ? 'on' : 'off'}. New phrases rotate every loop.
								</div>
							</div>
						{:else if melodyPracticeMode === 'scale'}
							<div class="space-y-4">
								<div class="rounded-2xl border border-border/70 bg-[var(--surface-1)] p-6">
									<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What to listen for</div>
									<div class="mt-2 text-sm">
										Which scale color is this over the tonic drone? Think Bright / Dark / Tense.
									</div>
									<div class="mt-4 flex flex-wrap gap-2">
									{#each melodyScaleChoices as choice, index}
										<Button variant="secondary" onclick={() => submitMelodyScale(choice)}>
											{labelForMelodyScaleChoice(choice, index)}
										</Button>
									{/each}
									</div>
									{#if melodyScaleFeedback !== 'idle'}
										<div
											class={`mt-4 rounded-lg border border-border/60 px-3 py-2 text-sm ring-1 ${
												melodyScaleFeedback === 'correct'
													? 'bg-emerald-500/10 text-emerald-200 ring-emerald-400/30'
													: 'bg-rose-500/10 text-rose-200 ring-rose-400/30'
											}`}
										>
									{melodyScaleFeedback === 'correct'
										? 'Correct. That feels ' + melodyScaleFeel(melodyScaleCorrect as (typeof SCALE_OPTIONS)[number]) + '.'
										: 'Not quite. It was ' + labelForMelodyScale(melodyScaleCorrect) + ' (' + melodyScaleFeel(melodyScaleCorrect as (typeof SCALE_OPTIONS)[number]) + ').'}
										</div>
									{/if}
								</div>
							</div>
						{:else}
							<div class="space-y-4">
								<div class="rounded-2xl border border-border/70 bg-[var(--surface-1)] p-6">
									<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What to listen for</div>
									<div class="mt-2 text-sm">
										Same pitch, new key. What does it feel like now? Think Bright / Dark / Tense.
									</div>
									<div class="mt-4 flex flex-wrap gap-2">
										{#each melodySingleChoices as choice}
											<Button variant="secondary" onclick={() => submitMelodySingle(choice)}>
												{labelForMelodyDegree(choice)}
											</Button>
										{/each}
									</div>
									{#if melodySingleFeedback !== 'idle'}
										<div
											class={`mt-4 rounded-lg border border-border/60 px-3 py-2 text-sm ring-1 ${
												melodySingleFeedback === 'correct'
													? 'bg-emerald-500/10 text-emerald-200 ring-emerald-400/30'
													: 'bg-rose-500/10 text-rose-200 ring-rose-400/30'
											}`}
										>
											{melodySingleFeedback === 'correct'
												? 'Correct. Hear how the note\'s role shifts.'
												: 'Not quite. It was ' + labelForMelodyDegree(melodySingleCorrect) + '.'}
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			</main>
		</div>
	{/if}
	{/if}
	</div>
</div>

{#if phase === 'rhythm'}
<Sheet.Root bind:open={patternSheetOpen}>
	<Sheet.Content side="bottom" class="h-[92vh] rounded-t-3xl">
		<Sheet.Header>
			<Sheet.Title class="font-display text-xl">Patterns</Sheet.Title>
			<Sheet.Description>
				Choose a syllable pattern and meter for focused practice.
			</Sheet.Description>
		</Sheet.Header>
		<div class="mt-6 space-y-6">
			<div class="space-y-2">
				<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					Meter
				</div>
				<ToggleGroup.Root type="single" bind:value={meterValue} class="flex flex-wrap gap-2">
					{#each meterOptions as value}
						<ToggleGroup.Item value={value} class="px-3">
							{value}
						</ToggleGroup.Item>
					{/each}
				</ToggleGroup.Root>
			</div>
			<div class="space-y-2">
				<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					Pattern
				</div>
				<div class="space-y-2">
					{#each patterns as pattern}
						<Button
							variant={pattern.id === patternId ? 'default' : 'secondary'}
							class="w-full justify-start"
							onclick={() => {
								patternId = pattern.id;
								patternSheetOpen = false;
							}}
						>
							{pattern.label}
						</Button>
					{/each}
				</div>
			</div>
		</div>
	</Sheet.Content>
</Sheet.Root>

<Sheet.Root bind:open={tipsSheetOpen}>
	<Sheet.Content side="bottom" class="h-[60vh] rounded-t-3xl">
		<Sheet.Header>
			<Sheet.Title class="font-display text-xl">Practice Tips</Sheet.Title>
			<Sheet.Description>
				Role-focused reminders for keeping the pulse grounded.
			</Sheet.Description>
		</Sheet.Header>
		<div class="mt-6 grid gap-4">
			<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
				<div class={`text-xs font-semibold uppercase tracking-wide ${roleStyle.foot}`}>
					{roleCopy[role].lanes.foot}
				</div>
				<div class="text-sm">{roleCopy[role].laneFocus.foot}</div>
			</div>
			<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
				<div class={`text-xs font-semibold uppercase tracking-wide ${roleStyle.clap}`}>
					{roleCopy[role].lanes.clap}
				</div>
				<div class="text-sm">{roleCopy[role].laneFocus.clap}</div>
			</div>
			<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
				<div class={`text-xs font-semibold uppercase tracking-wide ${roleStyle.voice}`}>
					{roleCopy[role].lanes.voice}
				</div>
				<div class="text-sm">{roleCopy[role].laneFocus.voice}</div>
			</div>
		</div>
	</Sheet.Content>
</Sheet.Root>

<div class="fixed inset-x-4 bottom-4 z-40 lg:hidden">
	<div class="rounded-2xl border border-border/70 bg-card/95 px-4 py-3 shadow-xl backdrop-blur">
		<div class="flex items-center justify-between gap-3">
			<Button class="px-6" onclick={togglePlayback}>
				{isPlaying ? 'Stop' : 'Start'}
			</Button>
			<Button variant="secondary" onclick={() => (mobileBpmOpen = !mobileBpmOpen)}>
				{bpmValue} bpm
			</Button>
			<Button variant={learnMode ? 'default' : 'secondary'} onclick={toggleLearnMode}>
				{learnMode ? 'Console' : 'Learn'}
			</Button>
		</div>
		<div class="mt-3 flex items-center justify-between gap-3">
			<div class="flex items-center gap-2">
				<span class="text-xs text-muted-foreground">Count-in</span>
				<Switch bind:checked={countIn} />
			</div>
			{#if learnMode}
				<Button size="sm" onclick={nextLearnStep}>
					{learnStep === learnSteps.length - 1 ? 'Finish' : 'Next'}
				</Button>
			{/if}
		</div>
		{#if mobileBpmOpen}
			<div class="mt-3">
				<Slider type="single" min={40} max={180} step={1} bind:value={bpmValue} />
			</div>
		{/if}
	</div>
</div>
{/if}

{#if phase === 'harmony'}
	<div class="fixed inset-x-4 bottom-4 z-40 lg:hidden">
		<div class="rounded-2xl border border-border/70 bg-card/95 px-4 py-3 shadow-xl backdrop-blur">
			<div class="flex items-center justify-between gap-3">
				<Button class="px-6" onclick={() => void playHarmonyChord(true)}>Play</Button>
				<div class="flex items-center gap-2" onclick={() => void unlockHarmonyAudio()}>
					<span class="text-xs text-muted-foreground">Drone</span>
									<Switch bind:checked={harmonyDroneOn} />
				</div>
				<Button variant="secondary" onclick={() => (harmonyQuizMode = !harmonyQuizMode)}>
					{harmonyQuizMode ? 'Quiz on' : 'Quiz off'}
				</Button>
			</div>
			<div class="mt-3 text-xs text-muted-foreground">
			{harmonyChordRootLabel} {harmonyChordQualityLabel} over {harmonyKeyLabel}
			</div>
		</div>
	</div>
{/if}

{#if false && phase === 'melody'}
	<div class="fixed inset-x-4 bottom-4 z-40 lg:hidden">
		<div class="rounded-2xl border border-border/70 bg-card/95 px-4 py-3 shadow-xl backdrop-blur">
			<div class="flex items-center justify-between gap-3">
				<Button class="px-6" onclick={toggleMelodyPlayback}>
					{melodyPlaying ? 'Stop' : 'Play'}
				</Button>
				<Button variant="secondary" onclick={() => (melodyMode = melodyMode === 'interactive' ? 'passive' : 'interactive')}>
					{melodyMode === 'interactive' ? 'Interactive' : 'Passive'}
				</Button>
				<Button
					variant="secondary"
					onclick={() => (melodyRepresentation = melodyRepresentation === 'solfege' ? 'numbers' : 'solfege')}
				>
					{melodyRepresentation === 'solfege' ? 'Solfege' : 'Numbers'}
				</Button>
			</div>
			<div class="mt-3 flex items-center justify-between text-xs text-muted-foreground">
				<span>Key: {melodyKeyLabel}</span>
				<div class="flex items-center gap-2" onclick={() => void unlockMelodyAudio()}>
					<span>Drone</span>
					<Switch bind:checked={melodyDroneOn} />
				</div>
			</div>
		</div>
	</div>
{/if}
