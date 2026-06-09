<script lang="ts">
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import { goto } from '$app/navigation';

	let {
		open = $bindable(false),
		slug,
		todayDayId
	}: {
		open: boolean;
		slug: string;
		todayDayId: string | null;
	} = $props();

	function addItem() {
		open = false;
		const params = new URLSearchParams({ from: 'trip' });
		if (todayDayId) params.set('day', todayDayId);
		goto(`/trips/${slug}/items/new?${params.toString()}`);
	}

	function addExpense() {
		open = false;
		goto(`/trips/${slug}/expenses?action=add`);
	}

	function addDocument() {
		open = false;
		goto(`/trips/${slug}/documents?action=add`);
	}
</script>

<BottomSheet bind:open title="Add">
	<div class="space-y-2">
		<button
			type="button"
			class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-surface-2 transition-colors"
			onclick={addItem}
		>
			<div class="bg-clay-tint text-clay flex h-10 w-10 items-center justify-center rounded-full">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
				</svg>
			</div>
			<div>
				<p class="text-ink text-sm font-semibold">Add item to today</p>
				<p class="text-ink-muted text-xs">Activity, meal, transport, etc.</p>
			</div>
		</button>

		<button
			type="button"
			class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-surface-2 transition-colors"
			onclick={addExpense}
		>
			<div class="bg-clay-tint text-clay flex h-10 w-10 items-center justify-center rounded-full">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
				</svg>
			</div>
			<div>
				<p class="text-ink text-sm font-semibold">Add expense</p>
				<p class="text-ink-muted text-xs">Log a cost for this trip</p>
			</div>
		</button>

		<button
			type="button"
			class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-surface-2 transition-colors"
			onclick={addDocument}
		>
			<div class="bg-clay-tint text-clay flex h-10 w-10 items-center justify-center rounded-full">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<polyline points="14 2 14 8 20 8" />
				</svg>
			</div>
			<div>
				<p class="text-ink text-sm font-semibold">Add document</p>
				<p class="text-ink-muted text-xs">Attach a PDF or image</p>
			</div>
		</button>
	</div>
</BottomSheet>
