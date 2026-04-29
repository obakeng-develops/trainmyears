<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		RhythmEngine,
		type RhythmEngineConfig,
		type RhythmStage,
		type RhythmTick
	} from '$lib/rhythm/engine';
	import type { DropoutConfig } from '$lib/rhythm/engine';
	import {
		ChallengeTrainerEngine,
		CHALLENGE_TIER_NAMES,
		type ChallengeConfig,
		type ChallengeMode
	} from '$lib/rhythm/challenge-trainer';
	import type { DifficultyTier } from '$lib/rhythm/trainer';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	// Grouping presets for each meter
	const groupingPresets: Record<number, { label: string; groups: number[] }[]> = {
		2: [{ label: '2', groups: [2] }],
		3: [
			{ label: '3', groups: [3] },
			{ label: '2+1', groups: [2, 1] }
		],
		4: [
			{ label: '4', groups: [4] },
			{ label: '2+2', groups: [2, 2] },
			{ label: '3+1', groups: [3, 1] }
		],
		5: [
			{ label: '3+2', groups: [3, 2] },
			{ label: '2+3', groups: [2, 3] }
		],
		6: [
			{ label: '3+3', groups: [3, 3] },
			{ label: '2+2+2', groups: [2, 2, 2] }
		],
		7: [
			{ label: '3+2+2', groups: [3, 2, 2] },
			{ label: '2+2+3', groups: [2, 2, 3] },
			{ label: '2+3+2', groups: [2, 3, 2] }
		],
		8: [
			{ label: '4+4', groups: [4, 4] },
			{ label: '3+3+2', groups: [3, 3, 2] },
			{ label: '2+3+3', groups: [2, 3, 3] },
			{ label: '2+2+2+2', groups: [2, 2, 2, 2] }
		]
	};

	const floorOptions = ['2', '3', '4', '5', '6', '7', '8'];
	const layerOptions = ['1', '2', '3', '4', '5', '6', '7', '8'];

	// State
	let bpmValue = $state(96);
	let isPlaying = $state(false);
	let stage: RhythmStage = $state('idle');
	let currentStep = $state(0);
	let audioReady = $state(false);

	// Challenge-specific state
	let trainerEngine = $state<ChallengeTrainerEngine | null>(null);
	let currentTier = $state<DifficultyTier>(1);
	let challengeMode = $state<ChallengeMode>('beat');
	let drivingMode = $state(false);
	let showStats = $state(false);
	let tierChangeMessage = $state<string | null>(null);
	let tapStartTime = $state(0);
	let attemptCounter = $state(0);

	// Config state
	let meterValue = $state('4');
	let groupingIndex = $state(0);
	let floorsEnabled = $state(false);
	let floorDenom = $state('2');
	let layerCount = $state('3');

	// Trainer gameplay state
	let trainerTarget = $state<number | null>(null);
	let trainerFeedback = $state<'idle' | 'correct' | 'incorrect'>('idle');
	let trainerTimer: ReturnType<typeof setTimeout> | null = null;

	// Derived values
	const meter = $derived(Number(meterValue));
	const groupings = $derived(groupingPresets[meter] ?? groupingPresets[4]);
	const currentGrouping = $derived(groupings[groupingIndex] ?? groupings[0]);
	const floorDenomNum = $derived(Number(floorDenom));
	const layerCountNum = $derived(Number(layerCount));

	// Calculate total steps based on config
	const totalSteps = $derived.by(() => {
		if (floorsEnabled) {
			// LCM of floor and layer
			const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
			const lcm = (a: number, b: number) => (a * b) / gcd(a, b);
			return lcm(floorDenomNum, layerCountNum);
		}
		return meter;
	});

	const config: ChallengeConfig = $derived({
		meter,
		grouping: currentGrouping.groups,
		floorsEnabled,
		floorSteps: floorsEnabled ? floorDenomNum : undefined,
		layerSteps: floorsEnabled ? layerCountNum : undefined,
		mode: challengeMode
	});

	// Stats
	const sessionStats = $derived.by(() => {
		attemptCounter;
		return trainerEngine?.getSessionStats() ?? null;
	});
	const accuracy = $derived.by(() => {
		attemptCounter;
		return trainerEngine?.getAccuracy() ?? 0;
	});
	const avgResponseTime = $derived.by(() => {
		attemptCounter;
		return trainerEngine?.getAverageResponseTime() ?? 0;
	});
	const streak = $derived(sessionStats?.streak ?? 0);
	const tierName = $derived(trainerEngine?.getTierName() ?? 'Simple Meters');
	const allowedMeters = $derived(trainerEngine?.getAllowedMeters() ?? [2, 3, 4]);

	// Engine setup
	const engine = new RhythmEngine({
		onTick: (tick: RhythmTick) => {
			currentStep = tick.step;
			stage = tick.stage;
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
		const baseConfig: Partial<RhythmEngineConfig> = {
			bpm: bpmValue,
			countIn: true,
			countInBars: 1,
			pulseLevel: 0.25,
			subdivisionLevel: 0.8,
			groupingLevel: 0.55,
			swing: 0
		};

		if (floorsEnabled) {
			engine.setConfig({
				...baseConfig,
				mode: 'floors',
				floorSteps: floorDenomNum,
				layerSteps: layerCountNum,
				grouping: [totalSteps],
				totalSteps
			});
		} else {
			engine.setConfig({
				...baseConfig,
				mode: 'standard',
				grouping: currentGrouping.groups,
				totalSteps: meter
			});
		}
	};

	const startPlayback = async () => {
		if (isPlaying) return; // Prevent double-start
		console.log('StartPlayback called');
		try {
			console.log('Unlocking audio...');
			await unlockAudio();
			console.log('Audio unlocked, applying config...');
			applyConfig();
			console.log('Config applied, starting engine...');
			engine.start();
			console.log('Engine started');
			isPlaying = true;
			if (!drivingMode && trainerTarget === null && trainerEngine) {
				console.log('Picking trainer target...');
				pickTrainerTarget();
			}
		} catch (error) {
			console.error('Error starting playback:', error);
			isPlaying = false;
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

	const pickTrainerTarget = () => {
		if (!trainerEngine) return;
		trainerTarget = trainerEngine.getNextTarget(totalSteps, config);
		trainerFeedback = 'idle';
		tapStartTime = Date.now();
	};

	const tapCell = (step: number) => {
		if (drivingMode || !trainerEngine) return;

		const responseTime = Date.now() - tapStartTime;
		const isCorrect = step === trainerTarget;

		// Calculate beat target for mode tracking
		let beatTarget: number | undefined;
		if (config.mode === 'beat') {
			beatTarget = Math.floor((trainerTarget ?? 0) / (config.meter || 1));
		}

		// Record the attempt
		trainerEngine.recordAttempt(isCorrect, responseTime, config, trainerTarget ?? 0, beatTarget);

		// Check for tier changes
		const tierChange = trainerEngine.checkTierChange();
		if (tierChange.changed) {
			currentTier = tierChange.newTier;
			tierChangeMessage =
				tierChange.direction === 'up'
					? `🎉 Advanced to ${CHALLENGE_TIER_NAMES[tierChange.newTier]}!`
					: `📉 Dropped to ${CHALLENGE_TIER_NAMES[tierChange.newTier]}. Keep practicing!`;

			setTimeout(() => {
				tierChangeMessage = null;
			}, 3000);
		}

		trainerFeedback = isCorrect ? 'correct' : 'incorrect';
		attemptCounter++;

		if (trainerTimer) clearTimeout(trainerTimer);
		trainerTimer = setTimeout(() => {
			pickTrainerTarget();
		}, 450);
	};

	// Driving mode auto-play
	let drivingInterval: ReturnType<typeof setInterval> | null = null;

	const startDrivingMode = () => {
		if (!trainerEngine) return;
		
		// Pick a new target every few seconds
		const pickAndPlay = () => {
			pickTrainerTarget();
			// In driving mode, we just track that a pattern was played
			// No user input, so we don't record attempts
		};

		pickAndPlay();
		drivingInterval = setInterval(pickAndPlay, 3000);
	};

	const stopDrivingMode = () => {
		if (drivingInterval) {
			clearInterval(drivingInterval);
			drivingInterval = null;
		}
	};

	// Watch for driving mode toggle
	$effect(() => {
		if (drivingMode && isPlaying) {
			startDrivingMode();
		} else {
			stopDrivingMode();
		}
	});

	// Handle config changes by stopping playback first
	const handleConfigChange = () => {
		if (isPlaying) {
			stopPlayback();
		}
	};

	// Initialize trainer
	onMount(() => {
		if (typeof window !== 'undefined') {
			window.localStorage.setItem('tm:lastMode', 'rhythm');
			trainerEngine = new ChallengeTrainerEngine();
			currentTier = trainerEngine.getCurrentTier();
		}
	});

	onDestroy(() => {
		engine.stop();
		stopDrivingMode();
	});

	// Helper functions
	const isBeatStart = (step: number) => {
		if (floorsEnabled) {
			return step % (totalSteps / floorDenomNum) === 0;
		}
		return step % meter === 0;
	};

	const getBeatNumber = (step: number) => {
		if (floorsEnabled) {
			return Math.floor(step / (totalSteps / floorDenomNum)) + 1;
		}
		return Math.floor(step / meter) + 1;
	};

	const getSubdivisionLabel = (step: number) => {
		if (floorsEnabled) {
			const layerIndex = Math.floor(step / (totalSteps / layerCountNum));
			return String(layerIndex + 1);
		}
		const pos = step % meter;
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
		return konnakolMap[meter]?.[pos] ?? String(pos + 1);
	};
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

	@keyframes fade-in {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-fade-in {
		animation: fade-in 0.3s ease-out;
	}
</style>

<div class="min-h-screen px-6 py-10 pb-32 lg:px-10 lg:pb-10">
	<div class="mx-auto flex max-w-5xl flex-col gap-8">
		<header class="space-y-3">
			<div class="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
				Rhythm · Challenge Mode
			</div>
			<h1 class="font-display text-3xl font-semibold text-foreground md:text-4xl">
				Advanced Rhythm Challenge
			</h1>
			<p class="max-w-xl text-sm text-muted-foreground md:text-base">
				Test your rhythm skills with complex meters, groupings, and polyrhythms. Progress through 5 tiers of increasing difficulty.
			</p>
		</header>

		<!-- Tier Badge & Controls -->
		<div class="flex flex-wrap items-center gap-3">
			<Badge variant="secondary" class="text-xs">
				Tier {currentTier}/5 · {tierName}
			</Badge>
			<Badge variant="secondary" class="text-xs">
				{streak} streak
			</Badge>
			{#if drivingMode}
				<Badge variant="default" class="text-xs">Driving Mode</Badge>
			{/if}
			<div class="flex-1"></div>
			<div class="flex items-center gap-2">
				<span class="text-xs text-muted-foreground">Driving</span>
				<Switch bind:checked={drivingMode} />
			</div>
		</div>

		<!-- Main Content -->
		<div class="flex flex-col gap-6 lg:grid lg:grid-cols-[320px,1fr]">
			<!-- Sidebar: Config -->
			<aside class="order-2 space-y-6 lg:order-none">
				<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
					<Card.Header>
						<Card.Title class="font-display text-lg">Configuration</Card.Title>
						<Card.Description>Set meter, grouping, and mode.</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-4">
						<!-- Meter -->
						<div class="space-y-2">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Meter
							</div>
						<ToggleGroup.Root type="single" bind:value={meterValue} onValueChange={handleConfigChange} class="flex flex-wrap gap-2">
							{#each allowedMeters as value}
								<ToggleGroup.Item value={String(value)} class="px-3 text-xs">
									{value}
								</ToggleGroup.Item>
							{/each}
						</ToggleGroup.Root>
						</div>

						<!-- Grouping -->
						{#if !floorsEnabled}
							<div class="space-y-2">
								<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Grouping
								</div>
						<ToggleGroup.Root type="single" bind:value={groupingIndex} onValueChange={handleConfigChange} class="flex flex-wrap gap-2">
							{#each groupings as preset, index}
								<ToggleGroup.Item value={index} class="px-3 text-xs">
									{preset.label}
								</ToggleGroup.Item>
							{/each}
						</ToggleGroup.Root>
							</div>
						{/if}

						<!-- Floors -->
						{#if currentTier >= 4}
							<div class="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
								<div>
									<div class="text-sm font-semibold">Floors</div>
									<div class="text-xs text-muted-foreground">Polyrhythm mode</div>
								</div>
								<Switch bind:checked={floorsEnabled} onCheckedChange={handleConfigChange} />
							</div>
						{/if}

						{#if floorsEnabled}
							<div class="space-y-2">
								<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Floor
								</div>
								<ToggleGroup.Root type="single" bind:value={floorDenom} onValueChange={handleConfigChange} class="flex flex-wrap gap-2">
									{#each floorOptions as value}
										<ToggleGroup.Item value={value} class="px-3 text-xs">
											1/{value}
										</ToggleGroup.Item>
									{/each}
								</ToggleGroup.Root>
							</div>
							<div class="space-y-2">
								<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Layer
								</div>
								<ToggleGroup.Root type="single" bind:value={layerCount} onValueChange={handleConfigChange} class="flex flex-wrap gap-2">
									{#each layerOptions as value}
										<ToggleGroup.Item value={value} class="px-3 text-xs">
											{value}/{floorDenom}
										</ToggleGroup.Item>
									{/each}
								</ToggleGroup.Root>
							</div>
						{/if}

						<!-- Mode -->
						<div class="space-y-2">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Identification Mode
							</div>
							<ToggleGroup.Root type="single" bind:value={challengeMode} onValueChange={handleConfigChange} class="flex flex-wrap gap-2">
								<ToggleGroup.Item value="beat" class="px-3 text-xs">Beat</ToggleGroup.Item>
								<ToggleGroup.Item value="step" class="px-3 text-xs">Step</ToggleGroup.Item>
							</ToggleGroup.Root>
							<div class="text-xs text-muted-foreground">
								{challengeMode === 'beat' ? 'Identify which beat' : 'Identify exact step'}
							</div>
						</div>

						<!-- BPM -->
						<div class="space-y-2">
							<div class="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								<span>Tempo</span>
								<span class="text-foreground">{bpmValue} BPM</span>
							</div>
							<Slider type="single" min={60} max={140} step={1} bind:value={bpmValue} />
						</div>
					</Card.Content>
				</Card.Root>

				<!-- Session Progress -->
				{#if !drivingMode && sessionStats}
					<details class="rounded-xl border border-border/60 bg-card/80 p-4 shadow-none backdrop-blur lg:shadow-lg">
						<summary class="flex cursor-pointer items-center justify-between text-sm font-semibold">
							<span>Session Progress</span>
							<span class="text-xs text-muted-foreground">
								{sessionStats.correctCount}/{sessionStats.totalAttempts} correct
							</span>
						</summary>
						<div class="mt-4 space-y-4">
							<!-- Current tier indicator -->
							<div>
								<div class="mb-1 flex justify-between text-xs">
									<span class="text-muted-foreground">Current Level</span>
									<span class="font-semibold">{tierName}</span>
								</div>
								<div class="h-2 w-full rounded-full bg-border/60">
									<div
										class="h-full rounded-full bg-primary/70 transition-all"
										style={`width: ${(currentTier / 5) * 100}%`}
									></div>
								</div>
								<p class="mt-1 text-xs text-muted-foreground">
									{trainerEngine?.getTierDescription() ?? ''}
								</p>
							</div>

							<!-- Stats grid -->
							<div class="grid grid-cols-3 gap-2 text-center">
								<div class="rounded-lg bg-[var(--surface-2)] p-2">
									<div class="text-lg font-semibold">{accuracy}%</div>
									<div class="text-[10px] uppercase text-muted-foreground">Accuracy</div>
								</div>
								<div class="rounded-lg bg-[var(--surface-2)] p-2">
									<div class="text-lg font-semibold">{streak}</div>
									<div class="text-[10px] uppercase text-muted-foreground">Streak</div>
								</div>
								<div class="rounded-lg bg-[var(--surface-2)] p-2">
									<div class="text-lg font-semibold">{avgResponseTime}ms</div>
									<div class="text-[10px] uppercase text-muted-foreground">Avg Time</div>
								</div>
							</div>

							<!-- Mode breakdown -->\t						{#if sessionStats.modeBreakdown}
								<div class="text-xs text-muted-foreground">
									<div class="mb-1 font-semibold">By mode:</div>
									{#each Object.entries(sessionStats.modeBreakdown) as [mode, stats]}
										<div class="flex justify-between">
											<span>{mode}</span>
											<span>
												{stats.correct}/{stats.total}
												({stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0}%)
											</span>
										</div>
									{/each}
								</div>
							{/if}

							<!-- Meter breakdown -->
							{#if Object.keys(sessionStats.meterBreakdown).length > 0}
								<div class="text-xs text-muted-foreground">
									<div class="mb-1 font-semibold">By meter:</div>
									{#each Object.entries(sessionStats.meterBreakdown) as [meterVal, stats]}
										<div class="flex justify-between">
											<span>{meterVal}/4</span>
											<span>
												{stats.correct}/{stats.total}
												({stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0}%)
											</span>
										</div>
									{/each}
								</div>
							{/if}

							<!-- Max streak -->
							{#if sessionStats.maxStreak > 0}
								<div class="text-xs text-muted-foreground">
									<span class="font-semibold">Best streak:</span>
									{sessionStats.maxStreak} correct in a row
								</div>
							{/if}
						</div>
					</details>
				{/if}
			</aside>

			<!-- Main: Playback Grid -->
			<main class="order-1 space-y-6 lg:order-none">
				<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-xl">
					<Card.Header class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<div>
							<Card.Title class="font-display text-xl">
								{drivingMode ? 'Driving Practice' : 'Tap the Grid'}
							</Card.Title>
							<Card.Description>
								{drivingMode 
									? 'Listen and identify mentally. Patterns auto-play.' 
									: 'Tap the cell where you hear the target sound.'}
							</Card.Description>
						</div>
						<div class="flex items-center gap-3">
							<Badge variant={stage === 'count-in' ? 'secondary' : 'default'} class="text-xs">
								{stage === 'count-in' ? 'Count-in' : stage === 'playing' ? 'Playing' : 'Idle'}
							</Badge>
							<Button onclick={togglePlayback} class="px-5">
								{isPlaying ? 'Stop' : 'Start'}
							</Button>
						</div>
					</Card.Header>
					<Card.Content class="space-y-6">
						<!-- Grid -->
						{#if !drivingMode}
							<div class="grid gap-1" style={`grid-template-columns: repeat(${totalSteps}, minmax(0, 1fr));`}>
								{#each Array.from({ length: totalSteps }, (_, i) => i) as step}
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
											trainerTarget === step ? 'ring-2 ring-primary/60' : ''
										}`}
										onclick={() => tapCell(step)}
										disabled={!isPlaying}
									>
										<div class="text-[10px] text-muted-foreground">{getBeatNumber(step)}</div>
										<div>{getSubdivisionLabel(step)}</div>
									</button>
								{/each}
							</div>
						{:else}
							<!-- Driving Mode Display -->
							<div class="flex flex-col items-center justify-center space-y-6 py-12">
								<div class="text-center">
									<div class="text-6xl font-bold text-primary">{currentTier}</div>
									<div class="mt-2 text-sm text-muted-foreground">Current Tier</div>
								</div>
								<div class="grid grid-cols-3 gap-4 text-center">
									<div>
										<div class="text-2xl font-semibold">{accuracy}%</div>
										<div class="text-xs text-muted-foreground">Accuracy</div>
									</div>
									<div>
										<div class="text-2xl font-semibold">{sessionStats?.totalAttempts ?? 0}</div>
										<div class="text-xs text-muted-foreground">Patterns</div>
									</div>
									<div>
										<div class="text-2xl font-semibold">{streak}</div>
										<div class="text-xs text-muted-foreground">Streak</div>
									</div>
								</div>
								<div class="text-xs text-muted-foreground">
									Listening to {meter}/{meter} meter
									{#if floorsEnabled}
										with {layerCount}/{floorDenom} polyrhythm
									{/if}
								</div>
							</div>
						{/if}

						<!-- Feedback -->
						{#if !drivingMode && trainerFeedback !== 'idle'}
							<div
								class={`mt-3 rounded-lg border border-border/60 px-3 py-2 text-sm ring-1 ${
									trainerFeedback === 'correct'
										? 'bg-emerald-500/10 text-emerald-200 ring-emerald-400/30'
										: 'bg-rose-500/10 text-rose-200 ring-rose-400/30'
								}`}
							>
								{trainerFeedback === 'correct'
									? 'Correct! Keep the pulse steady.'
									: 'Not quite. Listen for the target sound.'}
							</div>
						{/if}

						<!-- Tier Change Message -->
						{#if tierChangeMessage}
							<div
								class="animate-fade-in rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-center text-sm"
							>
								{tierChangeMessage}
							</div>
						{/if}
					</Card.Content>
				</Card.Root>

				<!-- Instructions -->
				<div class="rounded-2xl border border-border/70 bg-[var(--surface-1)] p-6">
					<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						How it works
					</div>
					<div class="mt-2 text-sm">
						{#if drivingMode}
							Listen to the patterns and identify the target sound mentally. 
							The app will cycle through different positions automatically. 
							This is perfect for practice while driving or when you can't interact with the screen.
						{:else}
							Press Start to hear the rhythm. A target sound will play at a specific position. 
							Tap the grid cell where you think the sound occurred. 
							Get 85% correct over 15 attempts to advance to the next tier.
						{/if}
					</div>
				</div>
			</main>
		</div>

		<div class="text-xs text-muted-foreground">
			iOS: Silent Mode mutes web audio. Flip the ring switch if you hear nothing.
		</div>

		<div class="text-sm text-muted-foreground">
			<a class="underline" href="/rhythm">← Back to Quickstart</a>
			<span class="mx-2">·</span>
			<a class="underline" href="/rhythm/advanced">Open Advanced Console</a>
		</div>
	</div>
</div>
