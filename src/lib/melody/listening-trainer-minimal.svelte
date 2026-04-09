<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
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
	const patternCategories = ['mixed'] as const;
	const patternBank: Record<(typeof patternCategories)[number], number[][]> = {
		mixed: [
			[0, 1, 2, 1],
			[0, 1, 2, 3, 4, 3, 2, 1],
			[0, 2, 4, 2],
			[0, 2, 4, 6, 4, 2],
			[0, 2, 1, 3],
			[0, 3, 1, 4],
			[0, 4, 2, 5]
		]
	};
	const PATTERN_HOLD_PHRASES = 2;
	const quickstartFocusOptions = ['easy', 'balanced', 'challenging'] as const;
	const quickstartFocusLabels: Record<(typeof quickstartFocusOptions)[number], string> = {
		easy: 'Easy',
		balanced: 'Balanced',
		challenging: 'Challenging'
	};

	// Degree mapping for call-and-response random phrase generation
	const OFFSET_TO_DEGREE: Record<number, string> = {
		0: '1',
		1: 'b2',
		2: '2',
		3: 'b3',
		4: '3',
		5: '4',
		6: '#4',
		7: '5',
		8: 'b6',
		9: '6',
		10: 'b7',
		11: '7'
	};

	// Passive mode state
	let mode = $state<'scale' | 'pattern'>('scale');
	let scaleSingle = $state<(typeof scaleOptions)[number]>('major');
	let diminishedMode = $state<'whole-half' | 'half-whole'>('whole-half');
	let phraseBars = $state(4);
	let tonic = $state('0');
	let droneOn = $state(true);

	// Call-and-response mode state
	let trainingFormat = $state<'passive' | 'call-response'>('passive');
	let onTheGo = $state(false);
	let crPhraseNotes = $state('4'); // '2', '3', or '4'

	// Shared playback state
	let isPlaying = $state(false);
	let stage = $state<'idle' | 'count-in' | 'playing' | 'rest'>('idle');
	let currentStep = $state(0);
	let currentLabel = $state('');
	let preloadTriggered = $state(false);
	let settingsHydrated = $state(false);
	let sequenceLength = $state(0);
	let turnaroundStep = $state(0);
	let currentPatternIndex = $state(-1);
	let currentPatternCycles = $state(0);
	let currentPatternPoolKey = $state('');
	let quickstartFocus = $state<(typeof quickstartFocusOptions)[number]>('balanced');
	let showPhraseGuide = $state(false);
	let phraseGuide = $state<string[]>([]);

	const settingsKey = 'melody-listening-settings';

	// --- Passive mode helpers ---

	const getPatternPool = () => {
		const set = patternBank.mixed ?? [];
		if (quickstartFocus === 'easy') return set.filter((_, i) => [0, 1, 2].includes(i));
		if (quickstartFocus === 'challenging') return set.filter((_, i) => [3, 5, 6].includes(i));
		return set;
	};

	const resetPatternTracking = () => {
		currentPatternIndex = -1;
		currentPatternCycles = 0;
		currentPatternPoolKey = '';
	};

	// --- Call-and-response helpers ---

	const getCallResponseDegrees = () =>
		scaleOffsets(scaleSingle).map((o) => OFFSET_TO_DEGREE[o] ?? '1');

	const isMinorLike = (scale: (typeof scaleOptions)[number]) =>
		['naturalMinor', 'harmonicMinor', 'melodicMinor'].includes(scale);

	// --- Engine ---

	const engine = new MelodyEngine({
		onTick: (tick: any) => {
			stage = tick.stage ?? 'idle';
			currentStep = tick.step ?? 0;
			currentLabel = String(tick.degree ?? '');
		},
		onPhrase: (phrase: any) => {
			phraseGuide = phrase.map((n: any) => n.degree);
			showPhraseGuide = false;
		},
		onLoop: () => {
			if (trainingFormat === 'passive' && mode === 'pattern') {
				applyPatternPhrase({ advanceCycle: true });
			}
		}
	} as any);

	// --- Derived values ---

	const keyLabel = $derived(keyOptions.find((item) => String(item.pc) === tonic)?.label ?? 'C');
	const phraseLength = $derived(Math.max(4, phraseBars * 4));
	const progressPercent = $derived(
		phraseLength ? Math.min(((currentStep + 1) / phraseLength) * 100, 100) : 0
	);
	const displayScale = $derived(scaleLabels[scaleSingle]);
	const isTurnaround = $derived(
		mode === 'scale' &&
			stage === 'playing' &&
			sequenceLength > 0 &&
			currentStep % sequenceLength === turnaroundStep
	);

	// Call-and-response derived values
	const crNotesCount = $derived(Number(crPhraseNotes));
	const crLoopBeats = $derived(Math.ceil(crNotesCount / 2) * 4);
	const crRestBeats = $derived(crLoopBeats - crNotesCount);
	const crPhaseProgress = $derived(
		stage === 'playing'
			? Math.min((currentStep + 1) / crNotesCount, 1)
			: stage === 'rest' && crRestBeats > 0
				? Math.min((currentStep - crNotesCount + 1) / crRestBeats, 1)
				: 0
	);

	// --- Scale/pattern logic ---

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

	const applyScalePhrase = () => {
		const offsets = scaleOffsets(scaleSingle);
		const phrase = toPhrase(offsets);
		phraseGuide = phrase.map((note) => note.degree);
		engine.setPhrase(phrase);
	};

	const choosePatternIndex = (setLength: number, avoidIndex: number) => {
		if (setLength <= 1) return 0;
		let nextIndex = Math.floor(Math.random() * setLength);
		let safety = 0;
		while (nextIndex === avoidIndex && safety < 6) {
			nextIndex = Math.floor(Math.random() * setLength);
			safety += 1;
		}
		return nextIndex;
	};

	const choosePattern = (advanceCycle: boolean) => {
		const set = getPatternPool();
		const poolKey = `${quickstartFocus}-${set.length}`;
		if (currentPatternPoolKey !== poolKey) {
			currentPatternPoolKey = poolKey;
			currentPatternIndex = -1;
			currentPatternCycles = 0;
		}
		if (!set.length) return [0, 1, 2, 1];
		if (currentPatternIndex < 0 || currentPatternIndex >= set.length) {
			currentPatternIndex = Math.floor(Math.random() * set.length);
			currentPatternCycles = 1;
		} else if (advanceCycle) {
			if (currentPatternCycles >= PATTERN_HOLD_PHRASES) {
				currentPatternIndex = choosePatternIndex(set.length, currentPatternIndex);
				currentPatternCycles = 1;
			} else {
				currentPatternCycles += 1;
			}
		}
		return set[currentPatternIndex] ?? [0, 1, 2, 1];
	};

	const applyPatternPhrase = ({ advanceCycle = false }: { advanceCycle?: boolean } = {}) => {
		const offsets = scaleOffsets(scaleSingle);
		const pattern = choosePattern(advanceCycle);
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

	// --- Engine sync ---

	const syncEngine = () => {
		if (trainingFormat === 'call-response') {
			const loopBars = Math.ceil(crNotesCount / 2);
			engine.setConfig({
				bpm,
				keyPc: Number(tonic),
				mode: isMinorLike(scaleSingle) ? 'minor' : 'major',
				phraseLength: crNotesCount,
				loopBars,
				loop: true,
				countInBars: 0,
				regenerateOnLoop: true,
				allowedDegrees: getCallResponseDegrees(),
				maxLeap: quickstartFocus === 'easy' ? 1 : quickstartFocus === 'challenging' ? 3 : 2,
				startOnTonic: quickstartFocus === 'easy',
				rangeOctaves: 1
			});
			if (!untrack(() => isPlaying)) engine.generatePhrase();
			return;
		}
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
			applyScalePhrase();
			return;
		}
		applyPatternPhrase({ advanceCycle: false });
	};

	const preloadSamples = () => {
		if (preloadTriggered) return;
		preloadTriggered = true;
		void (engine as any).loadSampler?.();
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

	// --- Effects ---

	$effect(() => {
		void bpm;
		void phraseBars;
		void tonic;
		void mode;
		void scaleSingle;
		void diminishedMode;
		void quickstartFocus;
		void trainingFormat;
		void crPhraseNotes;
		syncEngine();
	});

	$effect(() => {
		if (!engine) return;
		if (droneOn) {
			engine.startDrone();
		} else {
			engine.stopDrone();
		}
	});

	$effect(() => {
		if (mode === 'pattern') {
			applyPatternPhrase({ advanceCycle: false });
		}
	});

	$effect(() => {
		if (mode === 'scale') {
			resetPatternTracking();
		}
	});

	$effect(() => {
		if (mode !== 'pattern') {
			showPhraseGuide = false;
		}
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		if (!settingsHydrated) return;
		window.localStorage.setItem(
			settingsKey,
			JSON.stringify({
				mode,
				scaleSingle,
				diminishedMode,
				quickstartFocus,
				showPhraseGuide,
				phraseBars,
				tonic,
				droneOn,
				trainingFormat,
				onTheGo,
				crPhraseNotes
			})
		);
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
				scaleSingle: (typeof scaleOptions)[number];
				diminishedMode: 'whole-half' | 'half-whole';
				quickstartFocus: (typeof quickstartFocusOptions)[number];
				showPhraseGuide: boolean;
				phraseBars: number;
				tonic: string;
				droneOn: boolean;
				trainingFormat: 'passive' | 'call-response';
				onTheGo: boolean;
				crPhraseNotes: string;
			}>;
			if (saved.mode) mode = saved.mode;
			if (saved.scaleSingle) scaleSingle = saved.scaleSingle;
			if (saved.diminishedMode) diminishedMode = saved.diminishedMode;
			if (saved.quickstartFocus) quickstartFocus = saved.quickstartFocus;
			if (typeof saved.showPhraseGuide === 'boolean') showPhraseGuide = saved.showPhraseGuide;
			if (typeof saved.phraseBars === 'number') phraseBars = saved.phraseBars;
			if (typeof saved.tonic === 'string') tonic = saved.tonic;
			if (typeof saved.droneOn === 'boolean') droneOn = saved.droneOn;
			if (saved.trainingFormat) trainingFormat = saved.trainingFormat;
			if (typeof saved.onTheGo === 'boolean') onTheGo = saved.onTheGo;
			if (saved.crPhraseNotes) crPhraseNotes = saved.crPhraseNotes;
		} catch {
			// ignore
		}
		settingsHydrated = true;
	});

	onDestroy(() => {
		engine.stop();
		engine.stopDrone();
	});
