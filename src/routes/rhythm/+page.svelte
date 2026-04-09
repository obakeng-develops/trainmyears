<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		RhythmEngine,
		type RhythmEngineConfig,
		type RhythmStage,
		type RhythmTick
	} from '$lib/rhythm/engine';
	import type { DropoutConfig } from '$lib/rhythm/engine';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	const subdivisionOptions = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;
	const konnakolMap: Record<number, string[]> = {
		1: ['Ta'],
		2: ['Ta', 'Ka'],
		3: ['Ta', 'Ki', 'Ta'],
		4: ['Ta', 'Ka', 'Di', 'Mi'],
		5: ['Ta', 'Tin', 'Ge', 'Na', 'To'],
		6: ['Ta', 'Ki', 'Ta', 'Ta', 'Ki', 'Ta'],
		7: ['Ta', 'Ki', 'Ta', 'Ta', 'Ka', 'Ju', 'Na'],
		8: ['Ta', 'Ki', 'Ta', 'Ta', 'Ki', 'Ta', 'Ta', 'Ka']
	};

	let bpmValue = $state(96);
	let countIn = $state(true);
	let isPlaying = $state(false);
	let stage: RhythmStage = $state('idle');
	let currentStep = $state(0);
	let subdivision = $state('4');
	let contextPulse = $state(true);
	let trainerOn = $state(false);
	let trainerTarget = $state<number | null>(null);
	let trainerFeedback = $state<'idle' | 'correct' | 'incorrect'>('idle');
	let trainerTimer: ReturnType<typeof setTimeout> | null = null;
	let audioReady = $state(false);
	let lastConfigKey = $state('');
	let dropoutEnabled = $state(false);
	let dropoutBarsOn = $state(2);
	let dropoutBarsSilent = $state(2);
	let dropoutDropPulse = $state(true);
	let dropoutDropSubdivision = $state(true);
	let dropoutPhase = $state<'on' | 'silent' | 'off'>('off');
	let dropoutBarsRemaining = $state(0);

	const subdivisionCount = $derived(Number(subdivision));
	const totalSteps = $derived(subdivisionCount * 4);
	const syllables = $derived(konnakolMap[subdivisionCount] ?? ['Ta']);
	const steps = $derived(Array.from({ length: totalSteps }, (_, index) => index));
	const beatNumbers = [1, 2, 3, 4];
	const progressPercent = $derived(totalSteps ? (currentStep / totalSteps) * 100 : 0);

	const engine = new RhythmEngine({
		onTick: (tick: RhythmTick) => {
			currentStep = tick.step;
			stage = tick.stage;
			dropoutPhase = tick.dropoutPhase;
			dropoutBarsRemaining = tick.dropoutBarsRemaining;
		},
		onStageChange: (nextStage) => {
			stage = nextStage;
		}
	});

	const unlockAudio = async () => {
		if (audioReady) return;
		try {
			await (engine as any).unlock?.();
			audioReady = true;
		} catch {
			audioReady = false;
		}
	};

	const applyConfig = () => {
		engine.setConfig({
			bpm: bpmValue,
			grouping: Array.from({ length: 4 }, () => subdivisionCount),
			totalSteps,
			countIn,
			countInBars: 1,
			pulseLevel: contextPulse ? 0.25 : 0,
			subdivisionLevel: 0.8,
			groupingLevel: contextPulse ? 0.55 : 0,
			dropout: {
				enabled: dropoutEnabled,
				barsOn: dropoutBarsOn,
				barsSilent: dropoutBarsSilent,
				dropPulse: dropoutDropPulse,
				dropSubdivision: dropoutDropSubdivision
			} satisfies DropoutConfig
		} as Partial<RhythmEngineConfig>);
	};

	const startPlayback = async () => {
		await unlockAudio();
		applyConfig();
		engine.start();
		isPlaying = true;
		if (trainerOn && trainerTarget === null) {
			trainerTarget = Math.floor(Math.random() * totalSteps);
		}
	};

	const stopPlayback = () => {
		engine.stop();
		isPlaying = false;
		stage = 'idle';
		currentStep = 0;
	};

	const togglePlayback = () => {
		if (isPlaying) {
			stopPlayback();
		} else {
			void startPlayback();
		}
	};

	const labelForStep = (step: number) => syllables[step % subdivisionCount] ?? '';
	const beatForStep = (step: number) => Math.floor(step / subdivisionCount) + 1;
	const isBeatStart = (step: number) => step % subdivisionCount === 0;

	const pickTrainerTarget = () => {
		trainerTarget = Math.floor(Math.random() * totalSteps);
		trainerFeedback = 'idle';
	};

	const tapCell = (step: number) => {
		if (!trainerOn) return;
		if (trainerTarget === null) {
			trainerTarget = step;
			trainerFeedback = 'idle';
			return;
		}
		trainerFeedback = step === trainerTarget ? 'correct' : 'incorrect';
		if (trainerTimer) clearTimeout(trainerTimer);
		trainerTimer = setTimeout(() => {
			pickTrainerTarget();
		}, 450);
	};

	const configKey = $derived(`${bpmValue}-${countIn}-${subdivision}-${contextPulse}-${dropoutEnabled}-${dropoutBarsOn}-${dropoutBarsSilent}-${dropoutDropPulse}-${dropoutDropSubdivision}`);
	$effect(() => {
		if (isPlaying && configKey !== lastConfigKey) {
			stopPlayback();
			startPlayback();
		}
		lastConfigKey = configKey;
	});

	$effect(() => {
		if (!trainerOn) {
			trainerTarget = null;
			trainerFeedback = 'idle';
			if (trainerTimer) {
				clearTimeout(trainerTimer);
				trainerTimer = null;
			}
			return;
		}
		if (trainerTarget === null || trainerTarget >= totalSteps) {
			pickTrainerTarget();
		}
	});

	onMount(() => {
		if (typeof window !== 'undefined') {
			window.localStorage.setItem('tm:lastMode', 'rhythm');
		}
	});

	onDestroy(() => {
		engine.stop();
	});
