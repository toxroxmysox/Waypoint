<script lang="ts">
	// A Closeout item as a Row (#434; spec §Row, CARD_SYSTEM D11). #576: a pending row
	// carries three IDENTICAL bordered pills (👍 Recommend · 👎 Don't recommend · Didn't
	// do), each a 44px hit area. Rate mode (a closed trip) swaps them for two toggle
	// pills on done rows. The multi-day date adjust is kept as built (walk only).
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Row from '$lib/ui/Row.svelte';
	import InlineQuickAdd from '$lib/itinerary/components/InlineQuickAdd.svelte';
	import { formatDateRange } from '$lib/shell/format';
	import { itemDateRange } from '$lib/itinerary/multi-day';
	import { itemOutcome } from '$lib/itinerary/closeout-outcome';
	import { rowSub } from '$lib/itinerary/row';
	import type { Item, Day } from '$lib/types';

	let {
		item,
		tripId,
		dayId,
		phaseId,
		days = [],
		// #273 — clamp the trim-end picker to the trip end (an item can't extend past
		// the trip). Empty = dateless trip → no upper bound.
		tripEndDate = '',
		mode = 'walk'
	}: {
		item: Item;
		tripId: string;
		dayId: string;
		phaseId: string;
		days?: Day[];
		tripEndDate?: string;
		mode?: 'walk' | 'rate';
	} = $props();

	// 'asking' = Didn't do just posted: offer "Did something else instead?".
	let followUp = $state<'none' | 'asking' | 'replacing'>('none');
	let submitting = $state(false);
	let editingEnd = $state(false);

	const outcome = $derived(itemOutcome(item));
	const isPending = $derived(outcome === 'pending');
	const isDone = $derived(item.status === 'done');
	const range = $derived(mode === 'walk' ? itemDateRange(item, days) : null);

	// Same pill for all of them: bordered, ink, 44px tall.
	const pillBase =
		'inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-xs font-semibold disabled:opacity-40';
	const pill = `${pillBase} border-line bg-surface text-ink hover:bg-surface-2 active:bg-surface-2`;
	// Pressed toggle (rate mode): inverted so it reads as selected.
	const pillOn = `${pillBase} border-ink bg-ink text-paper`;

	const trailingText = $derived(
		outcome === 'recommend'
			? '👍'
			: outcome === 'not_recommend'
				? '👎'
				: outcome === 'didnt_do'
					? "Didn't do"
					: outcome === 'done_unrated'
						? 'Done'
						: ''
	);
	const showTrailing = $derived(!isPending && !(mode === 'rate' && isDone));
	const showBelow = $derived(
		isPending || !!range || followUp !== 'none' || (mode === 'rate' && isDone)
	);
</script>

{#snippet trailing()}
	<span class="text-xs font-medium text-ink-muted" data-testid="closeout-outcome"
		>{trailingText}</span
	>
{/snippet}

{#snippet pills()}
	{#if range}
		<div class="mb-1">
			<button
				type="button"
				onclick={() => (editingEnd = !editingEnd)}
				class="inline-flex min-h-11 items-center text-xs text-ink-muted hover:underline active:underline"
			>
				{formatDateRange(range.start, range.end)} · adjust
			</button>
			{#if editingEnd}
				<form
					method="POST"
					action="?/trimEnd"
					use:enhance={() => {
						return async ({ result, update }) => {
							if (result.type === 'success') editingEnd = false;
							await update();
						};
					}}
					class="flex items-center gap-1"
				>
					<input type="hidden" name="item_id" value={item.id} />
					<input
						type="date"
						name="end_date"
						value={range.end}
						min={range.start}
						max={tripEndDate || undefined}
						class="rounded border border-line bg-surface px-1.5 py-1 text-xs text-ink"
					/>
					<button
						type="submit"
						class="inline-flex min-h-11 items-center px-2 text-xs font-medium text-sky">Save</button
					>
				</form>
			{/if}
		</div>
	{/if}

	{#if followUp === 'replacing'}
		<div class="pr-3">
			<InlineQuickAdd
				{tripId}
				{dayId}
				{phaseId}
				originalItemId={item.id}
				onAdded={async () => {
					followUp = 'none';
					await invalidateAll();
				}}
				onCancel={() => (followUp = 'asking')}
			/>
		</div>
	{:else if followUp === 'asking'}
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-xs text-ink-muted">Did something else instead?</span>
			<button type="button" onclick={() => (followUp = 'replacing')} class={pill}>+ Add</button>
			<button type="button" onclick={() => (followUp = 'none')} class={pill}>No</button>
		</div>
	{:else if mode === 'walk' && isPending}
		<form
			method="POST"
			action="?/resolve"
			class="flex flex-wrap gap-2"
			use:enhance={({ submitter }) => {
				submitting = true;
				const didntDo = (submitter as HTMLButtonElement | null)?.value === 'didnt_do';
				return async ({ result, update }) => {
					submitting = false;
					if (result.type === 'success' && didntDo) followUp = 'asking';
					await update({ reset: false });
				};
			}}
		>
			<input type="hidden" name="item_id" value={item.id} />
			<button type="submit" name="outcome" value="recommend" disabled={submitting} class={pill}
				><span aria-hidden="true">👍</span> Recommend</button
			>
			<button type="submit" name="outcome" value="not_recommend" disabled={submitting} class={pill}
				><span aria-hidden="true">👎</span> Don't recommend</button
			>
			<button type="submit" name="outcome" value="didnt_do" disabled={submitting} class={pill}
				>Didn't do</button
			>
		</form>
	{:else if mode === 'rate' && isDone}
		<form
			method="POST"
			action="?/rate"
			class="flex flex-wrap gap-2"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					await update({ reset: false });
				};
			}}
		>
			<input type="hidden" name="item_id" value={item.id} />
			<!-- Tapping the pressed pill posts '' (clears). -->
			<button
				type="submit"
				name="rating"
				value={outcome === 'recommend' ? '' : 'recommend'}
				aria-pressed={outcome === 'recommend'}
				disabled={submitting}
				class={outcome === 'recommend' ? pillOn : pill}
				><span aria-hidden="true">👍</span> Recommend</button
			>
			<button
				type="submit"
				name="rating"
				value={outcome === 'not_recommend' ? '' : 'not_recommend'}
				aria-pressed={outcome === 'not_recommend'}
				disabled={submitting}
				class={outcome === 'not_recommend' ? pillOn : pill}
				><span aria-hidden="true">👎</span> Don't recommend</button
			>
		</form>
	{/if}
{/snippet}

<div data-testid="closeout-row" data-item-id={item.id} class="[&:last-child>div]:border-b-0">
	<Row
		type={item.type}
		subtype={item.subtype}
		title={item.title}
		sub={rowSub(item)}
		trailing={showTrailing ? trailing : undefined}
		strike={outcome === 'didnt_do'}
		dim={!isPending && followUp === 'none' && !(mode === 'rate' && isDone)}
		below={showBelow ? pills : undefined}
		class="px-3"
	/>
</div>
