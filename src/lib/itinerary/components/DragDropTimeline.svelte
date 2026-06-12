<script lang="ts">
	import { enhance } from '$app/forms';
	import { SOURCES, TRIGGERS, type DndEvent } from 'svelte-dnd-action';
	import type { Snippet } from 'svelte';
	import type { Item } from '$lib/types';
	import { buildTimelineFlat } from '$lib/itinerary/timeline';
	import { neighborsForMove, resolveDrop, type OrderedRef } from '$lib/itinerary/drag-reorder';

	interface ParkingZoneInput {
		phaseId: string;
		items: Item[];
	}

	interface ParkingZone {
		phaseId: string;
		items: Item[];
		dragDisabled: boolean;
		onConsider: (e: CustomEvent<DndEvent<Item>>) => void;
		onFinalize: (e: CustomEvent<DndEvent<Item>>) => void;
	}

	let {
		dayItems,
		parkingByPhase = [],
		dayPhaseIds = [],
		tripSlug,
		dayId,
		children
	}: {
		dayItems: Item[];
		/** One entry per phase the day belongs to (two on a boundary day). #87. */
		parkingByPhase?: ParkingZoneInput[];
		dayPhaseIds?: string[];
		tripSlug: string;
		dayId: string;
		children: Snippet<
			[
				{
					timelineItems: Item[];
					timelineDragDisabled: boolean;
					startDrag: () => void;
					pullUp: (itemId: string) => void;
					onTimelineConsider: (e: CustomEvent<DndEvent<Item>>) => void;
					onTimelineFinalize: (e: CustomEvent<DndEvent<Item>>) => void;
					/** One drop zone per phase — the day page renders a divider for each. */
					parkingZones: ParkingZone[];
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
	let parkingItemsByPhase = $state<Record<string, Item[]>>({});
	$effect(() => {
		timelineItems = ordered(dayItems);
	});
	$effect(() => {
		const next: Record<string, Item[]> = {};
		for (const zone of parkingByPhase) next[zone.phaseId] = [...zone.items];
		parkingItemsByPhase = next;
	});

	// Re-seed both surfaces to server truth (used for snapback / reject reverts).
	// queued so it wins the race against the other zone's finalize handler.
	function reseed() {
		queueMicrotask(() => {
			timelineItems = ordered(dayItems);
			const next: Record<string, Item[]> = {};
			for (const zone of parkingByPhase) next[zone.phaseId] = [...zone.items];
			parkingItemsByPhase = next;
		});
	}

	let timelineDragDisabled = $state(true);
	let parkingDragDisabled = $state(true);

	let reorderForm = $state<HTMLFormElement | undefined>();
	let pullForm = $state<HTMLFormElement | undefined>();
	let pushForm = $state<HTMLFormElement | undefined>();
	let parkingReorderForm = $state<HTMLFormElement | undefined>();

	let formItemId = $state('');
	let formBefore = $state('');
	let formAfter = $state('');
	let formParkingPhaseId = $state('');

	// A handle press enables every zone — svelte-dnd-action grabs whatever item is
	// under the pointer (which lives in exactly one zone).
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

	function onParkingConsider(phaseId: string, e: CustomEvent<DndEvent<Item>>) {
		parkingItemsByPhase[phaseId] = e.detail.items;
		reDisableOnKeyboardStop(e.detail.info);
	}

	function onParkingFinalize(phaseId: string, e: CustomEvent<DndEvent<Item>>) {
		const next = e.detail.items;
		const movedId = e.detail.info.id;
		parkingItemsByPhase[phaseId] = next;

		const landedHere = next.some((i) => i.id === movedId);
		if (landedHere) {
			const fromTimeline = dayItems.some((i) => i.id === movedId);
			const wasHere = (parkingByPhase.find((z) => z.phaseId === phaseId)?.items ?? []).some(
				(i) => i.id === movedId
			);
			const moved = next.find((i) => i.id === movedId);

			if (fromTimeline) {
				// Ejected from the timeline → park it (server strips the time).
				submit(pushForm, movedId, null, null);
			} else if (!wasHere && moved) {
				// Dragged in from ANOTHER phase's zone. Resolve against THIS zone's phase
				// only — a foreign-phase idea hits resolveDrop's `reject` branch (phase is
				// sticky), so it snaps back. This is the cross-phase reject made reachable
				// by splitting one zone into per-phase zones (#87).
				const action = resolveDrop({
					source: 'parking',
					target: 'timeline',
					item: { phase: moved.phase, start_time: moved.start_time },
					before: null,
					after: null,
					dayPhases: [phaseId]
				});
				if (action.kind === 'reject') reseed();
			} else if (moved) {
				// Same-zone reorder (#160): persist through the owning phase's Phase
				// Detail `reorder` action — the canonical idea-reorder home (#88) — so
				// its guard and phase-scoped rebalance are reused, never forked. The
				// zone holds the phase's full idea list, so neighbors here match what
				// that action's rebalance fetches.
				const { before, after } = neighborsForMove(refs(next), movedId);
				const action = resolveDrop({
					source: 'parking',
					target: 'parking',
					item: { phase: moved.phase, start_time: moved.start_time },
					before,
					after,
					dayPhases: [phaseId]
				});
				if (action.kind === 'reorder') {
					formParkingPhaseId = phaseId;
					submit(parkingReorderForm, movedId, action.before, action.after);
				} else {
					// No other action is reachable parking→parking, but stay defensive.
					reseed();
				}
			}
		}
		reDisable(e.detail.info.source);
	}

	const parkingZones = $derived<ParkingZone[]>(
		parkingByPhase.map((zone) => ({
			phaseId: zone.phaseId,
			items: parkingItemsByPhase[zone.phaseId] ?? [],
			dragDisabled: parkingDragDisabled,
			onConsider: (e: CustomEvent<DndEvent<Item>>) => onParkingConsider(zone.phaseId, e),
			onFinalize: (e: CustomEvent<DndEvent<Item>>) => onParkingFinalize(zone.phaseId, e)
		}))
	);
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
<!-- Parking→parking reorder posts cross-route to the zone's phase (#160) — the
     Phase Detail action guards (this phase, unplanned, day-less) and rebalances
     the phase's ideas; enhance still invalidates this page's load on success. -->
<form
	bind:this={parkingReorderForm}
	method="POST"
	action="/trips/{tripSlug}/phases/{formParkingPhaseId}?/reorder"
	use:enhance
	class="hidden"
>
	<input type="hidden" name="item_id" value={formItemId} />
	<input type="hidden" name="before_order" value={formBefore} />
	<input type="hidden" name="after_order" value={formAfter} />
</form>

{@render children({
	timelineItems,
	timelineDragDisabled,
	startDrag,
	pullUp,
	onTimelineConsider,
	onTimelineFinalize,
	parkingZones
})}
