<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { HarmonyEngine, type ChordQuality, type TriadType } from '$lib/harmony/engine';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

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
	const functionsMajor = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
	const functionsMinor = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
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
	const majorScaleOffsets = [0, 2, 4, 5, 7, 9, 11];
	const minorScaleOffsets = [0, 2, 3, 5, 7, 8, 10];

	let key = $state('0');
	let mode = $state<'major' | 'minor'>('major');
	let func = $state('I');
	let trainerFocus = $state<'function' | 'context'>('function');
	let showTheory = $state(false);
	let chordSet = $state<'triads' | 'sevenths'>('triads');
	let trainingMode = $state<'loop' | 'trainer'>('loop');
	let trainerPath = $state('home-pull');
	let trainerChoices = $state<{ label: string; degreeIndex: number }[]>([]);
	let trainerCorrect = $state(-1);
	let trainerFeedback = $state<'idle' | 'correct' | 'incorrect'>('idle');
	let contextKey = $state('0');
	let contextChordRoot = $state('0');
	let contextQuality = $state<ChordQuality>('major');
	let contextFeedback = $state<'idle' | 'correct' | 'incorrect'>('idle');
	let contextCorrect = $state<'Settled' | 'Tilted' | 'Pulling'>('Settled');
	let actionMenu = $state('');
	let droneOn = $state(true);
	let droneVolume = $state(35);
	let droneBlend = $state(40);
	let quizMode = $state(false);
	let reveal = $state(false);
	let inversion = $state<0 | 1 | 2>(0);
	let repeatOn = $state(false);
	let repeatSeconds = $state(3);
	let keepDroneOnStop = $state(true);
	let timer: ReturnType<typeof setInterval> | null = null;
	let audioReady = $state(false);

	const engine = new HarmonyEngine();

	const keyLabel = $derived(harmonyKeys.find((item) => String(item.pc) === key)?.label ?? 'C');
	const functions = $derived(mode === 'major' ? functionsMajor : functionsMinor);
	const functionIndex = $derived(functions.indexOf(func));
	const rootPc = $derived(
		(Number(key) + (mode === 'major' ? majorScaleOffsets[functionIndex] : minorScaleOffsets[functionIndex])) % 12
	);
	const rootLabel = $derived(harmonyKeys.find((item) => item.pc === rootPc)?.label ?? 'C');
	const derivedTriad = $derived(mode === 'major' ? majorQualities[functionIndex] : minorQualities[functionIndex]);
	const derivedSeventh = $derived(mode === 'major' ? majorSevenths[functionIndex] : minorSevenths[functionIndex]);
	const derivedQuality = $derived(chordSet === 'triads' ? derivedTriad : derivedSeventh);
	const feelForFunction = (index: number) => {
		if (index === 0) return 'Settled';
		if (index === 4 || index === 6) return 'Pulling';
		return 'Tilted';
	};
	const nowHearing = $derived(
		showTheory
			? `${func} in ${keyLabel} → ${rootLabel} ${derivedQuality}`
			: `${feelForFunction(functionIndex)} in ${keyLabel}`
	);
	const contextRootLabel = $derived(
		harmonyKeys.find((item) => String(item.pc) === contextChordRoot)?.label ?? 'C'
	);
	const contextNowHearing = $derived(
		`${contextRootLabel} ${contextQuality} in ${harmonyKeys.find((item) => String(item.pc) === contextKey)?.label ?? 'C'}`
	);
	const inversionLabel = $derived(inversion === 0 ? 'Root position' : inversion === 1 ? '1st inversion' : '2nd inversion');
	const isListening = $derived(repeatOn || droneOn);

	const unlockAudio = async () => {
		if (audioReady) return;
		try {
			await engine.unlock();
			audioReady = true;
		} catch {
			audioReady = false;
		}
	};

	const playChordInternal = () => {
		const next = Math.floor(Math.random() * 3) as 0 | 1 | 2;
		inversion = next;
		engine.playChord({ rootPc, quality: derivedQuality, inversion: next });
		if (quizMode) reveal = false;
	};

	const trainerPaths = [
		{
			id: 'home-pull',
			label: 'Home vs Pull (I / V)',
			choices: [
				{ label: 'Home', degreeIndex: 0 },
				{ label: 'Pull', degreeIndex: 4 }
			],
			prompt: 'Which feels most resolved?'
		},
		{
			id: 'home-away',
			label: 'Home vs Away (I / IV)',
			choices: [
				{ label: 'Home', degreeIndex: 0 },
				{ label: 'Away', degreeIndex: 3 }
			],
			prompt: 'Which feels farther from home?'
		},
		{
			id: 'away-pull',
			label: 'Away vs Pull (IV / V)',
			choices: [
				{ label: 'Away', degreeIndex: 3 },
				{ label: 'Pull', degreeIndex: 4 }
			],
			prompt: 'Which wants to resolve?'
		},
		{
			id: 'home-away-pull',
			label: 'Home / Away / Pull (I / IV / V)',
			choices: [
				{ label: 'Home', degreeIndex: 0 },
				{ label: 'Away', degreeIndex: 3 },
				{ label: 'Pull', degreeIndex: 4 }
			],
			prompt: 'Which label matches the chord you heard?'
		}
	];

	const trainerPathConfig = $derived(
		trainerPaths.find((path) => path.id === trainerPath) ?? trainerPaths[0]
	);

	const playTrainerSequence = async () => {
		await unlockAudio();
		trainerFeedback = 'idle';
		const choices = [...trainerPathConfig.choices].sort(() => Math.random() - 0.5);
		trainerChoices = choices;
		const correct = choices[Math.floor(Math.random() * choices.length)];
		trainerCorrect = correct.degreeIndex;
		const sequence = choices.map((choice) => choice.degreeIndex);
		let index = 0;
		const playNext = () => {
			const funcIndex = sequence[index];
			if (funcIndex === undefined) return;
			const derivedRoot =
				(Number(key) + (mode === 'major' ? majorScaleOffsets[funcIndex] : minorScaleOffsets[funcIndex])) % 12;
			const quality =
				chordSet === 'triads'
					? mode === 'major'
						? majorQualities[funcIndex]
						: minorQualities[funcIndex]
					: mode === 'major'
						? majorSevenths[funcIndex]
						: minorSevenths[funcIndex];
			const next = Math.floor(Math.random() * 3) as 0 | 1 | 2;
			inversion = next;
			engine.playChord({ rootPc: derivedRoot, quality, inversion: next });
			index += 1;
			if (index < sequence.length) {
				setTimeout(playNext, 1400);
			}
		};
		playNext();
	};

	const submitTrainer = (choice: number) => {
		trainerFeedback = choice === trainerCorrect ? 'correct' : 'incorrect';
	};

	const playContextChord = async () => {
		await unlockAudio();
		const basePc = Number(contextKey);
		const chordPc = Number(contextChordRoot);
		const offset = (chordPc - basePc + 12) % 12;
		contextCorrect = offset === 0 ? 'Settled' : offset === 7 || offset === 11 ? 'Pulling' : 'Tilted';
		contextFeedback = 'idle';
		engine.playChord({ rootPc: chordPc, quality: contextQuality, inversion: 0 });
	};

	const submitContext = (choice: 'Settled' | 'Tilted' | 'Pulling') => {
		contextFeedback = choice === contextCorrect ? 'correct' : 'incorrect';
	};

	const playChord = async () => {
		await unlockAudio();
		playChordInternal();
	};

	const startRepeat = () => {
		if (timer) return;
		if (!audioReady) return;
		playChordInternal();
		timer = setInterval(playChordInternal, repeatSeconds * 1000);
	};

	const stopRepeat = () => {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	};

	const stopLoop = () => {
		repeatOn = false;
		stopRepeat();
		if (!keepDroneOnStop) droneOn = false;
	};

	const stopAll = () => {
		stopRepeat();
		repeatOn = false;
		droneOn = false;
	};

	$effect(() => {
		engine.setKeyPc(Number(key));
		engine.setDroneVolume(droneVolume / 100);
		engine.setDroneBlend(droneBlend / 100);
		if (!audioReady) return;
		if (droneOn) engine.startDrone();
		else engine.stopDrone();
	});

	$effect(() => {
		if (!functions.includes(func)) func = functions[0];
	});

	$effect(() => {
		if (!audioReady) return;
		if (repeatOn) startRepeat();
		else stopRepeat();
	});

	$effect(() => {
		if (trainingMode === 'trainer' && repeatOn) {
			repeatOn = false;
			stopRepeat();
		}
	});

	$effect(() => {
		if (actionMenu === 'stop-loop') {
			stopLoop();
			actionMenu = '';
			return;
		}
		if (actionMenu === 'stop-all') {
			stopAll();
			actionMenu = '';
		}
	});

	$effect(() => {
		if (!repeatOn || !audioReady) return;
		stopRepeat();
		startRepeat();
	});

	onMount(() => {
		if (typeof window !== 'undefined') {
			window.localStorage.setItem('tm:lastMode', 'harmony');
			const raw = window.localStorage.getItem('tm:harmonyQuickstart');
			if (raw) {
				try {
					const saved = JSON.parse(raw) as Partial<{
						keepDroneOnStop: boolean;
						droneOn: boolean;
					}>;
					if (typeof saved.keepDroneOnStop === 'boolean')
						keepDroneOnStop = saved.keepDroneOnStop;
					if (typeof saved.droneOn === 'boolean') droneOn = saved.droneOn;
				} catch {
					// ignore
				}
			}
		}
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		window.localStorage.setItem(
			'tm:harmonyQuickstart',
			JSON.stringify({
				keepDroneOnStop,
				droneOn
			})
		);
	});

	onDestroy(() => {
		stopRepeat();
		engine.stopDrone();
	});
