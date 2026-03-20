<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		RhythmEngine,
		type RhythmEngineConfig,
		type RhythmStage,
		type RhythmTick
	} from '$lib/rhythm/engine';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	const roleOptions = ['instrumentalist', 'drummer', 'singer'] as const;
	const syllables = ['Ta', 'Ka', 'Di', 'Mi'];
	const steps = [
		{
			id: 'pulse',
			label: 'Pulse only',
			prompt: {
				instrumentalist: 'Tap the pulse with your foot.',
				drummer: 'Foot the pulse. Keep it steady.',
				singer: 'Feel the pulse in your body.'
			}
		},
		{
			id: 'subdivision',
			label: 'Subdivision only',
			prompt: {
				instrumentalist: 'Clap every subdivision.',
				drummer: 'Stick the subdivisions cleanly.',
				singer: 'Clap lightly and evenly.'
			}
		},
		{
			id: 'syllables',
			label: 'Konnakol',
			prompt: {
				instrumentalist: 'Speak the syllables clearly.',
				drummer: 'Speak syllables to anchor the grid.',
				singer: 'Sing the syllables smoothly.'
			}
		},
		{
			id: 'combine',
			label: 'Combine',
			prompt: {
				instrumentalist: 'Pulse + subdivisions + syllables together.',
				drummer: 'Foot + stick + syllables together.',
				singer: 'Pulse + clap + voice together.'
			}
		}
	] as const;

	let role = $state<(typeof roleOptions)[number]>('instrumentalist');
	let bpmValue = $state(96);
	let countIn = $state(true);
	let isPlaying = $state(false);
	let stage: RhythmStage = $state('idle');
	let currentStep = $state(0);
	let autoAdvance = $state(true);
	let holdHere = $state(false);
	let activeStep = $state(0);
	let barsRemaining = $state(8);
	let lastConfigKey = $state('');
	let totalBars = 8;
	let pendingRestart = $state(false);

	const engine = new RhythmEngine({
		onTick: (tick: RhythmTick) => {
			currentStep = tick.step;
			stage = tick.stage;
			if (tick.stage !== 'playing') return;
			if (tick.step === 0) {
				barsRemaining = Math.max(0, barsRemaining - 1);
				if (autoAdvance && !holdHere && barsRemaining === 0) {
					activeStep = Math.min(activeStep + 1, steps.length - 1);
					barsRemaining = 8;
					pendingRestart = true;
					setTimeout(() => {
						if (!pendingRestart) return;
						pendingRestart = false;
						restartPlayback();
					}, 0);
				}
			}
		},
		onStageChange: (nextStage) => {
			stage = nextStage;
		}
	});

	const stopPlayback = () => {
		engine.stop();
		isPlaying = false;
		stage = 'idle';
		currentStep = 0;
		barsRemaining = 8;
	};

	const restartPlayback = () => {
		stopPlayback();
		startPlayback();
	};

	const startPlayback = () => {
		barsRemaining = 8;
		engine.setConfig({
			bpm: bpmValue,
			grouping: [4],
			totalSteps: 4,
			countIn,
			countInBars: 1,
			pulseLevel: activeStep === 0 ? 0.9 : activeStep === 1 ? 0.2 : 0.5,
			subdivisionLevel: activeStep === 1 ? 0.9 : activeStep === 0 ? 0.2 : 0.6,
			groupingLevel: 0
		} as Partial<RhythmEngineConfig>);
		engine.start();
		isPlaying = true;
	};

	const togglePlayback = () => {
		if (isPlaying) {
			stopPlayback();
		} else {
			startPlayback();
		}
	};

	const stepLabel = () => steps[activeStep]?.label ?? '';
	const stepPrompt = () => steps[activeStep]?.prompt[role] ?? '';
	const progressPercent = $derived(((totalBars - barsRemaining) / totalBars) * 100);

	const configKey = $derived(`${bpmValue}-${activeStep}-${countIn}`);
	$effect(() => {
		if (isPlaying && configKey !== lastConfigKey) {
			stopPlayback();
			startPlayback();
		}
		lastConfigKey = configKey;
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
				Hear → Feel → Produce
			</h1>
			<p class="max-w-xl text-sm text-muted-foreground md:text-base">
				A tight loop for beginners: pulse, subdivision, konnakol, then combine.
			</p>
		</header>

		<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-xl">
			<Card.Header class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div>
					<Card.Title class="font-display text-2xl">{stepLabel()}</Card.Title>
					<Card.Description class="text-base">{stepPrompt()}</Card.Description>
				</div>
				<div class="flex items-center gap-3">
					<Badge variant="secondary" class="text-xs">Next in {barsRemaining} bars</Badge>
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
				<div class="h-2 w-full rounded-full bg-border/60">
					<div
						class="h-full rounded-full bg-primary/70 transition-all"
						style={`width: ${progressPercent}%;`}
					></div>
				</div>
				<div class="grid grid-cols-4 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{#each syllables as syllable, index}
						<div
							class={`rounded-lg border border-border/60 px-2 py-3 ${
								activeStep === 1
									? currentStep === index && stage !== 'idle'
										? 'bg-[var(--surface-2)] text-foreground shadow-[0_0_12px_rgba(186,120,52,0.3)]'
										: 'bg-transparent opacity-50'
									: currentStep === index && stage !== 'idle'
										? 'bg-[var(--surface-2)] text-foreground'
										: 'bg-transparent'
							}`}
						>
							{syllable}
						</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>

		<details class="rounded-xl border border-border/60 bg-card/80 p-4 shadow-none backdrop-blur lg:shadow-lg">
			<summary class="flex cursor-pointer items-center justify-between text-sm font-semibold">
				Settings
				<span class="text-xs text-muted-foreground">Role · Tempo · Auto‑advance</span>
			</summary>
			<div class="mt-4 grid gap-4 md:grid-cols-3">
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
					<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Role</div>
					<ToggleGroup.Root type="single" bind:value={role} class="mt-2 flex flex-wrap gap-2">
						{#each roleOptions as value}
							<ToggleGroup.Item value={value} class="px-3 text-xs capitalize">
								{value}
							</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
				</div>
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
					<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tempo</div>
					<div class="mt-2 flex items-center justify-between text-xs text-muted-foreground">
						<span>BPM</span>
						<span class="text-foreground">{bpmValue}</span>
					</div>
					<Slider type="single" min={60} max={140} step={1} bind:value={bpmValue} />
				</div>
				<div class="rounded-xl border border-border/60 bg-[var(--surface-2)] px-4 py-3">
					<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Auto‑advance</div>
					<div class="mt-2 flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
						<span class="text-xs text-muted-foreground">Auto‑advance</span>
						<Switch bind:checked={autoAdvance} />
					</div>
					<div class="mt-2 flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
						<span class="text-xs text-muted-foreground">Hold here</span>
						<Switch bind:checked={holdHere} />
					</div>
				</div>
			</div>
		</details>

		<div class="text-sm text-muted-foreground">
			Need full control? <a class="underline" href="/rhythm/advanced">Open Rhythm Advanced</a>.
		</div>
	</div>
</div>
