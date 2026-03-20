<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/stores';

	let { children } = $props();

	const isActive = (path: string) => $page.url.pathname === path;
	const isSection = (prefix: string) => $page.url.pathname.startsWith(prefix);
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-screen">
	<header class="sticky top-0 z-40 hidden border-b border-border/60 bg-background/70 px-6 py-4 backdrop-blur md:block lg:px-10">
		<div class="mx-auto flex max-w-6xl flex-col gap-3">
			<div class="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Train My Ears</div>
			<nav class="flex w-full items-center gap-3 overflow-x-auto text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
				<a
					class={`whitespace-nowrap rounded-full px-3 py-1 transition-colors ${
						isActive('/') ? 'bg-primary/10 text-foreground' : 'hover:text-foreground'
					}`}
					href="/"
				>
					Start
				</a>
				<a
					class={`whitespace-nowrap rounded-full px-3 py-1 transition-colors ${
						isSection('/rhythm') && !isSection('/rhythm/advanced')
							? 'bg-primary/10 text-foreground'
							: 'hover:text-foreground'
					}`}
					href="/rhythm"
				>
					Rhythm
				</a>
				<a
					class={`whitespace-nowrap rounded-full px-3 py-1 transition-colors ${
						isSection('/harmony') && !isSection('/harmony/advanced')
							? 'bg-primary/10 text-foreground'
							: 'hover:text-foreground'
					}`}
					href="/harmony"
				>
					Harmony
				</a>
				<a
					class={`whitespace-nowrap rounded-full px-3 py-1 transition-colors ${
						isSection('/rhythm/advanced')
							? 'bg-primary/10 text-foreground'
							: 'hover:text-foreground'
					}`}
					href="/rhythm/advanced"
				>
					Rhythm Advanced
				</a>
				<a
					class={`whitespace-nowrap rounded-full px-3 py-1 transition-colors ${
						isSection('/harmony/advanced')
							? 'bg-primary/10 text-foreground'
							: 'hover:text-foreground'
					}`}
					href="/harmony/advanced"
				>
					Harmony Advanced
				</a>
			</nav>
		</div>
	</header>

	{#key $page.url.pathname}
		<div class="pb-24 md:pb-0">
			{@render children()}
		</div>
	{/key}

	<nav class="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 px-4 py-3 backdrop-blur md:hidden">
		<div class="mx-auto flex max-w-6xl items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
			<a
				class={`flex flex-col items-center gap-1 ${
					isActive('/') ? 'text-foreground' : 'hover:text-foreground'
				}`}
				href="/"
				aria-current={isActive('/') ? 'page' : undefined}
			>
				<span>Start</span>
				<span class={`h-1 w-1 rounded-full ${isActive('/') ? 'bg-primary' : 'bg-transparent'}`}></span>
			</a>
			<a
				class={`flex flex-col items-center gap-1 ${
					isSection('/rhythm') && !isSection('/rhythm/advanced')
						? 'text-foreground'
						: 'hover:text-foreground'
				}`}
				href="/rhythm"
				aria-current={isSection('/rhythm') && !isSection('/rhythm/advanced') ? 'page' : undefined}
			>
				<span>Rhythm</span>
				<span
					class={`h-1 w-1 rounded-full ${
						isSection('/rhythm') && !isSection('/rhythm/advanced') ? 'bg-primary' : 'bg-transparent'
					}`}
				></span>
			</a>
			<a
				class={`flex flex-col items-center gap-1 ${
					isSection('/harmony') && !isSection('/harmony/advanced')
						? 'text-foreground'
						: 'hover:text-foreground'
				}`}
				href="/harmony"
				aria-current={isSection('/harmony') && !isSection('/harmony/advanced') ? 'page' : undefined}
			>
				<span>Harmony</span>
				<span
					class={`h-1 w-1 rounded-full ${
						isSection('/harmony') && !isSection('/harmony/advanced') ? 'bg-primary' : 'bg-transparent'
					}`}
				></span>
			</a>
			<a
				class={`flex flex-col items-center gap-1 ${
					isSection('/rhythm/advanced') || isSection('/harmony/advanced')
						? 'text-foreground'
						: 'hover:text-foreground'
				}`}
				href="/rhythm/advanced"
				aria-current={
					isSection('/rhythm/advanced') || isSection('/harmony/advanced') ? 'page' : undefined
				}
			>
				<span>Advanced</span>
				<span
					class={`h-1 w-1 rounded-full ${
						isSection('/rhythm/advanced') || isSection('/harmony/advanced')
							? 'bg-primary'
							: 'bg-transparent'
					}`}
				></span>
			</a>
		</div>
	</nav>
</div>
