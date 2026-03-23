<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { MelodyEngine } from '$lib/melody/engine';

	let { bpm = $bindable(92) } = $props();

	const scaleOptions = ['major', 'naturalMinor', 'harmonicMinor', 'melodicMinor', 'diminished', 'wholeTone'] as const;
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

	const NOTE_LABELS = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];
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

	let mode = $state<'scale' | 'pattern'>('scale');
	let scaleSingle = $state<(typeof scaleOptions)[number]>('major');
	let diminishedMode = $state<'whole-half' | 'half-whole'>('whole-half');
	let phraseBars = $state(4);
	let tonic = $state('0');
	let droneOn = $state(true);
	let isPlaying = $state(false);
	let stage = $state<'idle' | 'count-in' | 'playing' | 'rest'>('idle');
	let currentStep = $state(0);
	let currentLabel = $state('');
	let preloadTriggered = $state(false);
	let settingsHydrated = $state(false);
	let sequenceLength = $state(0);
	let turnaroundStep = $state(0);

	const settingsKey = 'melody-listening-settings';

	const engine = new MelodyEngine({
		onTick: (tick: any) => {
			stage = tick.stage ?? 'idle';
			currentStep = tick.step ?? 0;
			currentLabel = String(tick.degree ?? '');
		}
	} as any);

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
		engine.setPhrase(phrase);
	};

	const choosePattern = () => {
		const set = patternBank.mixed ?? [];
		return set[Math.floor(Math.random() * set.length)] ?? [0, 1, 2, 1];
	};

	const applyPatternPhrase = () => {
		const offsets = scaleOffsets(scaleSingle);
		const pattern = choosePattern();
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
			applyScalePhrase();
			return;
		}
		applyPatternPhrase();
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
		void scaleSingle;
		void diminishedMode;
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
			// keep scale context for pattern mode
			applyPatternPhrase();
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
				phraseBars,
				tonic,
				droneOn
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
				phraseBars: number;
				tonic: string;
				droneOn: boolean;
			}>;
			if (saved.mode) mode = saved.mode;
			if (saved.scaleSingle) scaleSingle = saved.scaleSingle;
			if (saved.diminishedMode) diminishedMode = saved.diminishedMode;
			if (typeof saved.phraseBars === 'number') phraseBars = saved.phraseBars;
			if (typeof saved.tonic === 'string') tonic = saved.tonic;
			if (typeof saved.droneOn === 'boolean') droneOn = saved.droneOn;
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

<div class="space-y-6" onpointerenter={preloadSamples} onpointerdown={preloadSamples}>
	<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-xl">
		<Card.Header class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<div>
				<Card.Title class="font-display text-xl">Melody Quickstart</Card.Title>
				<Card.Description>Listen to scales or patterns against a drone.</Card.Description>
			</div>
			<div class="flex items-center gap-3">
				<Badge variant="secondary" class="text-xs">Drone {keyLabel}</Badge>
				<Button onclick={togglePlayback} class="px-5">{isPlaying ? 'Stop' : 'Play'}</Button>
			</div>
		</Card.Header>
		<Card.Content class="space-y-6">
			<div class="rounded-2xl border border-border/70 bg-[var(--surface-1)] p-6">
				<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Now hearing</div>
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
				<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What to listen for</div>
				<div class="mt-2 text-sm">
					{mode === 'scale'
						? 'Hear how the scale leans against the tonic: bright, dark, or tense.'
						: "Notice how the fragment outlines the scale's color."}
				</div>
			</div>
			<div class="grid gap-4 md:grid-cols-2">
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
					<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mode</div>
					<ToggleGroup.Root type="single" bind:value={mode} class="mt-2 flex flex-wrap gap-2">
						<ToggleGroup.Item value="scale" class="px-3 text-xs">Scale</ToggleGroup.Item>
						<ToggleGroup.Item value="pattern" class="px-3 text-xs">Pattern</ToggleGroup.Item>
					</ToggleGroup.Root>
				</div>
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
					<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tonic</div>
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
			{#if mode === 'scale'}
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
					<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scale</div>
					<ToggleGroup.Root type="single" bind:value={scaleSingle} class="mt-2 flex flex-wrap gap-2">
						{#each scaleOptions as option}
							<ToggleGroup.Item value={option} class="px-3 text-xs">{scaleLabels[option]}</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
					{#if scaleSingle === 'diminished'}
						<div class="mt-3 flex flex-wrap gap-2">
							<ToggleGroup.Root type="single" bind:value={diminishedMode} class="flex flex-wrap gap-2">
								<ToggleGroup.Item value="whole-half" class="px-3 text-xs">Whole-Half</ToggleGroup.Item>
								<ToggleGroup.Item value="half-whole" class="px-3 text-xs">Half-Whole</ToggleGroup.Item>
							</ToggleGroup.Root>
						</div>
					{/if}
				</div>
			{/if}
			<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
				<span class="text-xs text-muted-foreground">Drone</span>
				<Switch bind:checked={droneOn} />
			</div>
			<div class="h-2 w-full rounded-full bg-border/60">
				<div class="h-full rounded-full bg-primary/70" style={`width: ${progressPercent}%`}></div>
			</div>
			<div class="text-xs text-muted-foreground">
				{stage === 'playing' ? `Current note: ${currentLabel}` : stage === 'idle' ? 'Stopped' : stage}
			</div>
		</Card.Content>
	</Card.Root>
</div>
