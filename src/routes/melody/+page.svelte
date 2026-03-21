<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import {
		MelodyEngine,
		type MelodyEngineConfig,
		type MelodyPhraseNote,
		type MelodyTick,
		type MelodyStage
	} from '$lib/melody/engine';

	const modeOptions = ['interactive', 'passive'] as const;
	const representationOptions = ['solfege', 'numbers'] as const;
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
	const circleOfFifths = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
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

	let mode = $state<(typeof modeOptions)[number]>('interactive');
	let practiceMode = $state<'phrase' | 'scale' | 'single'>('phrase');
	let scaleMode = $state<(typeof SCALE_OPTIONS)[number]>('major');
	let showScaleNames = $state(false);
	let scaleChoices = $state<(typeof SCALE_OPTIONS)[number][]>([]);
	let scaleCorrect = $state<(typeof SCALE_OPTIONS)[number] | ''>('');
	let scaleFeedback = $state<'idle' | 'correct' | 'incorrect'>('idle');
	let singleChoices = $state<string[]>([]);
	let singleCorrect = $state('');
	let singleFeedback = $state<'idle' | 'correct' | 'incorrect'>('idle');
	let representation = $state<(typeof representationOptions)[number]>('solfege');
	let key = $state('0');
	let keyMode = $state<'major' | 'minor'>('major');
	let bpm = $state(92);
	let phraseLength = $state(4);
	let loopBars = $state(8);
	let maxLeap = $state(2);
	let autoAdvanceKey = $state(true);
	let droneOn = $state(false);
	let audioReady = $state(false);
	let isPlaying = $state(false);
	let stage = $state<'idle' | 'count-in' | 'playing' | 'rest'>('idle');
	let currentStep = $state(0);
	let currentDegree = $state('');
	let phraseDegrees = $state<string[]>([]);
	let inputDegrees = $state<string[]>([]);
	let allowedDegrees = $state<string[]>([...DIATONIC_MAJOR]);
	let feedback = $state<'idle' | 'correct' | 'incorrect'>('idle');
	let reveal = $state(false);
	let lastConfigKey = $state('');
	let suppressRestart = $state(false);

	const handleLoopAdvance = (loopIndex: number) => {
		if (!autoAdvanceKey || mode !== 'passive') return;
		suppressRestart = true;
		const currentIndex = circleOfFifths.indexOf(Number(key));
		const nextIndex = (currentIndex + 1 + circleOfFifths.length) % circleOfFifths.length;
		key = String(circleOfFifths[nextIndex]);
		engine.setConfig({ keyPc: Number(key) });
		if (droneOn) {
			engine.startDrone();
		}
		setTimeout(() => {
			suppressRestart = false;
		}, 0);
		void loopIndex;
	};

	const engine = new MelodyEngine({
		onTick: (tick: MelodyTick) => {
			stage = tick.stage;
			currentStep = tick.step;
			currentDegree = String(tick.degree);
		},
		onStageChange: (nextStage: MelodyStage) => {
			stage = nextStage;
			if (nextStage === 'idle') {
				isPlaying = false;
			}
		},
		onPhrase: (phrase: MelodyPhraseNote[]) => {
			phraseDegrees = phrase.map((note) => String(note.degree));
		},
		onLoop: (loopIndex: number) => {
			handleLoopAdvance(loopIndex);
		}
	} as any);

	const keyLabel = $derived(harmonyKeys.find((item) => String(item.pc) === key)?.label ?? 'C');
	const nextKeyLabel = $derived((() => {
		if (!autoAdvanceKey) return null;
		const currentIndex = circleOfFifths.indexOf(Number(key));
		const nextIndex = (currentIndex + 1 + circleOfFifths.length) % circleOfFifths.length;
		const nextKeyPc = circleOfFifths[nextIndex];
		return harmonyKeys.find((item) => item.pc === nextKeyPc)?.label ?? 'C';
	})());
	const diatonicRow = $derived(keyMode === 'minor' ? DIATONIC_MINOR : DIATONIC_MAJOR);
	const chromaticRow = $derived(FULL_DEGREES.filter((degree) => !diatonicRow.includes(degree)));
	const diatonicSelected = $derived(
		diatonicRow.filter((degree) => allowedDegrees.includes(degree))
	);
	const chromaticSelected = $derived(
		chromaticRow.filter((degree) => allowedDegrees.includes(degree))
	);
	const progressPercent = $derived(
		phraseLength ? Math.min(((currentStep + 1) / phraseLength) * 100, 100) : 0
	);
	const configKey = $derived(
		`${practiceMode}-${scaleMode}-${mode}-${representation}-${key}-${keyMode}-${bpm}-${phraseLength}-${loopBars}-${maxLeap}-${autoAdvanceKey}-${droneOn}-${
			allowedDegrees.join(',')
		}`
	);

	const labelForDegree = (degree: string) =>
		representation === 'solfege' ? solfegeMap[degree] ?? degree : degree;
	const labelForScale = (scale: (typeof SCALE_OPTIONS)[number] | '') =>
		scale ? SCALE_LABELS[scale] : '';
	const labelForScaleChoice = (scale: (typeof SCALE_OPTIONS)[number], index: number) =>
		showScaleNames ? SCALE_LABELS[scale] : `Option ${index + 1}`;

	const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);

	const isDegreeSelected = (degree: string) => allowedDegrees.includes(degree);

	const toggleDegree = (degree: string) => {
		if (isDegreeSelected(degree)) {
			allowedDegrees = allowedDegrees.filter((value) => value !== degree);
		} else {
			allowedDegrees = [...allowedDegrees, degree];
		}
	};

	const applyPreset = (preset: 'diatonic' | 'neighbors' | 'chromatic') => {
		if (preset === 'diatonic') {
			allowedDegrees = [...diatonicRow];
			return;
		}
		if (preset === 'neighbors') {
			const merged = Array.from(new Set([...diatonicRow, ...NEIGHBOR_DEGREES]));
			allowedDegrees = merged;
			return;
		}
		allowedDegrees = [...FULL_DEGREES];
	};

	const unlockAudio = async () => {
		if (audioReady) return;
		try {
			await engine.unlock();
			audioReady = true;
		} catch {
			audioReady = false;
		}
	};

	const resetInteractive = () => {
		inputDegrees = [];
		feedback = 'idle';
		reveal = false;
	};

	const generatePhrase = () => {
		let allowed = allowedDegrees;
		let nextKeyPc = Number(key);
		let nextMode = keyMode;
		if (practiceMode === 'scale') {
			allowed = SCALE_DEGREES[scaleMode];
		} else if (practiceMode === 'single') {
			const candidates = allowedDegrees.length ? allowedDegrees : diatonicRow;
			const degree = shuffle(candidates)[0] ?? '1';
			const offset = DEGREE_OFFSETS[degree] ?? 0;
			nextKeyPc = (FIXED_SINGLE_MIDI - 60 - offset + 1200) % 12;
			allowed = [degree];
			singleCorrect = degree;
			singleChoices = shuffle(Array.from(new Set([degree, ...diatonicRow]))).slice(0, 4);
			singleFeedback = 'idle';
			key = String(nextKeyPc);
			nextMode = keyMode;
		}
		engine.setConfig({
			bpm,
			keyPc: nextKeyPc,
			mode: nextMode,
			phraseLength: practiceMode === 'single' ? 1 : phraseLength,
			loopBars,
			maxLeap,
			loop: mode === 'passive',
			countInBars: 1,
			regenerateOnLoop: mode === 'passive',
			allowedDegrees: allowed
		} as Partial<MelodyEngineConfig>);
		engine.generatePhrase();
	};

	const startPlayback = async () => {
		await unlockAudio();
		if (practiceMode === 'scale') {
			scaleCorrect = scaleMode;
			scaleChoices = shuffle([...SCALE_OPTIONS]);
			scaleFeedback = 'idle';
		}
		if (mode === 'passive' || phraseDegrees.length === 0) {
			generatePhrase();
		}
		if (mode === 'interactive') {
			resetInteractive();
		}
		engine.start();
		if (droneOn) engine.startDrone();
		isPlaying = true;
	};

	const stopPlayback = () => {
		engine.stop();
		engine.stopDrone();
		isPlaying = false;
		stage = 'idle';
		currentStep = 0;
		currentDegree = '';
	};

	const togglePlayback = () => {
		if (isPlaying) stopPlayback();
		else void startPlayback();
	};

	const onTapDegree = (degree: string) => {
		if (mode !== 'interactive') return;
		if (inputDegrees.length >= phraseLength) return;
		inputDegrees = [...inputDegrees, degree];
	};

	const submitAnswer = () => {
		const isCorrect =
			inputDegrees.length === phraseDegrees.length &&
			inputDegrees.every((value, index) => value === phraseDegrees[index]);
		feedback = isCorrect ? 'correct' : 'incorrect';
	};

	const submitScale = (choice: (typeof SCALE_OPTIONS)[number]) => {
		scaleFeedback = choice === scaleCorrect ? 'correct' : 'incorrect';
	};

	const submitSingle = (choice: string) => {
		singleFeedback = choice === singleCorrect ? 'correct' : 'incorrect';
	};

	const nextPhrase = () => {
		resetInteractive();
		generatePhrase();
		if (isPlaying) engine.start();
	};

	const backspace = () => {
		inputDegrees = inputDegrees.slice(0, -1);
	};

	const clearInput = () => {
		inputDegrees = [];
	};

	onMount(() => {
		if (typeof window === 'undefined') return;
		window.localStorage.setItem('tm:lastMode', 'melody');
		const raw = window.localStorage.getItem('tm:melodyQuickstart');
		const shared = window.localStorage.getItem('tm:melodySettings');
		if (raw) {
			try {
				const saved = JSON.parse(raw) as Partial<{
					mode: (typeof modeOptions)[number];
					practiceMode: 'phrase' | 'scale' | 'single';
					scaleMode: (typeof SCALE_OPTIONS)[number];
					showScaleNames: boolean;
					representation: (typeof representationOptions)[number];
					key: string;
					keyMode: 'major' | 'minor';
					bpm: number;
					phraseLength: number;
					loopBars: number;
					maxLeap: number;
					autoAdvanceKey: boolean;
					droneOn: boolean;
					allowedDegrees: string[];
				}>;
				if (saved.mode) mode = saved.mode;
				if (saved.practiceMode) practiceMode = saved.practiceMode;
				if (saved.scaleMode) scaleMode = saved.scaleMode;
				if (typeof saved.showScaleNames === 'boolean') showScaleNames = saved.showScaleNames;
				if (saved.representation) representation = saved.representation;
				if (typeof saved.key === 'string') key = saved.key;
				if (saved.keyMode) keyMode = saved.keyMode;
				if (typeof saved.bpm === 'number') bpm = saved.bpm;
				if (typeof saved.phraseLength === 'number') phraseLength = saved.phraseLength;
				if (typeof saved.loopBars === 'number') loopBars = saved.loopBars;
				if (typeof saved.maxLeap === 'number') maxLeap = saved.maxLeap;
				if (typeof saved.autoAdvanceKey === 'boolean') autoAdvanceKey = saved.autoAdvanceKey;
				if (typeof saved.droneOn === 'boolean') droneOn = saved.droneOn;
				if (Array.isArray(saved.allowedDegrees)) allowedDegrees = saved.allowedDegrees;
			} catch {
				// ignore
			}
		}
		if (shared) {
			try {
				const saved = JSON.parse(shared) as Partial<{ allowedDegrees: string[] }>;
				if (Array.isArray(saved.allowedDegrees)) allowedDegrees = saved.allowedDegrees;
			} catch {
				// ignore
			}
		}
		generatePhrase();
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		window.localStorage.setItem(
			'tm:melodyQuickstart',
			JSON.stringify({
				mode,
				practiceMode,
				scaleMode,
				showScaleNames,
				representation,
				key,
				keyMode,
				bpm,
				phraseLength,
				loopBars,
				maxLeap,
				autoAdvanceKey,
				droneOn,
				allowedDegrees
			})
		);
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		window.localStorage.setItem(
			'tm:melodySettings',
			JSON.stringify({ allowedDegrees })
		);
	});

	$effect(() => {
		if (!allowedDegrees.length) {
			allowedDegrees = [...diatonicRow];
		}
	});

	$effect(() => {
		if (!isPlaying && mode === 'passive') {
			generatePhrase();
		}
	});

	$effect(() => {
		if (isPlaying && configKey !== lastConfigKey) {
			if (!suppressRestart) {
				stopPlayback();
				void startPlayback();
			}
		}
		lastConfigKey = configKey;
	});

	$effect(() => {
		if (!audioReady || !isPlaying) return;
		if (droneOn) engine.startDrone();
		else engine.stopDrone();
	});

	onDestroy(() => {
		engine.stop();
		engine.stopDrone();
	});