</script>

<div class="space-y-6" role="group" onpointerenter={preloadSamples} onpointerdown={preloadSamples}>
	<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-xl">
		<Card.Header class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<div>
				<Card.Title class="font-display text-xl">Melody Quickstart</Card.Title>
				<Card.Description>
					{trainingFormat === 'call-response'
						? onTheGo
							? 'Hear a phrase, then sing or audiate it.'
							: 'Hear a phrase, then play it back on your instrument.'
						: 'Listen to scales or patterns against a drone.'}
				</Card.Description>
			</div>
			<div class="flex items-center gap-3">
				<Badge variant="secondary" class="text-xs">Drone {keyLabel}</Badge>
				<Button onclick={togglePlayback} class="px-5">{isPlaying ? 'Stop' : 'Play'}</Button>
			</div>
		</Card.Header>
		<Card.Content class="space-y-6">

			<!-- Training format toggle -->
			<div class="flex gap-1 rounded-xl border border-border/60 bg-[var(--surface-2)] p-1">
				<button
					class={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
						trainingFormat === 'passive'
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground hover:text-foreground'
					}`}
					onclick={() => {
						if (trainingFormat !== 'passive') {
							trainingFormat = 'passive';
							if (isPlaying) { engine.stop(); isPlaying = false; stage = 'idle'; }
						}
					}}
				>
					Listen
				</button>
				<button
					class={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
						trainingFormat === 'call-response'
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground hover:text-foreground'
					}`}
					onclick={() => {
						if (trainingFormat !== 'call-response') {
							trainingFormat = 'call-response';
							if (isPlaying) { engine.stop(); isPlaying = false; stage = 'idle'; }
						}
					}}
				>
					Call & Response
				</button>
			</div>

			<!-- Passive mode content -->
			{#if trainingFormat === 'passive'}
				<div class="rounded-2xl border border-border/70 bg-[var(--surface-1)] p-6">
					<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						Now hearing
					</div>
					<div class="mt-2 text-sm">
						{mode === 'scale' ? `${displayScale} in ${keyLabel}` : `Pattern in ${keyLabel}`}
					</div>
					{#if isTurnaround}
						<div class="mt-2">
							<Badge variant="secondary" class="text-xs">Turnaround</Badge>
						</div>
					{/if}
				</div>
				<div class="rounded-2xl border border-border/70 bg-[var(--surface-1)] p-6">
					<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						What to listen for
					</div>
					<div class="mt-2 text-sm">
						{mode === 'scale'
							? 'Hear how the scale leans against the tonic: bright, dark, or tense.'
							: 'Notice the motif shape; it repeats twice, then shifts.'}
					</div>
					<div class="mt-3 flex flex-wrap items-center gap-2">
						<Button
							size="sm"
							variant="secondary"
							onclick={() => (showPhraseGuide = !showPhraseGuide)}
						>
							{showPhraseGuide ? 'Hide phrase guide' : 'Reveal phrase guide'}
						</Button>
						<div class="text-xs text-muted-foreground">
							Use after your first mental/voice recall attempt.
						</div>
					</div>
					{#if showPhraseGuide}
						<div
							class="mt-3 rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground"
						>
							{phraseGuide.slice(0, 12).join(' · ')}
							{phraseGuide.length > 12 ? ' · ...' : ''}
						</div>
					{/if}
				</div>
				<div class="grid gap-4 md:grid-cols-2">
					<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
						<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							Mode
						</div>
						<ToggleGroup.Root type="single" bind:value={mode} class="mt-2 flex flex-wrap gap-2">
							<ToggleGroup.Item value="scale" class="px-3 text-xs">Scale</ToggleGroup.Item>
							<ToggleGroup.Item value="pattern" class="px-3 text-xs">Pattern</ToggleGroup.Item>
						</ToggleGroup.Root>
					</div>
					<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
						<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							Tonic
						</div>
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
					</div>
				</div>
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
					<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						Focus
					</div>
					<ToggleGroup.Root
						type="single"
						bind:value={quickstartFocus}
						class="mt-2 flex flex-wrap gap-2"
					>
						{#each quickstartFocusOptions as option}
							<ToggleGroup.Item value={option} class="px-3 text-xs">
								{quickstartFocusLabels[option]}
							</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
					<div class="mt-2 text-xs text-muted-foreground">
						{quickstartFocus === 'easy'
							? 'Mostly stepwise motifs.'
							: quickstartFocus === 'challenging'
								? 'Wider interval motifs.'
								: 'Balanced mix of motifs.'}
					</div>
				</div>
				{#if mode === 'scale'}
					<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
						<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							Scale
						</div>
						<ToggleGroup.Root
							type="single"
							bind:value={scaleSingle}
							class="mt-2 flex flex-wrap gap-2"
						>
							{#each scaleOptions as option}
								<ToggleGroup.Item value={option} class="px-3 text-xs"
									>{scaleLabels[option]}</ToggleGroup.Item
								>
							{/each}
						</ToggleGroup.Root>
						{#if scaleSingle === 'diminished'}
							<div class="mt-3 flex flex-wrap gap-2">
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
					</div>
				{/if}
				<div class="h-2 w-full rounded-full bg-border/60">
					<div
						class="h-full rounded-full bg-primary/70"
						style={`width: ${progressPercent}%`}
					></div>
				</div>
				<div class="text-xs text-muted-foreground">
					{stage === 'playing'
						? `Current note: ${currentLabel}`
						: stage === 'idle'
							? 'Stopped'
							: stage}
				</div>
			{/if}

			<!-- Call & Response content -->
			{#if trainingFormat === 'call-response'}
				<!-- Phase indicator -->
				<div
					class={`rounded-2xl border p-6 text-center transition-colors ${
						stage === 'playing'
							? 'border-primary/30 bg-primary/5'
							: stage === 'rest'
								? 'border-amber-500/30 bg-amber-500/5'
								: 'border-border/70 bg-[var(--surface-1)]'
					}`}
				>
					{#if stage === 'idle' || stage === 'count-in'}
						<div class="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
							Ready
						</div>
						<div class="mt-1 text-2xl font-semibold text-muted-foreground">—</div>
						<div class="mt-1 text-xs text-muted-foreground">Press play to start.</div>
					{:else if stage === 'playing'}
						<div class="text-xs font-semibold uppercase tracking-[0.3em] text-primary/70">
							Listen
						</div>
						<div class="mt-1 text-2xl font-semibold text-foreground">Hear it</div>
						<div class="mt-1 text-xs text-muted-foreground">
							{onTheGo ? 'Hold the phrase in your mind.' : 'Take it in.'}
						</div>
					{:else if stage === 'rest'}
						<div class="text-xs font-semibold uppercase tracking-[0.3em] text-amber-600/80">
							{onTheGo ? 'Sing' : 'Echo'}
						</div>
						<div class="mt-1 text-2xl font-semibold text-foreground">
							{onTheGo ? 'Sing it' : 'Play it back'}
						</div>
						<div class="mt-1 text-xs text-muted-foreground">
							{onTheGo ? 'Sing or audiate it before it plays again.' : 'Play it on your instrument before the next phrase.'}
						</div>
					{/if}

					<!-- Phase progress bar -->
					{#if stage === 'playing' || stage === 'rest'}
						<div class="mt-4 h-1.5 w-full rounded-full bg-border/60">
							<div
								class={`h-full rounded-full transition-none ${stage === 'playing' ? 'bg-primary/70' : 'bg-amber-500/70'}`}
								style={`width: ${crPhaseProgress * 100}%`}
							></div>
						</div>
					{/if}
				</div>

				<!-- Echo phase actions -->
				{#if stage === 'rest'}
					<div class="flex flex-wrap items-center gap-3">
						{#if onTheGo}
							<Button
								size="sm"
								variant="secondary"
								onclick={() => engine.playPhraseOnce()}
							>
								Replay phrase
							</Button>
						{/if}
						<Button
							size="sm"
							variant="ghost"
							onclick={() => (showPhraseGuide = !showPhraseGuide)}
						>
							{showPhraseGuide ? 'Hide notes' : 'Reveal notes'}
						</Button>
					</div>
					{#if showPhraseGuide}
						<div
							class="rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground"
						>
							{phraseGuide.join(' · ')}
						</div>
					{/if}
				{/if}

				<!-- Call-and-response settings -->
				<div class="grid gap-4 md:grid-cols-2">
					<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
						<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							Phrase
						</div>
						<ToggleGroup.Root
							type="single"
							bind:value={crPhraseNotes}
							class="mt-2 flex gap-2"
						>
							<ToggleGroup.Item value="2" class="px-3 text-xs">2 notes</ToggleGroup.Item>
							<ToggleGroup.Item value="3" class="px-3 text-xs">3 notes</ToggleGroup.Item>
							<ToggleGroup.Item value="4" class="px-3 text-xs">4 notes</ToggleGroup.Item>
						</ToggleGroup.Root>
					</div>
					<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
						<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							Tonic
						</div>
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
					</div>
				</div>
				<div class="grid gap-4 md:grid-cols-2">
					<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
						<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							Scale
						</div>
						<ToggleGroup.Root
							type="single"
							bind:value={scaleSingle}
							class="mt-2 flex flex-wrap gap-2"
						>
							{#each scaleOptions as option}
								<ToggleGroup.Item value={option} class="px-3 text-xs">
									{scaleLabels[option]}
								</ToggleGroup.Item>
							{/each}
						</ToggleGroup.Root>
						{#if scaleSingle === 'diminished'}
							<div class="mt-3 flex flex-wrap gap-2">
								<ToggleGroup.Root
									type="single"
									bind:value={diminishedMode}
									class="flex flex-wrap gap-2"
								>
									<ToggleGroup.Item value="whole-half" class="px-3 text-xs">Whole-Half</ToggleGroup.Item>
									<ToggleGroup.Item value="half-whole" class="px-3 text-xs">Half-Whole</ToggleGroup.Item>
								</ToggleGroup.Root>
							</div>
						{/if}
					</div>
					<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
						<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							Difficulty
						</div>
						<ToggleGroup.Root
							type="single"
							bind:value={quickstartFocus}
							class="mt-2 flex flex-wrap gap-2"
						>
							{#each quickstartFocusOptions as option}
								<ToggleGroup.Item value={option} class="px-3 text-xs">
									{quickstartFocusLabels[option]}
								</ToggleGroup.Item>
							{/each}
						</ToggleGroup.Root>
						<div class="mt-2 text-xs text-muted-foreground">
							{quickstartFocus === 'easy'
								? 'Stepwise motion, starts on tonic.'
								: quickstartFocus === 'challenging'
									? 'Wider leaps, anywhere in the scale.'
									: 'Mixed intervals.'}
						</div>
					</div>
				</div>

				<!-- Tempo slider -->
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
					<div class="flex items-center justify-between">
						<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							Tempo
						</div>
						<span class="text-xs text-muted-foreground">{bpm} bpm</span>
					</div>
					<Slider
						class="mt-3"
						min={50}
						max={160}
						step={2}
						value={[bpm]}
						onValueChange={([v]: number[]) => (bpm = v)}
					/>
					<div class="mt-2 text-xs text-muted-foreground">
						Lower tempo = more time to respond. Increase to build speed.
					</div>
				</div>

				<!-- On the go toggle -->
				<div
					class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2"
				>
					<div>
						<div class="text-xs font-medium text-foreground">On the go</div>
						<div class="text-xs text-muted-foreground">No instrument — sing or audiate</div>
					</div>
					<Switch bind:checked={onTheGo} />
				</div>
			{/if}

			<!-- Drone (shared) -->
			<div
				class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2"
			>
				<span class="text-xs text-muted-foreground">Drone</span>
				<Switch bind:checked={droneOn} />
			</div>
		</Card.Content>
	</Card.Root>
</div>
