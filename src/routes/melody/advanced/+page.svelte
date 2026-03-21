<script lang="ts">
	import AdvancedConsole from '$lib/pages/advanced-console.svelte';
	import { onMount } from 'svelte';

	onMount(() => {
		if (typeof window !== 'undefined') {
			window.localStorage.setItem('tm:lastMode', 'melody');
		}
	});
</script>

<AdvancedConsole initialPhase="melody" showPhaseToggle={false} />
