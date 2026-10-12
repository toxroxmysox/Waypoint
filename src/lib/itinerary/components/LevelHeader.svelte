<script lang="ts" module>
	export interface LevelChip {
		label: string;
		href: string;
		sub?: string;
		/** Has planned items: renders a dot. */
		filled?: boolean;
		/** A Travel Day chip: dashed with ⇄. */
		travel?: boolean;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	// #401 — the Level Header: the same masthead at each rung of trip → phase → day.
	// Name, place, span (days · nights), notes, and chips one level down. With
	// `href` the identity block is one link; chips and notes keep their own targets.
	let {
		title,
		place = '',
		span,
		meta = '',
		href,
		chips = [],
		notes,
		actions,
		size = 'page'
	}: {
		title: string;
		place?: string;
		span: string;
		meta?: string;
		href?: string;
		chips?: LevelChip[];
		notes?: Snippet;
		actions?: Snippet;
		size?: 'page' | 'card';
	} = $props();

	const titleClass = $derived(
		size === 'page'
			? 'font-display text-ink text-xl leading-tight font-semibold'
			: 'font-display text-ink text-lg leading-tight font-semibold'
	);
</script>

{#snippet identity()}
	{#if size === 'page'}
		<h2 class={titleClass}>{title}</h2>
	{:else}
		<h3 class={titleClass}>{title}</h3>
	{/if}
	{#if place}
		<p class="text-ink-soft mt-0.5 text-sm">{place}</p>
	{/if}
	{#if span || meta}
		<p class="text-ink-muted mt-0.5 text-xs">
			{[span, meta].filter(Boolean).join(' · ')}
		</p>
	{/if}
{/snippet}

<header class="space-y-2">
	<div class="flex items-start gap-3">
		<div class="min-w-0 flex-1">
			{#if href}
				<a {href} class="-m-1 block rounded-md p-1 hover:bg-black/[0.03]" data-level-link>
					{@render identity()}
				</a>
			{:else}
				{@render identity()}
			{/if}
		</div>
		{#if actions}
			<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>
		{/if}
	</div>

	{#if notes}
		<div>{@render notes()}</div>
	{/if}

	{#if chips.length > 0}
		<nav aria-label="{title} — open" class="flex flex-wrap gap-1.5">
			{#each chips as chip (chip.href)}
				<a
					href={chip.href}
					class="text-ink-soft inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs font-medium
						{chip.travel ? 'border-line border-dashed' : 'border-line bg-surface'}"
				>
					{#if chip.travel}<span aria-hidden="true">⇄</span>{/if}
					<span>{chip.label}</span>
					{#if chip.sub}<span class="text-ink-muted">{chip.sub}</span>{/if}
					{#if chip.filled}
						<span class="bg-moss inline-block h-1.5 w-1.5 rounded-full" aria-label="has plans"></span>
					{/if}
				</a>
			{/each}
		</nav>
	{/if}
</header>
