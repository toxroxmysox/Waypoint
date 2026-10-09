<script lang="ts">
	// Booking smart-list row (#50, adopted onto the Row in #433) — a projected lens
	// row. The square checkbox is the Row's LEADING action (left of the icon, 44px hit
	// area) and marks the source Item booked (write-through); the body is the Row
	// (16px glyph, title, `Thu Oct 1 · 6:30p · Place` sub-line) linking to the Item.
	// Trailing: the moss `Booked` confirmation once checked, else the chevron.
	import { enhance } from '$app/forms';
	import Row from '$lib/ui/Row.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import FlightSubLine from './FlightSubLine.svelte';
	import { rowTrailing, type FlightSub } from '$lib/itinerary/row';
	import type { ItemType } from '$lib/types';

	let {
		itemId,
		type,
		subtype = '',
		title,
		sub,
		flight = null,
		href,
		bookAction,
		pending = false,
		divider = true,
		onBook
	}: {
		itemId: string;
		type: ItemType;
		subtype?: string;
		title: string;
		sub: string;
		/** A flight's sub-line parts; the Row fits them to its width (arrival drops first). */
		flight?: FlightSub | null;
		href: string;
		bookAction: string;
		pending?: boolean;
		divider?: boolean;
		onBook?: () => void;
	} = $props();

	const trailingKind = $derived(rowTrailing({ chip: pending ? 'booked' : undefined }));
</script>

{#snippet leading()}
	<form
		method="POST"
		action={bookAction}
		class="flex"
		use:enhance={() => {
			onBook?.();
			return async ({ update }) => {
				await update();
			};
		}}
	>
		<input type="hidden" name="item_id" value={itemId} />
		<button
			type="submit"
			class="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center"
			aria-label="Mark booked"
			aria-pressed={pending}
		>
			<span
				class="flex h-[21px] w-[21px] items-center justify-center rounded-[5px] border-[1.5px] transition-colors
					{pending ? 'border-moss bg-moss text-paper' : 'border-line bg-surface'}"
			>
				{#if pending}
					<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
						<path d="M2.5 6.2l2.3 2.3L9.5 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				{/if}
			</span>
		</button>
	</form>
{/snippet}

{#snippet flightLine()}
	{#if flight}<FlightSubLine sub={flight} />{/if}
{/snippet}

{#snippet trailing()}
	{#if trailingKind === 'chip'}
		<Pill variant="booked" size="sm">Booked</Pill>
	{/if}
{/snippet}

<Row
	{type}
	{subtype}
	{title}
	{sub}
	subline={flight ? flightLine : undefined}
	{href}
	{leading}
	trailing={trailingKind === 'chip' ? trailing : undefined}
	strike={pending}
	dim={pending}
	{divider}
/>
