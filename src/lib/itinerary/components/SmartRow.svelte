<script lang="ts">
	// Booking smart-list row (#50) — a projected, read-only lens row. Square
	// checkbox marks the source Item booked (write-through); TypeIcon tile +
	// title + mono meta line; "Open ›" links to the Item. No assignee/notes.
	// Translated from design/lists-checklists/source-jsx → SmartRow.
	import { enhance } from '$app/forms';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import type { ItemType } from '$lib/types';

	let {
		itemId,
		type,
		subtype = '',
		title,
		meta,
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
		meta: string;
		href: string;
		bookAction: string;
		pending?: boolean;
		divider?: boolean;
		onBook?: () => void;
	} = $props();
</script>

<div
	class="flex items-center gap-3 py-[13px] {divider ? 'border-line border-b' : ''} transition-opacity"
	style="opacity:{pending ? 0.4 : 1};"
>
	<form
		method="POST"
		action={bookAction}
		use:enhance={() => {
			onBook?.();
			return async ({ update }) => {
				await update();
			};
		}}
	>
		<input type="hidden" name="item_id" value={itemId} />
		<button type="submit" class="flex items-center" aria-label="Mark booked">
			<span
				class="flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors
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

	<TypeIcon {type} sub={subtype} size={34} />

	<div class="min-w-0 flex-1">
		<div class="text-ink truncate text-sm leading-tight font-semibold {pending ? 'line-through' : ''}">
			{title}
		</div>
		{#if meta}
			<div class="text-ink-muted mt-0.5 truncate font-mono text-[11px] tracking-tight">{meta}</div>
		{/if}
	</div>

	{#if pending}
		<Pill variant="booked" size="sm">Booked</Pill>
	{:else}
		<a {href} class="text-sky inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold">
			Open
			<svg width="13" height="13" viewBox="0 0 20 20" fill="none">
				<path d="M8 5l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</a>
	{/if}
</div>
