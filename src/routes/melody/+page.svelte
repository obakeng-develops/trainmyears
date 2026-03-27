<script lang="ts">
	import { onMount } from 'svelte';
	import MelodyListeningTrainerMinimal from '$lib/melody/listening-trainer-minimal.svelte';
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
			<div class="text-xs font-semibold tracking-[0.3em] text-muted-foreground uppercase">
				Melody · Listening
			</div>
			<h1 class="font-display text-3xl font-semibold text-foreground md:text-4xl">
				Hear → Sing → Feel
			</h1>
			<p class="max-w-xl text-sm text-muted-foreground md:text-base">
				On-the-go melody practice in your ears: hear context, recall quickly, then reveal.
			</p>
			<Badge variant="secondary" class="text-xs">On-the-go ready</Badge>
		</header>

		<MelodyListeningTrainerMinimal bind:bpm />
	</div>
</div>