</script>

<style>
	@keyframes harmony-pulse {
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
				Harmony · Quickstart
			</div>
			<h1 class="font-display text-3xl font-semibold text-foreground md:text-4xl">
				Hear the function
			</h1>
			<p class="max-w-xl text-sm text-muted-foreground md:text-base">
				Drone + function → listen, then name the chord.
			</p>
		</header>

		<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
			<Card.Header class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div>
					<Card.Title class="font-display text-2xl">
						{trainingMode === 'loop' ? 'Listen loop' : 'Function trainer'}
					</Card.Title>
					<Card.Description class="text-base">
						{trainingMode === 'loop'
							? 'Let the home base anchor the key while chords repeat.'
							: trainerFocus === 'function'
								? trainerPathConfig.prompt
								: 'Same chord, different home base. What does it feel like now?'}
					</Card.Description>
					<div class="mt-2 text-sm text-muted-foreground">
						{chordSet === 'triads'
							? 'Triad quality follows the function in the selected mode.'
							: '7th chord quality follows the function in the selected mode.'}
					</div>
					<div class="mt-2 text-xs text-muted-foreground">
						Functions are relative to the key center.
					</div>
				</div>
				<div class="flex items-center gap-3">
					<Badge variant="secondary" class="text-xs">Home base {keyLabel}</Badge>
					<Badge variant={isListening ? 'default' : 'secondary'} class="text-xs">
						{isListening ? 'Listening' : 'Idle'}
					</Badge>
					{#if !audioReady}
						<Button size="sm" variant="secondary" onclick={() => void unlockAudio()}>
							Enable audio
						</Button>
					{/if}
					<div class="relative">
						{#if repeatOn}
							<span
								class="absolute inset-0 rounded-full border border-primary/40 blur-sm"
								style={`animation: harmony-pulse ${repeatSeconds}s ease-out infinite;`}
							></span>
						{/if}
						<Button
							onclick={() =>
								trainingMode === 'trainer'
									? void playTrainerSequence()
									: void playChord()
							}
							class="relative px-5"
						>
							{trainingMode === 'trainer' ? 'Play set' : 'Play now'}
						</Button>
					</div>
					<Select.Root type="single" bind:value={actionMenu as never}>
						<Select.Trigger class="h-9 w-[120px]">
							<span>Actions</span>
						</Select.Trigger>
						<Select.Content>
							{#if trainingMode === 'loop'}
								<Select.Item value="stop-loop">Stop loop</Select.Item>
							{/if}
							<Select.Item value="stop-all">Stop all</Select.Item>
						</Select.Content>
					</Select.Root>
				</div>
			</Card.Header>
			<Card.Content class="space-y-6">
				<div class="flex flex-wrap items-center gap-2">
					<ToggleGroup.Root type="single" bind:value={trainingMode} class="flex gap-2">
						<ToggleGroup.Item value="loop" class="px-3 text-xs">Listen loop</ToggleGroup.Item>
						<ToggleGroup.Item value="trainer" class="px-3 text-xs">Function trainer</ToggleGroup.Item>
					</ToggleGroup.Root>
					{#if trainingMode === 'trainer'}
						<ToggleGroup.Root type="single" bind:value={trainerFocus} class="flex gap-2">
							<ToggleGroup.Item value="function" class="px-3 text-xs">Feel in key</ToggleGroup.Item>
							<ToggleGroup.Item value="context" class="px-3 text-xs">Chord in new key</ToggleGroup.Item>
						</ToggleGroup.Root>
					{/if}
					<ToggleGroup.Root type="single" bind:value={chordSet} class="flex gap-2">
						<ToggleGroup.Item value="triads" class="px-3 text-xs">Triads</ToggleGroup.Item>
						<ToggleGroup.Item value="sevenths" class="px-3 text-xs">7ths</ToggleGroup.Item>
					</ToggleGroup.Root>
					{#if trainingMode === 'trainer' && trainerFocus === 'function'}
						<Select.Root type="single" bind:value={trainerPath as never}>
							<Select.Trigger class="h-8 w-[220px]">
								<span>{trainerPathConfig.label}</span>
							</Select.Trigger>
							<Select.Content>
								{#each trainerPaths as path}
									<Select.Item value={path.id}>{path.label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					{/if}
				</div>

				{#if trainingMode === 'trainer' && trainerFocus === 'function'}
					<div class="rounded-2xl border border-border/70 bg-[var(--surface-1)] p-6">
						<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							What to listen for
						</div>
						<div class="mt-2 text-sm">
							{trainerPathConfig.prompt}
						</div>
						<div class="mt-4 flex flex-wrap gap-2">
							{#each trainerChoices as choice}
								<Button
									variant="secondary"
									onclick={() => submitTrainer(choice.degreeIndex)}
								>
									{choice.label}
								</Button>
							{/each}
						</div>
						{#if trainerFeedback !== 'idle'}
							<div
								class={`mt-4 rounded-lg border border-border/60 px-3 py-2 text-sm ring-1 ${
									trainerFeedback === 'correct'
										? 'bg-emerald-500/10 text-emerald-200 ring-emerald-400/30'
										: 'bg-rose-500/10 text-rose-200 ring-rose-400/30'
								}`}
							>
								{trainerFeedback === 'correct'
									? 'Correct. Listen for that feeling again.'
									: 'Not quite. Replay and listen for the pull.'}
							</div>
						{/if}
					</div>
				{:else if trainingMode === 'trainer' && trainerFocus === 'context'}
					<div class="rounded-2xl border border-border/70 bg-[var(--surface-1)] p-6">
						<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Chord in another key
						</div>
						<div class="mt-2 text-sm text-muted-foreground">
							Chord you’re hearing: {contextNowHearing}
						</div>
						<div class="mt-4 grid gap-3 md:grid-cols-3">
							<div>
								<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Home base
								</div>
								<Select.Root type="single" bind:value={contextKey as never}>
									<Select.Trigger class="mt-2 w-full">
										<span>{harmonyKeys.find((item) => String(item.pc) === contextKey)?.label ?? 'C'}</span>
									</Select.Trigger>
									<Select.Content>
										{#each harmonyKeys as keyOption}
											<Select.Item value={String(keyOption.pc)}>{keyOption.label}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</div>
							<div>
								<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Chord root
								</div>
								<Select.Root type="single" bind:value={contextChordRoot as never}>
									<Select.Trigger class="mt-2 w-full">
										<span>{contextRootLabel}</span>
									</Select.Trigger>
									<Select.Content>
										{#each harmonyKeys as keyOption}
											<Select.Item value={String(keyOption.pc)}>{keyOption.label}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</div>
							<div>
								<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Chord quality
								</div>
								<Select.Root type="single" bind:value={contextQuality as never}>
									<Select.Trigger class="mt-2 w-full">
										<span>{contextQuality}</span>
									</Select.Trigger>
									<Select.Content>
										{#each ['major','minor','diminished','augmented','maj7','dom7','min7','m7b5','dim7'] as quality}
											<Select.Item value={quality}>{quality}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</div>
						</div>
						<div class="mt-4 flex flex-wrap items-center gap-2">
							<Button onclick={() => void playContextChord()}>Play chord</Button>
							<Button variant="secondary" onclick={() => submitContext('Settled')}>Settled</Button>
							<Button variant="secondary" onclick={() => submitContext('Tilted')}>Tilted</Button>
							<Button variant="secondary" onclick={() => submitContext('Pulling')}>Pulling</Button>
						</div>
						{#if contextFeedback !== 'idle'}
							<div
								class={`mt-3 rounded-lg border border-border/60 px-3 py-2 text-sm ring-1 ${
									contextFeedback === 'correct'
										? 'bg-emerald-500/10 text-emerald-200 ring-emerald-400/30'
										: 'bg-rose-500/10 text-rose-200 ring-rose-400/30'
								}`}
							>
								{contextFeedback === 'correct'
									? 'Correct. Notice how the home base shifts the feel.'
									: 'Not quite. Replay and feel the pull.'}
							</div>
						{/if}
					</div>
				{:else}
					<div class="grid gap-4 md:grid-cols-3">
						<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								{showTheory ? 'Function' : 'Role / Feel'}
							</div>
							<div class="text-sm font-semibold">
								{showTheory ? (quizMode && !reveal ? 'Hidden' : func) : feelForFunction(functionIndex)}
							</div>
							<div class="text-xs text-muted-foreground">{mode} mode</div>
						</div>
						<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								{chordSet === 'triads' ? 'Triad' : '7th chord'}
							</div>
							<div class="text-sm font-semibold">
								{showTheory ? (quizMode && !reveal ? 'Hidden' : derivedQuality) : 'Listen for color'}
							</div>
							<div class="text-xs text-muted-foreground">Random inversion</div>
						</div>
						<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inversion</div>
							{#if quizMode && !reveal}
								<div class="text-sm font-semibold">Hidden</div>
								<Button size="sm" variant="secondary" class="mt-2" onclick={() => (reveal = true)}>
									Reveal
								</Button>
							{:else}
								<div class="text-sm font-semibold">{inversionLabel}</div>
							{/if}
						</div>
					</div>
					<div class="rounded-lg border border-border/60 bg-[var(--surface-2)] px-3 py-2 text-xs text-muted-foreground">
						Now hearing: {nowHearing}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<details class="rounded-xl border border-border/60 bg-card/80 p-4 shadow-none backdrop-blur lg:shadow-lg">
			<summary class="flex cursor-pointer items-center justify-between text-sm font-semibold">
				Settings
				<span class="text-xs text-muted-foreground">Home base · Feel · Drone</span>
			</summary>
			<div class="mt-4 grid gap-4 md:grid-cols-3">
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
					<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Home base & Mode
					</div>
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
					<ToggleGroup.Root type="single" bind:value={mode} class="mt-2 flex flex-wrap gap-2">
						<ToggleGroup.Item value="major" class="px-3 text-xs">Major</ToggleGroup.Item>
						<ToggleGroup.Item value="minor" class="px-3 text-xs">Minor</ToggleGroup.Item>
					</ToggleGroup.Root>
				</div>
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
					<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{showTheory ? 'Function' : 'Role / Feel'}
					</div>
					<ToggleGroup.Root type="single" bind:value={func} class="mt-2 flex flex-wrap gap-2">
						{#each functions as value}
							<ToggleGroup.Item value={value} class="px-3 text-xs">
								{value}
							</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
					<div class="mt-2 flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
						<span class="text-xs text-muted-foreground">Chord set</span>
						<ToggleGroup.Root type="single" bind:value={chordSet} class="flex gap-2">
							<ToggleGroup.Item value="triads" class="px-3 text-xs">Triads</ToggleGroup.Item>
							<ToggleGroup.Item value="sevenths" class="px-3 text-xs">7ths</ToggleGroup.Item>
						</ToggleGroup.Root>
					</div>
					<div class="mt-2 flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
						<span class="text-xs text-muted-foreground">Show theory labels</span>
						<Switch bind:checked={showTheory} />
					</div>
					<div class="mt-2 flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
						<span class="text-xs text-muted-foreground">Quiz mode</span>
						<Switch bind:checked={quizMode} />
					</div>
				</div>
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
					<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Drone + Repeat</div>
				<div
					class="mt-2 flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2"
					onclick={() => void unlockAudio()}
				>
					<span class="text-xs text-muted-foreground">Drone</span>
					<Switch bind:checked={droneOn} />
				</div>
					<div class="mt-2 flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
						<span class="text-xs text-muted-foreground">Keep drone on stop loop</span>
						<Switch bind:checked={keepDroneOnStop} />
					</div>
					<div class="mt-2 space-y-2">
						<div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							<span>Volume</span>
							<span class="text-foreground">{droneVolume}%</span>
						</div>
						<Slider type="single" min={0} max={100} step={5} bind:value={droneVolume} />
					</div>
					<div class="mt-2 space-y-2">
						<div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							<span>Repeat</span>
							<span class="text-foreground">{repeatSeconds}s</span>
						</div>
						<Slider type="single" min={2} max={5} step={1} bind:value={repeatSeconds} />
					</div>
				<div
					class="mt-2 flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2"
					onclick={() => void unlockAudio()}
				>
					<span class="text-xs text-muted-foreground">Auto‑repeat</span>
					<Switch bind:checked={repeatOn} />
				</div>
				</div>
			</div>
		</details>

		<div class="text-xs text-muted-foreground">
			iOS: Silent Mode mutes web audio. Flip the ring switch if you hear nothing.
		</div>

		<div class="text-sm text-muted-foreground">
			Need full control? <a class="underline" href="/harmony/advanced">Open Harmony Advanced</a>.
		</div>
	</div>
</div>
