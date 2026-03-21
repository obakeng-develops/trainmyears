<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';

	const modes = ['rhythm', 'harmony', 'melody'] as const;
	let mode = $state<(typeof modes)[number]>('rhythm');
	let hasLastMode = $state(false);

	const startSession = () => {
		if (typeof window !== 'undefined') {
			window.localStorage.setItem('tm:lastMode', mode);
		}
		goto(`/${mode}`);
	};

	onMount(() => {
		if (typeof window === 'undefined') return;
		const lastMode = window.localStorage.getItem('tm:lastMode');
		if (lastMode && modes.includes(lastMode as (typeof modes)[number])) {
			hasLastMode = true;
			mode = lastMode as (typeof modes)[number];
		}
	});
</script>

<div class="min-h-screen px-6 py-10 lg:px-10">
	<div class="mx-auto flex max-w-5xl flex-col gap-12">
		<header class="space-y-5">
			<div class="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
				Ear Training
			</div>
			<h1 class="font-display text-4xl font-semibold text-foreground md:text-5xl">
				Train My Ears
			</h1>
			<p class="max-w-2xl text-base text-muted-foreground md:text-lg">
				A guided ear-training app for rhythm, melody, and harmony. Build the loop of
				hear → feel → produce with minimal friction.
			</p>
			<div class="flex flex-wrap gap-3">
				<Button class="px-6" onclick={() => goto('#start')}>Start session</Button>
				<Button variant="secondary" class="px-6" onclick={() => goto('/rhythm/advanced')}>
					Advanced
				</Button>
			</div>
		</header>

		<div class="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
			How it works
		</div>

		<div class="grid gap-4 md:grid-cols-3">
			<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
				<Card.Header>
					<div class="flex items-center gap-3">
						<div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-2)]">
							<svg
								viewBox="0 0 48 48"
								class="h-6 w-6 text-foreground"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<circle cx="24" cy="24" r="8" />
								<path d="M8 24c4-8 12-12 16-12s12 4 16 12" />
								<path d="M8 24c4 8 12 12 16 12s12-4 16-12" />
							</svg>
						</div>
						<div>
							<Card.Title class="font-display text-lg">Hear</Card.Title>
							<Card.Description>Anchor your ear with a pulse or drone.</Card.Description>
						</div>
					</div>
				</Card.Header>
			</Card.Root>
			<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
				<Card.Header>
					<div class="flex items-center gap-3">
						<div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-2)]">
							<svg
								viewBox="0 0 48 48"
								class="h-6 w-6 text-foreground"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path d="M12 30c2 6 6 10 12 10 8 0 12-6 12-14" />
								<path d="M10 22c4-2 8-6 10-10" />
								<circle cx="32" cy="16" r="4" />
							</svg>
						</div>
						<div>
							<Card.Title class="font-display text-lg">Feel</Card.Title>
							<Card.Description>Tap or clap as the loop guides timing.</Card.Description>
						</div>
					</div>
				</Card.Header>
			</Card.Root>
			<Card.Root class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
				<Card.Header>
					<div class="flex items-center gap-3">
						<div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-2)]">
							<svg
								viewBox="0 0 48 48"
								class="h-6 w-6 text-foreground"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path d="M20 10v18a6 6 0 1 0 4 5.7V16l10 2V12z" />
								<circle cx="16" cy="34" r="4" />
							</svg>
						</div>
						<div>
							<Card.Title class="font-display text-lg">Produce</Card.Title>
							<Card.Description>Speak or sing what you hear.</Card.Description>
						</div>
					</div>
				</Card.Header>
			</Card.Root>
		</div>

		<div class="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
			What you’ll practice
		</div>
		<div class="grid gap-4 md:grid-cols-3">
			<Card.Root class="border/60 bg-[var(--surface-2)]/80 shadow-none backdrop-blur">
				<Card.Header>
					<Card.Title class="font-display text-lg">Rhythm</Card.Title>
					<Card.Description>Pulse, subdivision, grouping, konnakol.</Card.Description>
				</Card.Header>
			</Card.Root>
			<Card.Root class="border/60 bg-[var(--surface-2)]/80 shadow-none backdrop-blur">
				<Card.Header>
					<Card.Title class="font-display text-lg">Harmony</Card.Title>
					<Card.Description>Function, inversions, drone-anchored listening.</Card.Description>
				</Card.Header>
			</Card.Root>
			<Card.Root class="border/60 bg-[var(--surface-2)]/80 shadow-none backdrop-blur">
				<Card.Header>
					<Card.Title class="font-display text-lg">Melody</Card.Title>
					<Card.Description>Movable Do phrases you can sing or tap back.</Card.Description>
				</Card.Header>
			</Card.Root>
		</div>

		<Card.Root id="start" class="border/60 bg-card/80 shadow-none backdrop-blur lg:shadow-lg">
			<Card.Header>
				<Card.Title class="font-display text-lg">Start a session</Card.Title>
				<Card.Description>Quickstart keeps it simple and fast.</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-6">
				<ToggleGroup.Root type="single" bind:value={mode} class="flex flex-wrap gap-2">
					{#each modes as value}
						<ToggleGroup.Item value={value} class="px-4 text-xs capitalize">
							{value}
						</ToggleGroup.Item>
					{/each}
				</ToggleGroup.Root>
				<Button class="w-full" onclick={startSession}>Begin session</Button>
				<div class="text-xs text-muted-foreground">
					Need full control? Go to <a class="underline" href={`/${mode}/advanced`}>Advanced</a>.
				</div>
				{#if hasLastMode}
					<Button variant="secondary" class="w-full" onclick={() => goto(`/${mode}`)}>
						Continue last mode
					</Button>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
</div>
