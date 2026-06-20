<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Item } from '$lib/types';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import { titleCase } from '$lib/shell/format';

	let {
		item,
		slug = '',
		isNext = false,
		// #246 Door 2 — skip affordance. Shown only for owner/co_owner (canSkip);
		// posts ?/skipItem on the host route (the merged Now). onSkipped lets the
		// page open the ideas strip at the freed gap.
		canSkip = false,
		skipAction = '?/skipItem',
		onSkipped = () => {}
	}: {
		item: Item;
		slug?: string;
		isNext?: boolean;
		canSkip?: boolean;
		skipAction?: string;
		onSkipped?: () => void;
	} = $props();

	let menuOpen = $state(false);
	let skipping = $state(false);

	function formatTime(t: string): string {
		if (!t) return '';
		const timePart = t.includes('T') ? t.split('T')[1] : t.includes(' ') ? t.split(' ')[1] : t;
		const [h, m] = timePart.split(':');
		const hour = parseInt(h, 10);
		const ampm = hour >= 12 ? 'PM' : 'AM';
		const h12 = hour % 12 || 12;
		return `${h12}:${m} ${ampm}`;
	}
</script>

<!-- #231 stretched-link pattern: a bordered container with a full-card <a> so the
     card is tappable, while the skip overflow button stays a real sibling button
     (a <button> nested in an <a> is invalid HTML). The overflow sits above the
     stretched link via z-index. -->
<div
	class="relative rounded-xl border p-4 transition-colors
		{isNext ? 'border-clay bg-clay/5 shadow-sm' : 'border-line bg-paper hover:border-ink-muted'}"
>
	<a
		href="/trips/{slug}/items/{item.id}?from=trip"
		class="absolute inset-0 z-0 rounded-xl"
		aria-label={item.title}
	></a>

	<div class="pointer-events-none relative flex items-start gap-4">
		<TypeIcon type={item.type} sub={item.subtype} size={44} />
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-1.5">
				{#if item.start_time}
					<span class="font-mono text-ink text-base font-semibold">
						{formatTime(item.start_time)}
					</span>
				{/if}
				{#if isNext}
					<Pill variant="trip" size="sm">Up next</Pill>
				{/if}
				{#if item.booked}
					<Pill variant="booked" size="sm">Booked</Pill>
				{/if}
			</div>
			<h3 class="text-ink mt-1 text-lg leading-snug font-semibold">{item.title}</h3>
			{#if item.location_name}
				<p class="text-ink-muted mt-1 text-sm">{item.location_name}</p>
			{/if}
			{#if item.subtype}
				<p class="text-ink-muted mt-1 text-[11px] uppercase tracking-wide">{titleCase(item.subtype)}</p>
			{/if}
		</div>

		{#if canSkip}
			<!-- Overflow → skip. Real button above the stretched link (z-10 + pointer
			     events re-enabled). Tapping toggles a tiny inline confirm. -->
			<div class="pointer-events-auto relative z-10 shrink-0">
				<button
					type="button"
					onclick={() => (menuOpen = !menuOpen)}
					aria-haspopup="menu"
					aria-expanded={menuOpen}
					aria-label="Item actions"
					class="text-ink-muted hover:text-ink hover:bg-surface-2 -mr-1 -mt-1 rounded-md px-2 py-1 text-lg leading-none"
				>
					⋯
				</button>
				{#if menuOpen}
					<div
						role="menu"
						class="border-line bg-paper absolute right-0 z-20 mt-1 w-40 rounded-lg border p-1 shadow-lg"
					>
						<form
							method="POST"
							action={skipAction}
							use:enhance={() => {
								skipping = true;
								return async ({ result, update }) => {
									// reset:false re-runs load() (the feed + ideas re-derive)
									// WITHOUT remounting → never window.location.reload (wipes $state).
									await update({ reset: false });
									skipping = false;
									menuOpen = false;
									if (result.type === 'success') onSkipped();
								};
							}}
						>
							<input type="hidden" name="item_id" value={item.id} />
							<button
								type="submit"
								role="menuitem"
								disabled={skipping}
								class="text-ink hover:bg-surface-2 w-full rounded-md px-3 py-2 text-left text-sm font-medium disabled:opacity-50"
							>
								{skipping ? 'Skipping…' : 'Skip — not happening'}
							</button>
							<p class="text-ink-muted px-3 py-1 text-[11px] leading-tight">
								Returns to ideas; promote it back anytime.
							</p>
						</form>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	{#if item.confirmation_codes?.length > 0}
		<div class="pointer-events-none relative mt-3 space-y-1">
			{#each item.confirmation_codes as code}
				<div class="bg-surface-2 flex items-center justify-between rounded px-3 py-1.5">
					<span class="text-ink-muted text-xs uppercase tracking-wide">{code.label}</span>
					<span class="font-mono text-ink text-sm font-semibold">{code.value}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>
