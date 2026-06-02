<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Snippet } from 'svelte';
	import type { Item } from '$lib/types';

	let {
		dayItems,
		parkingLotItems = [],
		tripSlug,
		dayId,
		children,
	}: {
		dayItems: Item[];
		parkingLotItems?: Item[];
		tripSlug: string;
		dayId: string;
		children: Snippet<[{
			draggedItemId: string | null;
			onDragStart: (itemId: string) => void;
			onDragOver: (beforeOrder: number | null, afterOrder: number | null) => void;
			onDropTimeline: () => void;
			onDropParking: () => void;
			onDragEnd: () => void;
		}]>;
	} = $props();

	let draggedItemId = $state<string | null>(null);
	let dropTarget = $state<{ before: number | null; after: number | null } | null>(null);

	let reorderForm = $state<HTMLFormElement | undefined>(undefined);
	let pullForm = $state<HTMLFormElement | undefined>(undefined);
	let pushForm = $state<HTMLFormElement | undefined>(undefined);

	function handleDragStart(itemId: string) {
		draggedItemId = itemId;
	}

	function handleDragOver(beforeOrder: number | null, afterOrder: number | null) {
		dropTarget = { before: beforeOrder, after: afterOrder };
	}

	function handleDropOnTimeline() {
		if (!draggedItemId) return;
		const isParkingItem = parkingLotItems.some((i) => i.id === draggedItemId);
		setTimeout(() => {
			if (isParkingItem) pullForm?.requestSubmit();
			else reorderForm?.requestSubmit();
			reset();
		}, 0);
	}

	function handleDropOnParking() {
		if (!draggedItemId) return;
		setTimeout(() => {
			pushForm?.requestSubmit();
			reset();
		}, 0);
	}

	function reset() {
		draggedItemId = null;
		dropTarget = null;
	}
</script>

<!-- Hidden forms for server actions -->
<form bind:this={reorderForm} method="POST" action="?/reorder" use:enhance class="hidden">
	<input type="hidden" name="item_id" value={draggedItemId ?? ''} />
	<input type="hidden" name="before_order" value={dropTarget?.before?.toString() ?? ''} />
	<input type="hidden" name="after_order" value={dropTarget?.after?.toString() ?? ''} />
</form>

<form bind:this={pullForm} method="POST" action="?/pullToPlan" use:enhance class="hidden">
	<input type="hidden" name="item_id" value={draggedItemId ?? ''} />
</form>

<form bind:this={pushForm} method="POST" action="?/pushToParking" use:enhance class="hidden">
	<input type="hidden" name="item_id" value={draggedItemId ?? ''} />
</form>

{@render children({
	draggedItemId,
	onDragStart: handleDragStart,
	onDragOver: handleDragOver,
	onDropTimeline: handleDropOnTimeline,
	onDropParking: handleDropOnParking,
	onDragEnd: reset,
})}
