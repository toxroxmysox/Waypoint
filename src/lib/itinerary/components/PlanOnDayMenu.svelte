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
	let {
		itemId,
		rows,
		onPlanned
	}: {
		itemId: string;
		rows: DayMenuRow[];
		onPlanned: (p: PlannedIdea) => void;
	} = $props();

	let open = $state(false);
	let busy = $state(false);
</script>

<button
	type="button"
	onclick={() => (open = true)}
	class="text-moss hover:bg-moss-tint min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold"
>
	Do this
</button>

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
				class="border-line bg-surface hover:bg-surface-2 flex min-h-12 w-full items-center justify-between rounded-lg border px-4 text-left"
			>
				<span class="text-ink font-medium">
					{row.label}{#if row.travel}<span class="text-ink-muted ml-1.5 text-xs" aria-label="travel day">⇄</span>{/if}
				</span>
				<span class="text-ink-muted text-sm">{row.fullness}</span>
			</button>
		{/each}
	</form>
</BottomSheet>
