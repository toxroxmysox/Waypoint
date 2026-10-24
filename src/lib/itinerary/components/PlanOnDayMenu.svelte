<script lang="ts" module>
	export interface PlannedIdea {
		itemId: string;
		dayLabel: string;
		prevDay: string;
		prevSortOrder: number;
	}
</script>

<script lang="ts">
	import { enhance } from '$app/forms';
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import { toast } from '$lib/shell/stores/toast';
	import type { DayMenuRow } from '$lib/itinerary/phase-logistics';

	// #401 — Do this → On which day? → planned. Two taps from an idea to a day.
	// One sheet per parking lot; the idea card's "Do this" pill opens it. It lives
	// outside the cards: a fixed sheet inside a card's z-10 layer could be covered.
	let {
		itemId,
		rows,
		open = $bindable(false),
		onPlanned
	}: {
		itemId: string;
		rows: DayMenuRow[];
		open: boolean;
		onPlanned: (p: PlannedIdea) => void;
	} = $props();

	let busy = $state(false);
</script>

<BottomSheet bind:open title="On which day?">
	<form
		method="POST"
		action="?/planIdea"
		use:enhance={() => {
			busy = true;
			return async ({ result, update }) => {
				busy = false;
				if (result.type === 'success' && result.data?.planned) {
					open = false;
					onPlanned(result.data.planned as PlannedIdea);
					await update();
				} else if (result.type === 'failure') {
					open = false;
					toast.show((result.data?.error as string) || "Couldn't plan that.", 'error');
				} else {
					await update();
				}
			};
		}}
		class="space-y-1 pb-2"
	>
		<input type="hidden" name="item_id" value={itemId} />
		{#each rows as row (row.dayId)}
			<button
				type="submit"
				name="day_id"
				value={row.dayId}
				disabled={busy}
				class="flex min-h-12 w-full items-center justify-between rounded-lg border border-line bg-surface px-4 text-left hover:bg-surface-2"
			>
				<span class="font-medium text-ink">
					{row.label}{#if row.travel}<span
							class="ml-1.5 text-xs text-ink-muted"
							aria-label="travel day">⇄</span
						>{/if}
				</span>
				<span class="text-sm text-ink-muted">{row.fullness}</span>
			</button>
		{/each}
	</form>
</BottomSheet>
