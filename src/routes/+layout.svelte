<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/stores';

	let { children } = $props();

	const isActive = (path: string) => $page.url.pathname === path;
	const isSection = (prefix: string) => $page.url.pathname.startsWith(prefix);
	const getDiscipline = () =>
		isSection('/rhythm')
			? 'rhythm'
			: isSection('/harmony')
				? 'harmony'
				: isSection('/melody')
					? 'melody'
					: null;
	const isAdvancedRoute = () => $page.url.pathname.includes('/advanced');
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-screen">
	<!-- Desktop header -->
	<header
		class="sticky top-0 z-40 hidden border-b border-border/60 bg-background/70 px-6 py-4 backdrop-blur md:block lg:px-10"
	>
		<div class="mx-auto flex max-w-6xl flex-col gap-3">
			<div class="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
				Train My Ears
			</div>

			<!-- Primary nav: disciplines -->
			<nav
				class="flex w-full items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
			>
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
						isSection('/rhythm') ? 'bg-primary/10 text-foreground' : 'hover:text-foreground'
					}`}
					href="/rhythm"
				>
					Rhythm
				</a>
				<a
					class={`whitespace-nowrap rounded-full px-3 py-1 transition-colors ${
						isSection('/harmony') ? 'bg-primary/10 text-foreground' : 'hover:text-foreground'
					}`}
					href="/harmony"
				>
					Harmony
				</a>
				<a
					class={`whitespace-nowrap rounded-full px-3 py-1 transition-colors ${
						isSection('/melody') ? 'bg-primary/10 text-foreground' : 'hover:text-foreground'
					}`}
					href="/melody"
				>
					Melody
				</a>
				<a
					class={`whitespace-nowrap rounded-full px-3 py-1 transition-colors ${
						isSection('/progression') ? 'bg-primary/10 text-foreground' : 'hover:text-foreground'
					}`}
					href="/progression"
				>
					Progression
				</a>
			</nav>

			<!-- Secondary nav: mode (only on discipline sections) -->
			{#if getDiscipline()}
				<nav
					class="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
				>
					<a
						class={`whitespace-nowrap rounded-full px-3 py-1 transition-colors ${
							!isAdvancedRoute() ? 'bg-primary/10 text-foreground' : 'hover:text-foreground'
						}`}
						href="/{getDiscipline()}"
					>
						Quickstart
					</a>
					<span class="select-none px-1 text-border/60">·</span>
					<a
						class={`whitespace-nowrap rounded-full px-3 py-1 transition-colors ${
							isAdvancedRoute() ? 'bg-primary/10 text-foreground' : 'hover:text-foreground'
						}`}
						href="/{getDiscipline()}/advanced"
					>
						Advanced
					</a>
				</nav>
			{/if}
		</div>
	</header>

	{#key $page.url.pathname}
		<div class="pb-32 md:pb-0">
			{@render children()}
		</div>
	{/key}

	<!-- Mobile nav -->
	<nav
		class="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur md:hidden"
	>
		<!-- Mode strip: quickstart / advanced (discipline sections only) -->
		{#if getDiscipline()}
			<div
				class="flex items-center justify-center gap-6 border-b border-border/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground"
			>
				<a
					class={`transition-colors ${!isAdvancedRoute() ? 'text-foreground' : 'hover:text-foreground'}`}
					href="/{getDiscipline()}"
				>
					Quickstart
				</a>
				<span class="select-none text-border/60">·</span>
				<a
					class={`transition-colors ${isAdvancedRoute() ? 'text-foreground' : 'hover:text-foreground'}`}
					href="/{getDiscipline()}/advanced"
				>
					Advanced
				</a>
			</div>
		{/if}

		<!-- Primary tabs: disciplines -->
		<div
			class="flex items-center justify-between px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground"
		>
			<a
				class={`flex flex-col items-center gap-1 ${isActive('/') ? 'text-foreground' : 'hover:text-foreground'}`}
				href="/"
				aria-current={isActive('/') ? 'page' : undefined}
			>
				<span>Start</span>
				<span class={`h-1 w-1 rounded-full ${isActive('/') ? 'bg-primary' : 'bg-transparent'}`}
				></span>
			</a>
			<a
				class={`flex flex-col items-center gap-1 ${isSection('/rhythm') ? 'text-foreground' : 'hover:text-foreground'}`}
				href="/rhythm"
				aria-current={isSection('/rhythm') ? 'page' : undefined}
			>
				<span>Rhythm</span>
				<span
					class={`h-1 w-1 rounded-full ${isSection('/rhythm') ? 'bg-primary' : 'bg-transparent'}`}
				></span>
			</a>
			<a
				class={`flex flex-col items-center gap-1 ${isSection('/harmony') ? 'text-foreground' : 'hover:text-foreground'}`}
				href="/harmony"
				aria-current={isSection('/harmony') ? 'page' : undefined}
			>
				<span>Harmony</span>
				<span
					class={`h-1 w-1 rounded-full ${isSection('/harmony') ? 'bg-primary' : 'bg-transparent'}`}
				></span>
			</a>
			<a
				class={`flex flex-col items-center gap-1 ${isSection('/melody') ? 'text-foreground' : 'hover:text-foreground'}`}
				href="/melody"
				aria-current={isSection('/melody') ? 'page' : undefined}
			>
				<span>Melody</span>
				<span
					class={`h-1 w-1 rounded-full ${isSection('/melody') ? 'bg-primary' : 'bg-transparent'}`}
				></span>
			</a>
			<a
				class={`flex flex-col items-center gap-1 ${isSection('/progression') ? 'text-foreground' : 'hover:text-foreground'}`}
				href="/progression"
				aria-current={isSection('/progression') ? 'page' : undefined}
			>
				<span>Progression</span>
				<span
					class={`h-1 w-1 rounded-full ${isSection('/progression') ? 'bg-primary' : 'bg-transparent'}`}
				></span>
			</a>
		</div>
	</nav>
</div>
