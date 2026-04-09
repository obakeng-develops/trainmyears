<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { HarmonyEngine } from '$lib/harmony/engine';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	const keyOptions = [
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

	const triads = [
		{ value: 'major', label: 'maj' },
		{ value: 'minor', label: 'min' },
		{ value: 'diminished', label: 'dim' },
		{ value: 'augmented', label: 'aug' }
	] as const;

	const sevenths = [
		{ value: 'maj7', label: 'maj7' },
		{ value: 'dom7', label: '7' },
		{ value: 'min7', label: 'min7' },
		{ value: 'm7b5', label: 'm7b5' },
		{ value: 'dim7', label: 'dim7' }
	] as const;

	type TriadType = (typeof triads)[number]['value'];
	type SeventhType = (typeof sevenths)[number]['value'];
	type ChordQuality = TriadType | SeventhType;

	const presetProgressions = [
		{
			id: 'i-v-vi-iv',
			label: 'I–V–vi–IV',
			chords: [
				{ degree: 0, quality: 'major' },
				{ degree: 7, quality: 'major' },
				{ degree: 9, quality: 'minor' },
				{ degree: 5, quality: 'major' }
			]
		},
		{
			id: 'ii-v-i',
			label: 'ii–V–I',
			chords: [
				{ degree: 2, quality: 'minor' },
				{ degree: 7, quality: 'major' },
				{ degree: 0, quality: 'major' }
			]
		},
		{
			id: 'i-iv-v-i',
			label: 'I–IV–V–I',
			chords: [
				{ degree: 0, quality: 'major' },
				{ degree: 5, quality: 'major' },
				{ degree: 7, quality: 'major' },
				{ degree: 0, quality: 'major' }
			]
		},
		{
			id: 'vi-iv-i-v',
			label: 'vi–IV–I–V',
			chords: [
				{ degree: 9, quality: 'minor' },
				{ degree: 5, quality: 'major' },
				{ degree: 0, quality: 'major' },
				{ degree: 7, quality: 'major' }
			]
		},
		{
			id: 'i-bvii-iv-i',
			label: 'I–♭VII–IV–I',
			chords: [
				{ degree: 0, quality: 'major' },
				{ degree: 10, quality: 'major' },
				{ degree: 5, quality: 'major' },
				{ degree: 0, quality: 'major' }
			]
		},
		{
			id: 'i-bvii-bvi-bvii',
			label: 'i–♭VII–♭VI–♭VII',
			chords: [
				{ degree: 0, quality: 'minor' },
				{ degree: 10, quality: 'major' },
				{ degree: 8, quality: 'major' },
				{ degree: 10, quality: 'major' }
			]
		},
		{
			id: 'i-biii-iv-i',
			label: 'I–♭III–IV–I',
			chords: [
				{ degree: 0, quality: 'major' },
				{ degree: 3, quality: 'major' },
				{ degree: 5, quality: 'major' },
				{ degree: 0, quality: 'major' }
			]
		}
	] as const;

	const diatonicMajorOffsets = [0, 2, 4, 5, 7, 9, 11];
	const diatonicMajorLabels = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'] as const;
	const chromaticLabels: Record<number, string> = {
		0: 'I',
		1: 'bII',
		2: 'II',
		3: 'bIII',
		4: 'III',
		5: 'IV',
		6: 'bV',
		7: 'V',
		8: 'bVI',
		9: 'VI',
		10: 'bVII',
		11: 'VII'
	};

	let mode = $state<'listen' | 'build' | 'trainer'>('listen');
	let tonic = $state('0');
	let bpm = $state(96);
	let barsPerChord = $state(1);
	let progressionLength = $state(4);
	let presetId = $state<string>(presetProgressions[0].id);
	let droneOn = $state(true);
	let showChromatic = $state(true);
	let soundMode = $state<'piano' | 'synth'>('piano');
	let isPlaying = $state(false);
	let currentIndex = $state(0);
	let timer: ReturnType<typeof setInterval> | null = null;
	let audioReady = $state(false);
	let lastConfigKey = $state('');
	let settingsHydrated = $state(false);
	let samplerReady = $state(false);
	let samplerLoading = $state(false);
	let samplerPreloadTriggered = $state(false);

	// --- Trainer state ---
	let trainerTarget = $state(-1);
	let trainerFeedback = $state<'idle' | 'correct' | 'incorrect'>('idle');
	let trainerScore = $state({ correct: 0, total: 0 });

	let progression = $state<Array<{ rootPc: number; quality: ChordQuality }>>([
		{ rootPc: 0, quality: 'major' },
		{ rootPc: 7, quality: 'major' },
		{ rootPc: 9, quality: 'minor' },
		{ rootPc: 5, quality: 'major' }
	]);

	const engine = new HarmonyEngine();

	const keyLabel = $derived(keyOptions.find((item) => String(item.pc) === tonic)?.label ?? 'C');
	const preset = $derived(presetProgressions.find((item) => item.id === presetId) ?? presetProgressions[0]);
	const barMs = $derived((60_000 / bpm) * 4 * barsPerChord);
	const progressionChords = $derived(
		mode === 'build'
			? progression
			: preset.chords.map((entry) => ({
					rootPc: (Number(tonic) + entry.degree) % 12,
					quality: entry.quality as ChordQuality
				}))
	);
	const timelineKey = $derived(`${mode}-${presetId}-${progressionLength}`);

	const chordLabel = (rootPc: number, quality: ChordQuality) => {
		const rootLabel = keyOptions.find((item) => item.pc === rootPc)?.label ?? 'C';
		const triad = triads.find((item) => item.value === quality);
		const seventh = sevenths.find((item) => item.value === quality);
		const suffix = triad?.label ?? seventh?.label ?? String(quality);
		return `${rootLabel} ${suffix}`.replace(' ', '');
	};

	const functionLabel = (rootPc: number) => {
		const offset = (rootPc - Number(tonic) + 12) % 12;
		const diatonicIndex = diatonicMajorOffsets.indexOf(offset);
		if (diatonicIndex !== -1) return diatonicMajorLabels[diatonicIndex];
		return showChromatic ? chromaticLabels[offset] ?? '' : '';
	};

	// Trainer: build choice list from diatonic labels + any chromatic functions in the preset
	const trainerChoices = $derived.by(() => {
		const labels = new Set<string>(diatonicMajorLabels);
		for (const chord of progressionChords) {
			const label = functionLabel(chord.rootPc);
			if (label) labels.add(label);
		}
		const order = ['I', 'bII', 'ii', 'bIII', 'iii', 'IV', 'bV', 'V', 'bVI', 'vi', 'bVII', 'vii°'];
		return [...labels].sort((a, b) => order.indexOf(a) - order.indexOf(b));
	});

	const trainerCorrectLabel = $derived(
		trainerTarget >= 0 && trainerTarget < progressionChords.length
			? functionLabel(progressionChords[trainerTarget].rootPc)
			: ''
	);

	const nextTrainerRound = () => {
		// Pick a random preset different from current
		let nextPreset = presetProgressions[Math.floor(Math.random() * presetProgressions.length)];
		if (presetProgressions.length > 1) {
			let safety = 0;
			while (nextPreset.id === presetId && safety < 6) {
				nextPreset = presetProgressions[Math.floor(Math.random() * presetProgressions.length)];
				safety += 1;
			}
		}
		presetId = nextPreset.id;
		trainerTarget = Math.floor(Math.random() * nextPreset.chords.length);
		trainerFeedback = 'idle';
	};

	const submitTrainerAnswer = (label: string) => {
		if (trainerFeedback !== 'idle') return;
		trainerScore = {
			correct: trainerScore.correct + (label === trainerCorrectLabel ? 1 : 0),
			total: trainerScore.total + 1
		};
		trainerFeedback = label === trainerCorrectLabel ? 'correct' : 'incorrect';
	};

	const startTrainer = async () => {
		nextTrainerRound();
		if (!isPlaying) await startPlayback();
	};

	const ensureProgressionLength = () => {
		if (progression.length === progressionLength) return;
		const next = [...progression];
		while (next.length < progressionLength) {
			next.push({ rootPc: 0, quality: 'major' });
		}
		while (next.length > progressionLength) {
			next.pop();
		}
		progression = next;
	};

	const unlockAudio = async () => {
		if (audioReady) return;
		try {
			await (engine as any).unlock?.();
			audioReady = true;
		} catch {
			audioReady = false;
		}
	};

	const preloadSampler = async () => {
		if (samplerReady || samplerLoading || soundMode !== 'piano') return;
		samplerLoading = true;
		try {
			await (engine as any).loadSampler?.();
			samplerReady = true;
		} finally {
			samplerLoading = false;
		}
	};

	const triggerPreload = () => {
		if (samplerPreloadTriggered) return;
		samplerPreloadTriggered = true;
		void preloadSampler();
	};

	const playChord = (index: number) => {
		const chord = progressionChords[index];
		if (!chord) return;
		const inversion = Math.floor(Math.random() * 3) as 0 | 1 | 2;
		(engine as any).playChord({
			rootPc: chord.rootPc,
			quality: chord.quality,
			inversion,
			spread: true,
			useSampler: soundMode === 'piano'
		});
	};

	const startPlayback = async () => {
		await unlockAudio();
		if (soundMode === 'piano') {
			triggerPreload();
		}
		engine.setKeyPc(Number(tonic));
		if (droneOn) engine.startDrone();
		currentIndex = 0;
		playChord(currentIndex);
		if (timer) clearInterval(timer);
		timer = setInterval(() => {
			currentIndex = (currentIndex + 1) % progressionChords.length;
			playChord(currentIndex);
		}, barMs);
		isPlaying = true;
	};

	const stopPlayback = () => {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
		isPlaying = false;
		currentIndex = 0;
	};

	const togglePlayback = () => {
		if (isPlaying) stopPlayback();
		else void startPlayback();
	};

	const configKey = $derived(
		`${mode}-${tonic}-${bpm}-${barsPerChord}-${progressionLength}-${presetId}-${droneOn}-${showChromatic}-${soundMode}-${progression
			.map((chord) => `${chord.rootPc}:${chord.quality}`)
			.join(',')}`
	);

	$effect(() => {
		ensureProgressionLength();
	});

	$effect(() => {
		if (mode === 'build') return;
		void presetId;
		currentIndex = 0;
	});

	$effect(() => {
		void mode;
		trainerTarget = -1;
		trainerFeedback = 'idle';
		trainerScore = { correct: 0, total: 0 };
	});

	$effect(() => {
		if (!settingsHydrated) return;
		if (isPlaying && configKey !== lastConfigKey) {
			stopPlayback();
			startPlayback();
		}
		lastConfigKey = configKey;
	});

	$effect(() => {
		if (droneOn && audioReady) {
			engine.setKeyPc(Number(tonic));
			engine.startDrone();
		} else {
			engine.stopDrone();
		}
	});


	onMount(() => {
		if (typeof window === 'undefined') return;
		window.localStorage.setItem('tm:lastMode', 'progression');
		const raw = window.localStorage.getItem('progression-console');
		if (!raw) {
			settingsHydrated = true;
			return;
		}
		try {
			const saved = JSON.parse(raw) as Partial<{
				mode: 'listen' | 'build' | 'trainer';
				tonic: string;
				bpm: number;
				barsPerChord: number;
				progressionLength: number;
				presetId: string;
				droneOn: boolean;
				showChromatic: boolean;
				soundMode: 'piano' | 'synth';
				progression: Array<{ rootPc: number; quality: ChordQuality }>;
			}>;
			if (saved.mode) mode = saved.mode;
			if (typeof saved.tonic === 'string') tonic = saved.tonic;
			if (typeof saved.bpm === 'number') bpm = saved.bpm;
			if (typeof saved.barsPerChord === 'number') barsPerChord = saved.barsPerChord;
			if (typeof saved.progressionLength === 'number') progressionLength = saved.progressionLength;
			if (typeof saved.presetId === 'string') presetId = saved.presetId;
			if (typeof saved.droneOn === 'boolean') droneOn = saved.droneOn;
			if (typeof saved.showChromatic === 'boolean') showChromatic = saved.showChromatic;
			if (saved.soundMode) soundMode = saved.soundMode;
			if (Array.isArray(saved.progression)) progression = saved.progression;
		} catch {
			// ignore
		}
		settingsHydrated = true;
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		if (!settingsHydrated) return;
		window.localStorage.setItem(
			'progression-console',
			JSON.stringify({
				mode,
				tonic,
				bpm,
				barsPerChord,
				progressionLength,
				presetId,
				droneOn,
				showChromatic,
				soundMode,
				progression
			})
		);
	});

	onDestroy(() => {
		stopPlayback();
		engine.stopDrone();
	});
</script>

<div class="min-h-screen px-6 py-10 pb-32 lg:px-10 lg:pb-10" onpointerenter={triggerPreload} onpointerdown={triggerPreload}>
	<div class="mx-auto flex max-w-5xl flex-col gap-8">
		<header class="space-y-3">
			<div class="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
				Progression · Console
			</div>
			<h1 class="font-display text-3xl font-semibold text-foreground md:text-4xl">
				Hear progressions in context
			</h1>
			<p class="max-w-xl text-sm text-muted-foreground md:text-base">
				Loop chord progressions against a tonic drone, then build your own sequences.
			</p>
		</header>

		<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-xl">
			<Card.Header class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div>
					<Card.Title class="font-display text-2xl">Progression loop</Card.Title>
					<Card.Description>
						Hear how each chord leans against the tonic.
					</Card.Description>
				</div>
				<div class="flex items-center gap-3">
					<Badge variant="secondary" class="text-xs">Drone {keyLabel}</Badge>
					<Button onclick={togglePlayback} class="px-5">
						{isPlaying ? 'Stop' : 'Play'}
					</Button>
				</div>
			</Card.Header>
		<Card.Content class="space-y-6" onpointerenter={triggerPreload} onpointerdown={triggerPreload}>
				<div class="flex gap-1 rounded-xl border border-border/60 bg-[var(--surface-2)] p-1">
					<button
						class={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
							mode === 'listen'
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground'
						}`}
						onclick={() => (mode = 'listen')}
					>
						Listen
					</button>
					<button
						class={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
							mode === 'build'
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground'
						}`}
						onclick={() => (mode = 'build')}
					>
						Build
					</button>
					<button
						class={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
							mode === 'trainer'
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground'
						}`}
						onclick={() => (mode = 'trainer')}
					>
						Trainer
					</button>
				</div>

				<div
					class="grid gap-2"
					style={`grid-template-columns: repeat(${progressionChords.length}, minmax(0, 1fr));`}
				>
					{#each progressionChords as chord, index (timelineKey + '-' + index)}
						{@const isTarget = mode === 'trainer' && index === trainerTarget}
						{@const isNowPlaying = index === currentIndex && isPlaying}
						<div
							class={`rounded-xl border px-3 py-3 text-xs font-semibold uppercase tracking-wide transition-colors ${
								isTarget && isNowPlaying
									? 'border-amber-500/50 bg-amber-500/10 text-foreground shadow-[0_0_18px_rgba(186,120,52,0.45)]'
									: isTarget
										? 'border-amber-500/30 bg-amber-500/5 text-foreground'
										: isNowPlaying
											? 'border-border/60 bg-[var(--surface-2)] text-foreground shadow-[0_0_18px_rgba(186,120,52,0.35)]'
											: 'border-border/60 bg-transparent text-muted-foreground'
							}`}
						>
							{#if mode === 'trainer'}
								<div class="text-sm font-semibold normal-case text-foreground">
									Chord {index + 1}
								</div>
								<div class="text-xs text-muted-foreground">
									{isTarget ? '?' : ''}
								</div>
							{:else}
								<div class="text-sm font-semibold normal-case text-foreground">
									{chordLabel(chord.rootPc, chord.quality)}
								</div>
								<div class="text-xs text-muted-foreground">{functionLabel(chord.rootPc)}</div>
							{/if}
						</div>
					{/each}
				</div>
				{#if mode === 'trainer'}
					<div class="rounded-2xl border border-border/70 bg-[var(--surface-1)] p-6">
						{#if trainerTarget < 0}
							<div class="text-center">
								<div class="text-sm text-muted-foreground">
									Hear a progression loop, then identify the function of the highlighted chord.
								</div>
								<Button class="mt-4" onclick={() => void startTrainer()}>Start trainer</Button>
							</div>
						{:else}
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								What function is chord {trainerTarget + 1}?
							</div>
							<div class="mt-4 flex flex-wrap gap-2">
								{#each trainerChoices as label}
									<Button
										variant="secondary"
										size="sm"
										disabled={trainerFeedback !== 'idle'}
										onclick={() => submitTrainerAnswer(label)}
									>
										{label}
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
										? 'Correct!'
										: `Not quite — it was ${trainerCorrectLabel}.`}
								</div>
								<Button class="mt-3" variant="secondary" size="sm" onclick={nextTrainerRound}>
									Next
								</Button>
							{/if}
							{#if trainerScore.total > 0}
								<div class="mt-3 text-xs text-muted-foreground">
									{trainerScore.correct}/{trainerScore.total} correct
								</div>
							{/if}
						{/if}
					</div>
				{:else}
					<div class="rounded-2xl border border-border/70 bg-[var(--surface-1)] p-6">
						<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What to listen for</div>
						<div class="mt-2 text-sm">
							Notice the pull and release against the drone as the loop turns over.
						</div>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<div class="grid gap-6 lg:grid-cols-[320px,1fr]">
			<aside class="space-y-6">
				<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
					<Card.Header>
						<Card.Title class="font-display text-lg">Context</Card.Title>
						<Card.Description>Set the tonic and pulse.</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-4">
						<Select.Root type="single" bind:value={tonic as never}>
							<Select.Trigger class="w-full">
								<span>{keyLabel}</span>
							</Select.Trigger>
							<Select.Content>
								{#each keyOptions as key}
									<Select.Item value={String(key.pc)}>{key.label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
							<span class="text-xs text-muted-foreground">Drone</span>
							<Switch bind:checked={droneOn} />
						</div>
						<div class="space-y-2">
							<div class="flex items-center justify-between text-xs text-muted-foreground">
								<span>Tempo</span>
								<span class="text-foreground">{bpm}</span>
							</div>
							<Slider type="single" min={60} max={140} step={1} bind:value={bpm} />
						</div>
						<div class="space-y-2">
							<div class="flex items-center justify-between text-xs text-muted-foreground">
								<span>Chord length</span>
								<span class="text-foreground">{barsPerChord} bar{barsPerChord > 1 ? 's' : ''}</span>
							</div>
							<Slider type="single" min={1} max={4} step={1} bind:value={barsPerChord} />
						</div>
					<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
						<span class="text-xs text-muted-foreground">Show chromatic labels</span>
						<Switch bind:checked={showChromatic} />
					</div>
					<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
						<span class="text-xs text-muted-foreground">Sound</span>
						<ToggleGroup.Root type="single" bind:value={soundMode} class="flex gap-2">
							<ToggleGroup.Item value="piano" class="px-3 text-xs">Piano</ToggleGroup.Item>
							<ToggleGroup.Item value="synth" class="px-3 text-xs">Synth</ToggleGroup.Item>
						</ToggleGroup.Root>
					</div>
					</Card.Content>
				</Card.Root>
			</aside>

			<main class="space-y-6">
				<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
					<Card.Header>
						<Card.Title class="font-display text-lg">
							{mode === 'build' ? 'Build a progression' : mode === 'trainer' ? 'Trainer presets' : 'Listen presets'}
						</Card.Title>
						<Card.Description>
							{mode === 'build'
								? 'Add chords (including chromatics) and loop them.'
								: mode === 'trainer'
									? 'Pick a progression to train with, or let it randomize.'
									: 'Choose a progression and loop it against the drone.'}
						</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-4">
						{#if mode === 'listen' || mode === 'trainer'}
							<div class="space-y-2">
								<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Progression</div>
								<ToggleGroup.Root type="single" bind:value={presetId} class="flex flex-wrap gap-2">
									{#each presetProgressions as preset}
										<ToggleGroup.Item value={preset.id} class="px-3 text-xs">
											{preset.label}
										</ToggleGroup.Item>
									{/each}
								</ToggleGroup.Root>
							</div>
						{:else}
							<div class="space-y-2">
								<div class="flex items-center justify-between text-xs text-muted-foreground">
									<span>Progression length</span>
									<span class="text-foreground">{progressionLength} chords</span>
								</div>
								<Slider type="single" min={2} max={8} step={1} bind:value={progressionLength} />
							</div>
							<div class="grid gap-3 md:grid-cols-2">
								{#each progression as chord, index}
									<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
										<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
											Chord {index + 1}
										</div>
										<div class="mt-2 space-y-2">
											<Select.Root
												type="single"
												bind:value={progression[index].rootPc as never}
											>
												<Select.Trigger class="w-full">
													<span>{keyOptions.find((item) => item.pc === chord.rootPc)?.label ?? 'C'}</span>
												</Select.Trigger>
												<Select.Content>
													{#each keyOptions as key}
														<Select.Item value={key.pc as never}>{key.label}</Select.Item>
													{/each}
												</Select.Content>
											</Select.Root>
											<ToggleGroup.Root
												type="single"
												bind:value={progression[index].quality as never}
												class="flex flex-wrap gap-2"
											>
												{#each [...triads, ...sevenths] as option}
													<ToggleGroup.Item value={option.value} class="px-2 text-[11px]">
														{option.label}
													</ToggleGroup.Item>
												{/each}
											</ToggleGroup.Root>
											<div class="text-xs text-muted-foreground">
												{functionLabel(chord.rootPc)}
											</div>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			</main>
		</div>
	</div>
</div>
