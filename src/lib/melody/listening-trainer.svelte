<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { MelodyEngine } from '$lib/melody/engine';

	let { bpm = $bindable(92) } = $props();

	const scaleOptions = [
		'major',
		'naturalMinor',
		'harmonicMinor',
		'melodicMinor',
		'diminished',
		'wholeTone'
	] as const;

	const scaleLabels: Record<(typeof scaleOptions)[number], string> = {
		major: 'Major',
		naturalMinor: 'Natural Minor',
		harmonicMinor: 'Harmonic Minor',
		melodicMinor: 'Melodic Minor',
		diminished: 'Diminished',
		wholeTone: 'Whole Tone'
	};

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

	const NOTE_LABELS = [
		'C',
		'C#/Db',
		'D',
		'D#/Eb',
		'E',
		'F',
		'F#/Gb',
		'G',
		'G#/Ab',
		'A',
		'A#/Bb',
		'B'
	];

	const patternCategories = ['stepwise', 'arpeggio', 'intervals', 'mixed'] as const;
	const patternLabels: Record<(typeof patternCategories)[number], string> = {
		stepwise: 'Stepwise',
		arpeggio: 'Arpeggio',
		intervals: 'Intervals',
		mixed: 'Mixed'
	};

	const patternBank: Record<(typeof patternCategories)[number], number[][]> = {
		stepwise: [
			[0, 1, 2, 1],
			[0, 1, 2, 3, 4, 3, 2, 1],
			[0, 1, 0, 1, 2, 1],
			[0, 1, 2, 3, 2, 1]
		],
		arpeggio: [
			[0, 2, 4, 2],
			[0, 2, 4, 6, 4, 2],
			[0, 2, 4, 2, 0],
			[0, 2, 4, 6, 5, 3, 1]
		],
		intervals: [
			[0, 2, 1, 3],
			[0, 3, 1, 4],
			[0, 4, 2, 5],
			[0, 3, 2, 4, 1, 3]
		],
		mixed: []
	};

	patternBank.mixed = [...patternBank.stepwise, ...patternBank.arpeggio, ...patternBank.intervals];
	const PATTERN_HOLD_PHRASES = 2;
	const patternRandomnessOptions = ['guided', 'semiRandom', 'fullRandom'] as const;
	const patternRandomnessLabels: Record<(typeof patternRandomnessOptions)[number], string> = {
		guided: 'Guided',
		semiRandom: 'Semi-random',
		fullRandom: 'Full random'
	};

	let mode = $state<'scale' | 'pattern'>('scale');
	let compareOn = $state(false);
	let scaleSingle = $state<(typeof scaleOptions)[number]>('major');
	let scaleA = $state<(typeof scaleOptions)[number]>('major');
	let scaleB = $state<(typeof scaleOptions)[number]>('melodicMinor');
	let diminishedMode = $state<'whole-half' | 'half-whole'>('whole-half');
	let patternCategory = $state<(typeof patternCategories)[number]>('mixed');
	let phraseBars = $state(4);
	let tonic = $state('0');
	let droneOn = $state(true);
	let isPlaying = $state(false);
	let stage = $state<'idle' | 'count-in' | 'playing' | 'rest'>('idle');
	let currentStep = $state(0);
	let currentLabel = $state('');
	let activeScaleLabel = $state('');
	let currentPatternLabel = $state('');
	let preloadTriggered = $state(false);
	let settingsHydrated = $state(false);
	let sequenceLength = $state(0);
	let turnaroundStep = $state(0);
	let currentPatternIndex = $state(-1);
	let currentPatternCycles = $state(0);
	let currentPatternCategory = $state<(typeof patternCategories)[number] | null>(null);
	let patternRandomness = $state<(typeof patternRandomnessOptions)[number]>('guided');
	let showPhraseGuide = $state(false);
	let phraseGuide = $state<string[]>([]);

	const settingsKey = 'melody-listening-settings';

	const resetPatternTracking = () => {
		currentPatternIndex = -1;
		currentPatternCycles = 0;
		currentPatternCategory = null;
	};

	const engine = new MelodyEngine({
		onTick: (tick: any) => {
			stage = tick.stage ?? 'idle';
			currentStep = tick.step ?? 0;
			currentLabel = String(tick.degree ?? '');
		},
		onLoop: (loopIndex: number) => {
			if (mode === 'scale') {
				if (compareOn) {
					const nextScale = loopIndex % 2 === 0 ? scaleA : scaleB;
					applyScalePhrase(nextScale);
				}
				return;
			}
			applyPatternPhrase({ advanceCycle: true });
		}
	} as any);

	const keyLabel = $derived(keyOptions.find((item) => String(item.pc) === tonic)?.label ?? 'C');
	const phraseLength = $derived(Math.max(4, phraseBars * 4));
	const progressPercent = $derived(
		phraseLength ? Math.min(((currentStep + 1) / phraseLength) * 100, 100) : 0
	);
	const displayScale = $derived(
		compareOn ? `${scaleLabels[scaleA]} vs ${scaleLabels[scaleB]}` : scaleLabels[scaleSingle]
	);
	const isTurnaround = $derived(
		mode === 'scale' &&
			stage === 'playing' &&
			sequenceLength > 0 &&
			currentStep % sequenceLength === turnaroundStep
	);

	const scaleOffsets = (scale: (typeof scaleOptions)[number]) => {
		switch (scale) {
			case 'major':
				return [0, 2, 4, 5, 7, 9, 11];
			case 'naturalMinor':
				return [0, 2, 3, 5, 7, 8, 10];
			case 'harmonicMinor':
				return [0, 2, 3, 5, 7, 8, 11];
			case 'melodicMinor':
				return [0, 2, 3, 5, 7, 9, 11];
			case 'wholeTone':
				return [0, 2, 4, 6, 8, 10];
			case 'diminished':
				return diminishedMode === 'whole-half'
					? [0, 2, 3, 5, 6, 8, 9, 11]
					: [0, 1, 3, 4, 6, 7, 9, 10];
		}
	};

	const buildScaleSequence = (offsets: number[]) => {
		const ascending = [...offsets, 12];
		const descending = ascending.length > 1 ? ascending.slice(0, -1).reverse() : ascending;
		return [...ascending, ...descending];
	};

	const toPhrase = (offsets: number[]) => {
		const baseMidi = 60 + (Number(tonic) % 12);
		const sequence = buildScaleSequence(offsets);
		sequenceLength = sequence.length;
		turnaroundStep = Math.max(0, offsets.length);
		const notes: Array<{ degree: string; midi: number }> = [];
		for (let i = 0; i < phraseLength; i += 1) {
			const offset = sequence[i % sequence.length] ?? 0;
			const midi = baseMidi + offset;
			const label = NOTE_LABELS[(Number(tonic) + offset) % 12] ?? 'C';
			notes.push({ degree: label, midi });
		}
		return notes;
	};

	const applyScalePhrase = (scale: (typeof scaleOptions)[number]) => {
		const offsets = scaleOffsets(scale);
		activeScaleLabel = scaleLabels[scale];
		const phrase = toPhrase(offsets);
		phraseGuide = phrase.map((note) => note.degree);
		engine.setPhrase(phrase);
	};

	const pickPatternIndex = (setLength: number, avoidIndex?: number) => {
		if (setLength <= 1) return 0;
		let nextIndex = Math.floor(Math.random() * setLength);
		if (avoidIndex === undefined) return nextIndex;
		let safety = 0;
		while (nextIndex === avoidIndex && safety < 6) {
			nextIndex = Math.floor(Math.random() * setLength);
			safety += 1;
		}
		return nextIndex;
	};

	const choosePattern = (advanceCycle: boolean) => {
		if (currentPatternCategory !== patternCategory) {
			currentPatternCategory = patternCategory;
			currentPatternIndex = -1;
			currentPatternCycles = 0;
		}
		const set = patternBank[patternCategory] ?? [];
		if (!set.length) return [0, 1, 2, 1];
		if (currentPatternIndex < 0 || currentPatternIndex >= set.length) {
			currentPatternIndex = pickPatternIndex(set.length);
			currentPatternCycles = 1;
			return set[currentPatternIndex] ?? [0, 1, 2, 1];
		}
		if (advanceCycle) {
			if (patternRandomness === 'guided') {
				if (currentPatternCycles >= PATTERN_HOLD_PHRASES) {
					if (set.length > 1) {
						currentPatternIndex = pickPatternIndex(set.length, currentPatternIndex);
					}
					currentPatternCycles = 1;
				} else {
					currentPatternCycles += 1;
				}
			} else if (patternRandomness === 'semiRandom') {
				if (set.length > 1) {
					currentPatternIndex = pickPatternIndex(set.length, currentPatternIndex);
				}
				currentPatternCycles = 1;
			} else {
				currentPatternIndex = pickPatternIndex(set.length);
				currentPatternCycles = 1;
			}
		}
		return set[currentPatternIndex] ?? [0, 1, 2, 1];
	};

	const applyPatternPhrase = ({ advanceCycle = false }: { advanceCycle?: boolean } = {}) => {
		const offsets = scaleOffsets(compareOn ? scaleA : scaleSingle);
		const pattern = choosePattern(advanceCycle);
		currentPatternLabel = patternLabels[patternCategory];
		const baseMidi = 60 + (Number(tonic) % 12);
		const notes: Array<{ degree: string; midi: number }> = [];
		sequenceLength = phraseLength;
		turnaroundStep = -1;
		for (let i = 0; i < phraseLength; i += 1) {
			const degreeIndex = pattern[i % pattern.length] ?? 0;
			const offset = offsets[degreeIndex % offsets.length] ?? 0;
			const midi = baseMidi + offset;
			const label = NOTE_LABELS[(Number(tonic) + offset) % 12] ?? 'C';
			notes.push({ degree: label, midi });
		}
		phraseGuide = notes.map((note) => note.degree);
		engine.setPhrase(notes);
	};

	const preloadSamples = () => {
		if (preloadTriggered) return;
		preloadTriggered = true;
		void (engine as any).loadSampler?.();
	};

	const syncEngine = () => {
		engine.setConfig({
			bpm,
			keyPc: Number(tonic),
			phraseLength,
			loopBars: phraseBars,
			loop: true,
			countInBars: 0,
			regenerateOnLoop: false
		});
		if (mode === 'scale') {
			applyScalePhrase(compareOn ? scaleA : scaleSingle);
			return;
		}
		applyPatternPhrase({ advanceCycle: false });
	};

	const togglePlayback = async () => {
		if (isPlaying) {
			engine.stop();
			isPlaying = false;
			stage = 'idle';
			return;
		}
		await engine.unlock();
		preloadSamples();
		syncEngine();
		engine.start();
		isPlaying = true;
	};

	$effect(() => {
		void bpm;
		void phraseBars;
		void tonic;
		void mode;
		void compareOn;
		void scaleSingle;
		void scaleA;
		void scaleB;
		void diminishedMode;
		void patternCategory;
		void patternRandomness;
		syncEngine();
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		if (!settingsHydrated) return;
		window.localStorage.setItem(
			settingsKey,
			JSON.stringify({
				mode,
				compareOn,
				scaleSingle,
				scaleA,
				scaleB,
				diminishedMode,
				patternCategory,
				patternRandomness,
				showPhraseGuide,
				phraseBars,
				tonic,
				droneOn
			})
		);
	});

	$effect(() => {
		if (mode === 'pattern' && compareOn) {
			compareOn = false;
		}
	});

	$effect(() => {
		if (mode === 'scale') {
			resetPatternTracking();
		}
	});

	$effect(() => {
		if (!engine) return;
		if (droneOn) {
			engine.startDrone();
		} else {
			engine.stopDrone();
		}
	});

	onDestroy(() => {
		engine.stop();
		engine.stopDrone();
	});

	onMount(() => {
		if (typeof window === 'undefined') return;
		const raw = window.localStorage.getItem(settingsKey);
		if (!raw) {
			settingsHydrated = true;
			return;
		}
		try {
			const saved = JSON.parse(raw) as Partial<{
				mode: 'scale' | 'pattern';
				compareOn: boolean;
				scaleSingle: (typeof scaleOptions)[number];
				scaleA: (typeof scaleOptions)[number];
				scaleB: (typeof scaleOptions)[number];
				diminishedMode: 'whole-half' | 'half-whole';
				patternCategory: (typeof patternCategories)[number];
				patternRandomness: (typeof patternRandomnessOptions)[number];
				showPhraseGuide: boolean;
				phraseBars: number;
				tonic: string;
				droneOn: boolean;
			}>;
			if (saved.mode) mode = saved.mode;
			if (typeof saved.compareOn === 'boolean') compareOn = saved.compareOn;
			if (saved.scaleSingle) scaleSingle = saved.scaleSingle;
			if (saved.scaleA) scaleA = saved.scaleA;
			if (saved.scaleB) scaleB = saved.scaleB;
			if (saved.diminishedMode) diminishedMode = saved.diminishedMode;
			if (saved.patternCategory) patternCategory = saved.patternCategory;
			if (saved.patternRandomness) patternRandomness = saved.patternRandomness;
			if (typeof saved.showPhraseGuide === 'boolean') showPhraseGuide = saved.showPhraseGuide;
			if (typeof saved.phraseBars === 'number') phraseBars = saved.phraseBars;
			if (typeof saved.tonic === 'string') tonic = saved.tonic;
			if (typeof saved.droneOn === 'boolean') droneOn = saved.droneOn;
		} catch {
			// ignore
		}
		settingsHydrated = true;
	});
