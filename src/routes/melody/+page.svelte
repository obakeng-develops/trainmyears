<script lang="ts">
	import { onMount } from 'svelte';
	import MelodyListeningTrainer from '$lib/melody/listening-trainer.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let bpm = $state(92);

	onMount(() => {
		if (typeof window !== 'undefined') {
			window.localStorage.setItem('tm:lastMode', 'melody');
		}
	});
</script>

<div class="min-h-screen px-6 py-10 pb-32 lg:px-10 lg:pb-10">
	<div class="mx-auto flex max-w-5xl flex-col gap-8">
		<header class="space-y-3">
			<div class="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
				Melody · Listening
			</div>
			<h1 class="font-display text-3xl font-semibold text-foreground md:text-4xl">
				Hear → Sing → Feel
			</h1>
			<p class="max-w-xl text-sm text-muted-foreground md:text-base">
				Practice scales and patterns against a drone with piano tone.
			</p>
			<Badge variant="secondary" class="text-xs">Passive-first</Badge>
		</header>

		<MelodyListeningTrainer bind:bpm={bpm} />
	</div>
</div>
