<script lang="ts">
	import { enhance } from '$app/forms';
	import { SOURCES, TRIGGERS, type DndEvent } from 'svelte-dnd-action';
	import type { Snippet } from 'svelte';
	import type { Item } from '$lib/types';
	import { buildTimelineFlat } from '$lib/itinerary/timeline';
	import { neighborsForMove, resolveDrop, type OrderedRef } from '$lib/itinerary/drag-reorder';

	let {
		dayItems,
		parkingLotItems = [],
		dayPhaseIds = [],
		tripSlug,
		dayId,
		children
	}: {
		dayItems: Item[];
		parkingLotItems?: Item[];
		dayPhaseIds?: string[];
		tripSlug: string;
		dayId: string;
		children: Snippet<
			[
				{
					timelineItems: Item[];
					parkingItems: Item[];
					timelineDragDisabled: boolean;
					parkingDragDisabled: boolean;
					startDrag: () => void;
					pullUp: (itemId: string) => void;
					onTimelineConsider: (e: CustomEvent<DndEvent<Item>>) => void;
					onTimelineFinalize: (e: CustomEvent<DndEvent<Item>>) => void;
					onParkingConsider: (e: CustomEvent<DndEvent<Item>>) => void;
					onParkingFinalize: (e: CustomEvent<DndEvent<Item>>) => void;
				}
			]
		>;
	} = $props();

	// Timeline binds the flat DISPLAY order (timed pinned, untimed by sort_order).
	const ordered = (items: Item[]) => buildTimelineFlat(items).map((e) => e.item);
	const refs = (items: Item[]): OrderedRef[] =>
		items.map((i) => ({ id: i.id, sort_order: i.sort_order ?? 0 }));

	// Working copies svelte-dnd-action mutates during a drag. Re-seed from server
	// truth whenever page data changes (after a form action invalidates the load).
	let timelineItems = $state<Item[]>([]);
	let parkingItems = $state<Item[]>([]);
	$effect(() => {
		timelineItems = ordered(dayItems);
	});
	$effect(() => {
		parkingItems = [...parkingLotItems];
	});

	// Re-seed both zones to server truth (used for snapback / reject reverts).
	// queued so it wins the race against the other zone's finalize handler.
	function reseed() {
		queueMicrotask(() => {
			timelineItems = ordered(dayItems);
			parkingItems = [...parkingLotItems];
		});
	}

	let timelineDragDisabled = $state(true);
	let parkingDragDisabled = $state(true);

	let reorderForm = $state<HTMLFormElement | undefined>();
	let pullForm = $state<HTMLFormElement | undefined>();
	let pushForm = $state<HTMLFormElement | undefined>();

	let formItemId = $state('');
	let formBefore = $state('');
	let formAfter = $state('');

	// A handle press enables BOTH zones — svelte-dnd-action grabs whatever item
	// is under the pointer (which lives in exactly one zone).
	function startDrag() {
		timelineDragDisabled = false;
		parkingDragDisabled = false;
	}

	// Tap-to-plan: the parking card's pull-up chevron schedules an idea without a
	// drag (appends to the day tail — pullToPlan treats null/null neighbors as append).
	function pullUp(itemId: string) {
		submit(pullForm, itemId, null, null);
	}

	// Re-lock after a POINTER drag so a stray tap never starts a drag. Keyboard
	// drags re-lock on DRAG_STOPPED (handled in the consider handlers).
	function reDisable(source: DndEvent<Item>['info']['source']) {
		if (source === SOURCES.POINTER) {
			timelineDragDisabled = true;
			parkingDragDisabled = true;
		}
	}

	function submit(form: HTMLFormElement | undefined, itemId: string, before: number | null, after: number | null) {
		formItemId = itemId;
		formBefore = before?.toString() ?? '';
		formAfter = after?.toString() ?? '';
		queueMicrotask(() => form?.requestSubmit());
	}

	function reDisableOnKeyboardStop(info: DndEvent<Item>['info']) {
		if (info.source === SOURCES.KEYBOARD && info.trigger === TRIGGERS.DRAG_STOPPED) {
			timelineDragDisabled = true;
			parkingDragDisabled = true;
		}
	}

	function onTimelineConsider(e: CustomEvent<DndEvent<Item>>) {
		timelineItems = e.detail.items;
		reDisableOnKeyboardStop(e.detail.info);
	}

	function onTimelineFinalize(e: CustomEvent<DndEvent<Item>>) {
		const next = e.detail.items;
		const movedId = e.detail.info.id;
		timelineItems = next;

		const moved = next.find((i) => i.id === movedId);
		if (moved) {
			const wasInTimeline = dayItems.some((i) => i.id === movedId);
			const { before, after } = neighborsForMove(refs(next), movedId);
			const action = resolveDrop({
				source: wasInTimeline ? 'timeline' : 'parking',
				target: 'timeline',
				item: { phase: moved.phase, start_time: moved.start_time },
				before,
				after,
				dayPhases: dayPhaseIds
			});
			switch (action.kind) {
				case 'reorder':
					submit(reorderForm, movedId, action.before, action.after);
					break;
				case 'pull':
					submit(pullForm, movedId, action.before, action.after);
					break;
				case 'snapback':
				case 'reject':
					reseed();
					break;
			}
		}
		reDisable(e.detail.info.source);
	}

	function onParkingConsider(e: CustomEvent<DndEvent<Item>>) {
		parkingItems = e.detail.items;
		reDisableOnKeyboardStop(e.detail.info);
	}

	function onParkingFinalize(e: CustomEvent<DndEvent<Item>>) {
		const next = e.detail.items;
		const movedId = e.detail.info.id;
		parkingItems = next;

		const wasInParking = parkingLotItems.some((i) => i.id === movedId);
		const nowInParking = next.some((i) => i.id === movedId);
		if (nowInParking && !wasInParking) {
			// Ejected from the timeline → park it (server strips the time).
			submit(pushForm, movedId, null, null);
		}
		// Parking-internal reorder (wasInParking && nowInParking) is visual-only in
		// this slice; persistence is the Phase Detail reorder home (#88).
		reDisable(e.detail.info.source);
	}
</script>

<!-- Hidden forms for the existing server actions. enhance() invalidates the load
     on success, which re-seeds the working copies from server truth. -->
<form bind:this={reorderForm} method="POST" action="?/reorder" use:enhance class="hidden">
	<input type="hidden" name="item_id" value={formItemId} />
	<input type="hidden" name="before_order" value={formBefore} />
	<input type="hidden" name="after_order" value={formAfter} />
</form>
<form bind:this={pullForm} method="POST" action="?/pullToPlan" use:enhance class="hidden">
	<input type="hidden" name="item_id" value={formItemId} />
	<input type="hidden" name="before_order" value={formBefore} />
	<input type="hidden" name="after_order" value={formAfter} />
</form>
<form bind:this={pushForm} method="POST" action="?/pushToParking" use:enhance class="hidden">
	<input type="hidden" name="item_id" value={formItemId} />
</form>

{@render children({
	timelineItems,
	parkingItems,
	timelineDragDisabled,
	parkingDragDisabled,
	startDrag,
	pullUp,
	onTimelineConsider,
	onTimelineFinalize,
	onParkingConsider,
	onParkingFinalize
})}