</script>

<style>
	@keyframes rhythm-pulse {
		0% {
			transform: scale(1);
			opacity: 0.55;
		}
		70% {
			transform: scale(1.4);
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
				Rhythm · Quickstart
			</div>
			<h1 class="font-display text-3xl font-semibold text-foreground md:text-4xl">
				Hear → Place → Speak
			</h1>
			<p class="max-w-xl text-sm text-muted-foreground md:text-base">
				See a whole note and its subdivisions in konnakol, then place the sound in context.
			</p>
		</header>

		<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-xl">
			<Card.Header class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div>
					<Card.Title class="font-display text-2xl">Subdivision grid</Card.Title>
					<Card.Description class="text-base">
						Tap the grid to answer. Keep the pulse in your body.
					</Card.Description>
				</div>
				<div class="flex items-center gap-3">
					<Badge variant="secondary" class="text-xs">{subdivision} per beat</Badge>
					<div class="relative">
						{#if isPlaying}
							<span
								class="absolute inset-0 rounded-full border border-primary/40 blur-sm"
								style={`animation: rhythm-pulse ${60 / bpmValue}s ease-out infinite;`}
							></span>
						{/if}
						<Button onclick={togglePlayback} class="relative px-5">
							{isPlaying ? 'Stop' : 'Start'}
						</Button>
					</div>
				</div>
			</Card.Header>
			<Card.Content class="space-y-6">
				<div class="grid grid-cols-4 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{#each beatNumbers as beat}
						<div class="rounded-lg border border-border/60 bg-background/50 px-2 py-2">{beat}</div>
					{/each}
				</div>
				<div
					class="grid gap-1"
					style={`grid-template-columns: repeat(${totalSteps}, minmax(0, 1fr));`}
				>
					{#each steps as step}
						<button
							type="button"
							class={`rounded-md border px-2 py-3 text-[11px] font-semibold uppercase tracking-wide transition ${
								isBeatStart(step)
									? 'border-primary/40 bg-[var(--surface-2)]'
									: 'border-border/60 bg-transparent'
							} ${
								stage !== 'idle' && currentStep === step
									? 'text-foreground shadow-[0_0_12px_rgba(186,120,52,0.35)]'
									: 'text-muted-foreground'
							} ${
								trainerOn && trainerTarget === step
									? 'ring-2 ring-primary/60'
									: ''
							}`}
							onclick={() => tapCell(step)}
						>
							<div class="text-[10px] text-muted-foreground">{beatForStep(step)}</div>
							<div>{labelForStep(step)}</div>
						</button>
					{/each}
				</div>
				<div class="h-2 w-full rounded-full bg-border/60">
					<div class="h-full rounded-full bg-primary/70 transition-all" style={`width: ${progressPercent}%;`}></div>
				</div>
				{#if dropoutEnabled && stage === 'playing'}
					<div class={`rounded-lg border px-3 py-2 text-xs ${dropoutPhase === 'silent' ? 'border-rose-400/30 bg-rose-500/10 text-rose-300' : 'border-border/60 text-muted-foreground'}`}>
						{dropoutPhase === 'silent'
							? `Silent — hold it. ${dropoutBarsRemaining} bar${dropoutBarsRemaining === 1 ? '' : 's'} to return`
							: `Playing — ${dropoutBarsRemaining} bar${dropoutBarsRemaining === 1 ? '' : 's'} until dropout`}
					</div>
				{/if}
				<div class="rounded-2xl border border-border/70 bg-[var(--surface-1)] p-6">
					<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What to listen for</div>
					<div class="mt-2 text-sm">
						Hear the pulse, then place the syllable in the grid. Tap the cell you hear.
					</div>
					{#if trainerFeedback !== 'idle'}
						<div
							class={`mt-3 rounded-lg border border-border/60 px-3 py-2 text-sm ring-1 ${
								trainerFeedback === 'correct'
									? 'bg-emerald-500/10 text-emerald-200 ring-emerald-400/30'
									: 'bg-rose-500/10 text-rose-200 ring-rose-400/30'
							}`}
						>
							{trainerFeedback === 'correct'
								? 'Correct. Keep the pulse steady.'
								: 'Not quite. Listen for the slot inside the beat.'}
						</div>
					{/if}
				</div>
			</Card.Content>
		</Card.Root>

		<details class="rounded-xl border border-border/60 bg-card/80 p-4 shadow-none backdrop-blur lg:shadow-lg">
			<summary class="flex cursor-pointer items-center justify-between text-sm font-semibold">
				Settings
				<span class="text-xs text-muted-foreground">Subdivision · Context · Tempo · Dropout</span>
			</summary>
			<div class="mt-4 grid gap-4 md:grid-cols-3">
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
					<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subdivision</div>
					<ToggleGroup.Root type="single" bind:value={subdivision} class="mt-2 flex flex-wrap gap-2">
						{#each subdivisionOptions as value}
							<ToggleGroup.Item value={value} class="px-3 text-xs">
								{value}
							</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
					<div class="mt-2 text-xs text-muted-foreground">Default: 4 (Ta Ka Di Mi)</div>
				</div>
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
					<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Context</div>
					<div class="mt-2 flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
						<span class="text-xs text-muted-foreground">Pulse</span>
						<Switch bind:checked={contextPulse} />
					</div>
					<div class="mt-2 flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
						<span class="text-xs text-muted-foreground">Trainer</span>
						<Switch bind:checked={trainerOn} />
					</div>
				</div>
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
					<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tempo</div>
					<div class="mt-2 flex items-center justify-between text-xs text-muted-foreground">
						<span>BPM</span>
						<span class="text-foreground">{bpmValue}</span>
					</div>
					<Slider type="single" min={60} max={140} step={1} bind:value={bpmValue} />
					<div class="mt-2 flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
						<span class="text-xs text-muted-foreground">Count-in</span>
						<Switch bind:checked={countIn} />
					</div>
				</div>
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3 md:col-span-3">
					<div class="flex items-center justify-between">
						<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dropout</div>
						<Switch bind:checked={dropoutEnabled} />
					</div>
					{#if dropoutEnabled}
						<div class="mt-3 grid gap-3 sm:grid-cols-2">
							<div>
								<div class="mb-1 flex items-center justify-between text-xs text-muted-foreground">
									<span>Bars on</span>
									<span class="text-foreground">{dropoutBarsOn}</span>
								</div>
								<Slider type="single" min={1} max={16} step={1} bind:value={dropoutBarsOn} />
							</div>
							<div>
								<div class="mb-1 flex items-center justify-between text-xs text-muted-foreground">
									<span>Bars silent</span>
									<span class="text-foreground">{dropoutBarsSilent}</span>
								</div>
								<Slider type="single" min={1} max={16} step={1} bind:value={dropoutBarsSilent} />
							</div>
						</div>
						<div class="mt-3 flex flex-wrap gap-2">
							<div class="flex flex-1 items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
								<span class="text-xs text-muted-foreground">Drop pulse</span>
								<Switch bind:checked={dropoutDropPulse} />
							</div>
							<div class="flex flex-1 items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
								<span class="text-xs text-muted-foreground">Drop subdivisions</span>
								<Switch bind:checked={dropoutDropSubdivision} />
							</div>
						</div>
					{/if}
				</div>
			</div>
		</details>

		<div class="text-xs text-muted-foreground">
			iOS: Silent Mode mutes web audio. Flip the ring switch if you hear nothing.
		</div>

		<div class="text-sm text-muted-foreground">
			Need full control? <a class="underline" href="/rhythm/advanced">Open Rhythm Advanced</a>.
		</div>
	</div>
</div>
