<script lang="ts">
	// The Row (#433; spec §Row, CARD_SYSTEM D1/D11): the one two-line shape for every
	// list where an item is a reference. A 16px bare glyph on the left, the title as
	// the headline, a sub-line (time and place, or date) in the text grammar, and ONE
	// trailing value (`trailing`: a chip, a cost, people bubbles; the chevron when
	// omitted and the row links).
	//   leading  — a leading action (the booking list's checkbox) sits LEFT of the icon
	//              and shifts the row right. It owns its 44px hit area.
	//   sub      — plain sub-line text; `subline` replaces it (flights fit their own).
	//   href     — the body is one 44px+ link; without it the body is a plain block.
	//   strike / dim — an optimistic "done" state: struck title, faded row.
	// The surface picks the trailing value with `rowTrailing()` (itinerary/row.ts).
	import type { Snippet } from 'svelte';
	import type { ItemType } from '$lib/types';
	import MonoTypeIcon from './MonoTypeIcon.svelte';
	import RowChevron from './RowChevron.svelte';

	let {
		type,
		subtype,
		title,
		sub = '',
		subline,
		href,
		leading,
		trailing,
		strike = false,
		dim = false,
		divider = true,
		class: klass = ''
	}: {
		type: ItemType;
		subtype?: string;
		title: string;
		sub?: string;
		subline?: Snippet;
		href?: string;
		leading?: Snippet;
		trailing?: Snippet;
		strike?: boolean;
		dim?: boolean;
		divider?: boolean;
		class?: string;
	} = $props();
</script>

{#snippet body()}
	<MonoTypeIcon {type} sub={subtype} size={16} />
	<span class="min-w-0 flex-1">
		<span class="text-ink block truncate text-sm leading-tight font-semibold {strike ? 'line-through' : ''}" data-row-title>{title}</span>
		{#if subline}
			<span class="text-ink-muted mt-0.5 block text-xs leading-snug" data-row-sub>{@render subline()}</span>
		{:else if sub}
			<span class="text-ink-muted mt-0.5 block truncate text-xs leading-snug" data-row-sub>{sub}</span>
		{/if}
	</span>
	{#if trailing}
		<span class="flex shrink-0 items-center" data-row-trailing>{@render trailing()}</span>
	{:else if href}
		<RowChevron />
	{/if}
{/snippet}

<div
	class="flex items-stretch transition-opacity {divider ? 'border-line border-b' : ''} {klass}"
	style="opacity:{dim ? 0.4 : 1};"
	data-row
>
	{#if leading}{@render leading()}{/if}
	{#if href}
		<a {href} class="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2.5">{@render body()}</a>
	{:else}
		<div class="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2.5">{@render body()}</div>
	{/if}
</div>