</script>

<div class="space-y-6" onpointerenter={preloadSamples} onpointerdown={preloadSamples}>
	<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-xl">
		<Card.Header class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<div>
				<Card.Title class="font-display text-xl">Melody Listening Trainer</Card.Title>
				<Card.Description>Hear scales and patterns against a tonic drone.</Card.Description>
			</div>
			<div class="flex items-center gap-3">
				<Badge variant="secondary" class="text-xs">Drone {keyLabel}</Badge>
				<Button onclick={togglePlayback} class="px-5">{isPlaying ? 'Stop' : 'Play'}</Button>
			</div>
		</Card.Header>
		<Card.Content>
			<div class="rounded-2xl border border-border/70 bg-[var(--surface-1)] p-6">
				<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					Now hearing
				</div>
				<div class="mt-2 text-sm">
					{mode === 'scale'
						? `${displayScale} in ${keyLabel}`
						: `${patternLabels[patternCategory]} in ${keyLabel}`}
				</div>
				{#if mode === 'scale' && compareOn}
					<div class="mt-1 text-xs text-muted-foreground">
						Alternating: {scaleLabels[scaleA]} / {scaleLabels[scaleB]}
					</div>
				{/if}
				{#if isTurnaround}
					<div class="mt-2">
						<Badge variant="secondary" class="text-xs">Turnaround</Badge>
					</div>
				{/if}
			</div>
			<div class="mt-4 rounded-2xl border border-border/70 bg-[var(--surface-1)] p-6">
				<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					What to listen for
				</div>
				<div class="mt-2 text-sm">
					{#if mode === 'scale'}
						{#if compareOn}
							Which feels brighter or darker against the same tonic?
						{:else}
							Hear how the scale leans against the tonic: bright, dark, or tense.
						{/if}
					{:else}
						Notice how the fragment outlines the scale's color.
					{/if}
				</div>
				<div class="mt-3 flex flex-wrap items-center gap-2">
					<Button
						size="sm"
						variant="secondary"
						onclick={() => (showPhraseGuide = !showPhraseGuide)}
					>
						{showPhraseGuide ? 'Hide phrase guide' : 'Reveal phrase guide'}
					</Button>
					<div class="text-xs text-muted-foreground">Reveal after you sing/think it once.</div>
				</div>
				{#if showPhraseGuide}
					<div
						class="mt-3 rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground"
					>
						{phraseGuide.slice(0, 16).join(' · ')}
						{phraseGuide.length > 16 ? ' · ...' : ''}
					</div>
				{/if}
			</div>
			<div class="mt-4 grid gap-3 md:grid-cols-3">
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
					<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						Mode
					</div>
					<div class="text-sm font-semibold">{mode === 'scale' ? 'Scale' : 'Pattern'}</div>
				</div>
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
					<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						Phrase
					</div>
					<div class="text-sm font-semibold">{phraseBars} bars</div>
				</div>
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
					<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						Playhead
					</div>
					<div class="text-sm font-semibold">
						{Math.min(currentStep + 1, phraseLength)}/{phraseLength}
					</div>
				</div>
			</div>
			<div class="mt-4 h-2 w-full rounded-full bg-border/60">
				<div class="h-full rounded-full bg-primary/70" style={`width: ${progressPercent}%`}></div>
			</div>
			<div class="mt-2 text-xs text-muted-foreground">
				{stage === 'playing'
					? `Current note: ${currentLabel}`
					: stage === 'idle'
						? 'Stopped'
						: stage}
			</div>
		</Card.Content>
	</Card.Root>

	<div class="grid gap-6 lg:grid-cols-[320px,1fr]">
		<aside class="space-y-6">
			<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
				<Card.Header>
					<Card.Title class="font-display text-lg">Mode</Card.Title>
					<Card.Description>Scale or pattern listening.</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-4">
					<ToggleGroup.Root type="single" bind:value={mode} class="flex flex-wrap gap-2">
						<ToggleGroup.Item value="scale" class="px-3 text-xs">Scale</ToggleGroup.Item>
						<ToggleGroup.Item value="pattern" class="px-3 text-xs">Pattern</ToggleGroup.Item>
					</ToggleGroup.Root>
					<div
						class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2"
					>
						<span class="text-xs text-muted-foreground">Drone</span>
						<Switch bind:checked={droneOn} />
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
				<Card.Header>
					<Card.Title class="font-display text-lg">Key & Tempo</Card.Title>
					<Card.Description>Set the tonic and speed.</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-4">
					<Select.Root type="single" bind:value={tonic as never}>
						<Select.Trigger class="w-full">
							<span>{keyLabel}</span>
						</Select.Trigger>
						<Select.Content>
							{#each keyOptions as keyOption}
								<Select.Item value={String(keyOption.pc)}>{keyOption.label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<div class="space-y-2">
						<div class="flex items-center justify-between text-xs text-muted-foreground">
							<span>Tempo</span>
							<span class="text-foreground">{Math.round(bpm)}</span>
						</div>
						<Slider type="single" min={60} max={140} step={1} bind:value={bpm} />
					</div>
					<div class="space-y-2">
						<div class="flex items-center justify-between text-xs text-muted-foreground">
							<span>Phrase length</span>
							<span class="text-foreground">{phraseBars} bars</span>
						</div>
						<Slider type="single" min={1} max={8} step={1} bind:value={phraseBars} />
					</div>
				</Card.Content>
			</Card.Root>
		</aside>

		<main class="space-y-6">
			{#if mode === 'scale'}
				<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
					<Card.Header>
						<Card.Title class="font-display text-lg">Scale Settings</Card.Title>
						<Card.Description>Choose the scale set to sing along with.</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-4">
						<div
							class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2"
						>
							<span class="text-xs text-muted-foreground">Compare scales</span>
							<Switch bind:checked={compareOn} />
						</div>
						{#if compareOn}
							<div class="space-y-2">
								<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
									Scale A
								</div>
								<ToggleGroup.Root type="single" bind:value={scaleA} class="flex flex-wrap gap-2">
									{#each scaleOptions as option}
										<ToggleGroup.Item value={option} class="px-3 text-xs"
											>{scaleLabels[option]}</ToggleGroup.Item
										>
									{/each}
								</ToggleGroup.Root>
							</div>
							<div class="space-y-2">
								<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
									Scale B
								</div>
								<ToggleGroup.Root type="single" bind:value={scaleB} class="flex flex-wrap gap-2">
									{#each scaleOptions as option}
										<ToggleGroup.Item value={option} class="px-3 text-xs"
											>{scaleLabels[option]}</ToggleGroup.Item
										>
									{/each}
								</ToggleGroup.Root>
							</div>
						{:else}
							<div class="space-y-2">
								<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
									Scale
								</div>
								<ToggleGroup.Root
									type="single"
									bind:value={scaleSingle}
									class="flex flex-wrap gap-2"
								>
									{#each scaleOptions as option}
										<ToggleGroup.Item value={option} class="px-3 text-xs"
											>{scaleLabels[option]}</ToggleGroup.Item
										>
									{/each}
								</ToggleGroup.Root>
							</div>
						{/if}
						{#if compareOn ? scaleA === 'diminished' || scaleB === 'diminished' : scaleSingle === 'diminished'}
							<div class="space-y-2">
								<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
									Diminished pattern
								</div>
								<ToggleGroup.Root
									type="single"
									bind:value={diminishedMode}
									class="flex flex-wrap gap-2"
								>
									<ToggleGroup.Item value="whole-half" class="px-3 text-xs"
										>Whole-Half</ToggleGroup.Item
									>
									<ToggleGroup.Item value="half-whole" class="px-3 text-xs"
										>Half-Whole</ToggleGroup.Item
									>
								</ToggleGroup.Root>
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			{:else}
				<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
					<Card.Header>
						<Card.Title class="font-display text-lg">Pattern Settings</Card.Title>
						<Card.Description>Guided motifs that repeat, then vary.</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-4">
						<div class="space-y-2">
							<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
								Scale
							</div>
							<ToggleGroup.Root type="single" bind:value={scaleSingle} class="flex flex-wrap gap-2">
								{#each scaleOptions as option}
									<ToggleGroup.Item value={option} class="px-3 text-xs"
										>{scaleLabels[option]}</ToggleGroup.Item
									>
								{/each}
							</ToggleGroup.Root>
						</div>
						{#if scaleSingle === 'diminished'}
							<div class="space-y-2">
								<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
									Diminished pattern
								</div>
								<ToggleGroup.Root
									type="single"
									bind:value={diminishedMode}
									class="flex flex-wrap gap-2"
								>
									<ToggleGroup.Item value="whole-half" class="px-3 text-xs"
										>Whole-Half</ToggleGroup.Item
									>
									<ToggleGroup.Item value="half-whole" class="px-3 text-xs"
										>Half-Whole</ToggleGroup.Item
									>
								</ToggleGroup.Root>
							</div>
						{/if}
						<ToggleGroup.Root
							type="single"
							bind:value={patternCategory}
							class="flex flex-wrap gap-2"
						>
							{#each patternCategories as category}
								<ToggleGroup.Item value={category} class="px-3 text-xs"
									>{patternLabels[category]}</ToggleGroup.Item
								>
							{/each}
						</ToggleGroup.Root>
						<div class="space-y-2">
							<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
								Randomness
							</div>
							<ToggleGroup.Root
								type="single"
								bind:value={patternRandomness}
								class="flex flex-wrap gap-2"
							>
								{#each patternRandomnessOptions as option}
									<ToggleGroup.Item value={option} class="px-3 text-xs">
										{patternRandomnessLabels[option]}
									</ToggleGroup.Item>
								{/each}
							</ToggleGroup.Root>
						</div>
						<div class="text-xs text-muted-foreground">
							{patternRandomness === 'guided'
								? 'Pattern repeats twice, then changes.'
								: patternRandomness === 'semiRandom'
									? 'Pattern changes every phrase with no immediate repeat.'
									: 'Pattern is fully random each phrase.'}
						</div>
					</Card.Content>
				</Card.Root>
			{/if}
		</main>
	</div>
</div>