</script>

<style>
	@keyframes melody-pulse {
		0% {
			transform: scale(1);
			opacity: 0.55;
		}
		70% {
			transform: scale(1.35);
			opacity: 0;
		}
		100% {
			opacity: 0;
		}
	}
</style>

<div class="min-h-screen px-6 py-10 pb-32 lg:px-10 lg:pb-10">
	<div class="mx-auto flex max-w-5xl flex-col gap-8">
		<header class="space-y-3">
			<div class="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
				Melody · Quickstart
			</div>
			<h1 class="font-display text-3xl font-semibold text-foreground md:text-4xl">
				Hear the line
			</h1>
			<p class="max-w-xl text-sm text-muted-foreground md:text-base">
				Movable Do phrases you can tap back or sing along with.
			</p>
		</header>

		<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
			<Card.Header class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div>
					<Card.Title class="font-display text-2xl">{mode === 'interactive' ? 'Call & response' : 'Listen & sing'}</Card.Title>
					<Card.Description class="text-base">
						{mode === 'interactive'
							? 'Listen once, then tap the phrase.'
							: 'Looped phrases with a moving key center.'}
					</Card.Description>
				</div>
				<div class="flex items-center gap-3">
					<Badge variant="secondary" class="text-xs">Key {keyLabel}</Badge>
					<Badge variant={stage === 'playing' ? 'default' : 'secondary'} class="text-xs">
						{stage === 'count-in'
							? 'Count-in'
							: stage === 'playing'
								? 'Playing'
								: stage === 'rest'
									? 'Rest'
									: 'Idle'}
					</Badge>
					{#if !audioReady}
						<Button size="sm" variant="secondary" onclick={() => void unlockAudio()}>
							Enable audio
						</Button>
					{/if}
					<div class="relative">
						{#if isPlaying}
							<span
								class="absolute inset-0 rounded-full border border-primary/40 blur-sm"
								style={`animation: melody-pulse ${60 / bpm}s ease-out infinite;`}
							></span>
						{/if}
						<Button onclick={togglePlayback} class="relative px-5">
							{isPlaying ? 'Stop' : 'Play'}
						</Button>
					</div>
				</div>
			</Card.Header>
			<Card.Content class="space-y-6">
				<div class="flex flex-wrap items-center gap-2">
					<ToggleGroup.Root type="single" bind:value={practiceMode} class="flex gap-2">
						<ToggleGroup.Item value="phrase" class="px-3 text-xs">Phrase</ToggleGroup.Item>
						<ToggleGroup.Item value="scale" class="px-3 text-xs">Scale color</ToggleGroup.Item>
						<ToggleGroup.Item value="single" class="px-3 text-xs">Single note</ToggleGroup.Item>
					</ToggleGroup.Root>
				</div>
				<div class="h-2 w-full rounded-full bg-border/60">
					<div
						class="h-full rounded-full bg-primary/70 transition-all"
						style={`width: ${progressPercent}%;`}
					></div>
				</div>

				{#if practiceMode === 'phrase' && mode === 'interactive'}
					<div class="space-y-4">
						<div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/60 px-3 py-2">
							<span class="text-xs text-muted-foreground">Representation</span>
							<ToggleGroup.Root type="single" bind:value={representation} class="flex gap-2">
								{#each representationOptions as value}
									<ToggleGroup.Item value={value} class="px-3 text-xs capitalize">
										{value}
									</ToggleGroup.Item>
								{/each}
							</ToggleGroup.Root>
						</div>
						<div class="grid grid-cols-4 gap-2">
							{#each Array.from({ length: phraseLength }) as _, index}
								<div
									class={`rounded-lg border border-border/60 px-2 py-3 text-center text-sm font-semibold uppercase tracking-wide ${
										currentStep === index && stage === 'playing'
											? 'bg-[var(--surface-2)] text-foreground'
											: 'text-muted-foreground'
									}`}
								>
									{inputDegrees[index] ? labelForDegree(inputDegrees[index]) : '·'}
								</div>
							{/each}
						</div>
						<div class="grid grid-cols-7 gap-2">
									{#each diatonicSelected as degree}
										<Button
											variant="secondary"
											onclick={() => onTapDegree(degree)}
										>
											{labelForDegree(degree)}
										</Button>
									{/each}
								</div>
								<div class="grid grid-cols-9 gap-2">
									{#each chromaticSelected as degree}
										<Button
											variant="secondary"
											onclick={() => onTapDegree(degree)}
										>
											{labelForDegree(degree)}
										</Button>
									{/each}
								</div>
						<div class="flex flex-wrap items-center gap-2">
							<Button onclick={submitAnswer}>Submit</Button>
							<Button variant="secondary" onclick={backspace}>
								Backspace
							</Button>
							<Button variant="secondary" onclick={clearInput}>
								Clear
							</Button>
							<Button variant="ghost" onclick={() => (reveal = !reveal)}>
								{reveal ? 'Hide' : 'Reveal'}
							</Button>
							<Button variant="ghost" onclick={nextPhrase}>
								Next phrase
							</Button>
						</div>
						{#if feedback !== 'idle'}
							<div
								class={`rounded-lg border border-border/60 px-3 py-2 text-sm ring-1 ${
									feedback === 'correct'
										? 'bg-emerald-500/10 text-emerald-200 ring-emerald-400/30'
										: 'bg-rose-500/10 text-rose-200 ring-rose-400/30'
								}`}
							>
								{feedback === 'correct'
									? 'Correct. Sing it once more.'
									: 'Not quite. Try again or reveal.'}
							</div>
						{/if}
						{#if reveal}
							<div class="rounded-lg border border-border/60 bg-[var(--surface-2)] px-3 py-2 text-sm text-muted-foreground">
									Answer: {phraseDegrees.map((degree) => labelForDegree(degree)).join(' · ')}
								</div>
						{/if}
					</div>
				{:else if practiceMode === 'phrase'}
					<div class="space-y-4">
						<div class="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{#each phraseDegrees as degree, index}
								<div
									class={`rounded-lg border border-border/60 px-2 py-3 ${
										currentStep === index && stage === 'playing'
											? 'bg-[var(--surface-2)] text-foreground'
											: 'bg-transparent'
									}`}
								>
									{labelForDegree(degree)}
								</div>
							{/each}
						</div>
						<div class="rounded-lg border border-border/60 bg-[var(--surface-2)] px-3 py-2 text-sm text-muted-foreground">
							Auto-advance key is {autoAdvanceKey ? 'on' : 'off'}. New phrases rotate every loop.
							{#if autoAdvanceKey && nextKeyLabel}
								<span class="ml-2 text-foreground">Next key: {nextKeyLabel}</span>
							{/if}
						</div>
					</div>
				{:else if practiceMode === 'scale'}
					<div class="space-y-4">
						<div class="rounded-2xl border border-border/70 bg-[var(--surface-1)] p-6">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What to listen for</div>
							<div class="mt-2 text-sm">
								Which scale color is this over the tonic drone?
							</div>
							<div class="mt-4 flex flex-wrap gap-2">
								{#each scaleChoices as choice, index}
									<Button variant="secondary" onclick={() => submitScale(choice)}>
										{labelForScaleChoice(choice, index)}
									</Button>
								{/each}
							</div>
							{#if scaleFeedback !== 'idle'}
								<div
									class={`mt-4 rounded-lg border border-border/60 px-3 py-2 text-sm ring-1 ${
										scaleFeedback === 'correct'
											? 'bg-emerald-500/10 text-emerald-200 ring-emerald-400/30'
											: 'bg-rose-500/10 text-rose-200 ring-rose-400/30'
									}`}
								>
									{scaleFeedback === 'correct'
										? 'Correct. Listen for that color again.'
										: 'Not quite. It was ' + labelForScale(scaleCorrect) + '.'}
								</div>
							{/if}
						</div>
					</div>
				{:else}
					<div class="space-y-4">
						<div class="rounded-2xl border border-border/70 bg-[var(--surface-1)] p-6">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What to listen for</div>
							<div class="mt-2 text-sm">
								Same pitch, new key. What is this note's function now?
							</div>
							<div class="mt-4 flex flex-wrap gap-2">
								{#each singleChoices as choice}
									<Button variant="secondary" onclick={() => submitSingle(choice)}>
										{labelForDegree(choice)}
									</Button>
								{/each}
							</div>
							{#if singleFeedback !== 'idle'}
								<div
									class={`mt-4 rounded-lg border border-border/60 px-3 py-2 text-sm ring-1 ${
										singleFeedback === 'correct'
											? 'bg-emerald-500/10 text-emerald-200 ring-emerald-400/30'
											: 'bg-rose-500/10 text-rose-200 ring-rose-400/30'
									}`}
								>
									{singleFeedback === 'correct'
										? 'Correct. Hear how the note\'s role shifts.'
										: 'Not quite. It was ' + labelForDegree(singleCorrect) + '.'}
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<details class="rounded-xl border border-border/60 bg-card/80 p-4 shadow-none backdrop-blur lg:shadow-lg">
			<summary class="flex cursor-pointer items-center justify-between text-sm font-semibold">
				Settings
				<span class="text-xs text-muted-foreground">Mode · Key · Phrase</span>
			</summary>
			<div class="mt-4 grid gap-4 md:grid-cols-3">
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
					<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mode</div>
					<ToggleGroup.Root type="single" bind:value={mode} class="mt-2 flex flex-wrap gap-2">
						{#each modeOptions as value}
							<ToggleGroup.Item value={value} class="px-3 text-xs capitalize">
								{value}
							</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
					<div class="mt-2 flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
						<span class="text-xs text-muted-foreground">Auto‑advance key</span>
						<Switch bind:checked={autoAdvanceKey} />
					</div>
				</div>
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
					<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key & Mode</div>
					<Select.Root type="single" bind:value={key as never}>
						<Select.Trigger class="mt-2 w-full">
							<span>{keyLabel}</span>
						</Select.Trigger>
						<Select.Content>
							{#each harmonyKeys as keyOption}
								<Select.Item value={String(keyOption.pc)}>{keyOption.label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<ToggleGroup.Root type="single" bind:value={keyMode} class="mt-2 flex flex-wrap gap-2">
						<ToggleGroup.Item value="major" class="px-3 text-xs">Major</ToggleGroup.Item>
						<ToggleGroup.Item value="minor" class="px-3 text-xs">Minor</ToggleGroup.Item>
					</ToggleGroup.Root>
					<div class="mt-2 flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
						<span class="text-xs text-muted-foreground">Drone</span>
						<Switch bind:checked={droneOn} onclick={() => void unlockAudio()} />
					</div>
				</div>
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
					<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phrase</div>
					<div class="mt-2 flex items-center justify-between text-xs text-muted-foreground">
						<span>Length</span>
						<span class="text-foreground">{phraseLength} notes</span>
					</div>
					<Slider type="single" min={2} max={7} step={1} bind:value={phraseLength} />
					<div class="mt-2 flex items-center justify-between text-xs text-muted-foreground">
						<span>Max leap</span>
						<span class="text-foreground">{maxLeap}</span>
					</div>
					<Slider type="single" min={1} max={4} step={1} bind:value={maxLeap} />
					<div class="mt-2 flex items-center justify-between text-xs text-muted-foreground">
						<span>Loop length</span>
						<span class="text-foreground">{loopBars} bars</span>
					</div>
					<Slider type="single" min={4} max={16} step={1} bind:value={loopBars} />
					<div class="mt-2 flex items-center justify-between text-xs text-muted-foreground">
						<span>BPM</span>
						<span class="text-foreground">{bpm}</span>
					</div>
					<Slider type="single" min={60} max={130} step={1} bind:value={bpm} />
					{#if practiceMode === 'scale'}
						<div class="mt-3 space-y-2">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scale</div>
							<ToggleGroup.Root type="single" bind:value={scaleMode} class="flex flex-wrap gap-2">
								{#each SCALE_OPTIONS as option}
									<ToggleGroup.Item value={option} class="px-3 text-xs">
										{SCALE_LABELS[option]}
									</ToggleGroup.Item>
								{/each}
							</ToggleGroup.Root>
						</div>
						<div class="mt-2 flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
							<span class="text-xs text-muted-foreground">Show scale names</span>
							<Switch bind:checked={showScaleNames} />
						</div>
					{/if}
				</div>
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3 md:col-span-3">
					<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes to practice</div>
					<div class="mt-2 flex flex-wrap gap-2">
						<Button variant="secondary" onclick={() => applyPreset('diatonic')}>Diatonic</Button>
						<Button variant="secondary" onclick={() => applyPreset('neighbors')}>Neighbors</Button>
						<Button variant="secondary" onclick={() => applyPreset('chromatic')}>Chromatic</Button>
					</div>
					<div class="mt-3 space-y-2">
						<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Diatonic</div>
						<div class="grid grid-cols-7 gap-2">
							{#each diatonicRow as degree}
								<Button
									variant={allowedDegrees.includes(degree) ? 'default' : 'secondary'}
									onclick={() => toggleDegree(degree)}
								>
									{labelForDegree(degree)}
								</Button>
							{/each}
						</div>
					</div>
					<div class="mt-3 space-y-2">
						<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chromatic</div>
						<div class="grid grid-cols-9 gap-2">
							{#each chromaticRow as degree}
								<Button
									variant={allowedDegrees.includes(degree) ? 'default' : 'secondary'}
									onclick={() => toggleDegree(degree)}
								>
									{labelForDegree(degree)}
								</Button>
							{/each}
						</div>
					</div>
					{#if mode === 'passive'}
						<div class="mt-3 flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
							<span class="text-xs text-muted-foreground">Representation</span>
							<ToggleGroup.Root type="single" bind:value={representation} class="flex gap-2">
								{#each representationOptions as value}
									<ToggleGroup.Item value={value} class="px-3 text-xs capitalize">
										{value}
									</ToggleGroup.Item>
								{/each}
							</ToggleGroup.Root>
						</div>
					{/if}
				</div>
			</div>
		</details>

		<div class="text-xs text-muted-foreground">
			iOS: Silent Mode mutes web audio. Flip the ring switch if you hear nothing.
		</div>

		<div class="text-sm text-muted-foreground">
			Need full control? <a class="underline" href="/melody/advanced">Open Melody Advanced</a>.
		</div>
	</div>
</div>
