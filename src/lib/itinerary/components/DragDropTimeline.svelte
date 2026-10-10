<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { toast } from '$lib/shell/stores/toast';
	import { onMount } from 'svelte';
	import { dayRail } from '$lib/itinerary/day-rail.svelte';
	import { canPlanOnDay } from '$lib/itinerary/drag-to-plan';
	import { TRIGGERS, type DndEvent } from 'svelte-dnd-action';
	import type { Snippet } from 'svelte';
	import type { Item } from '$lib/types';
	import { buildTimelineFlat } from '$lib/itinerary/timeline';
	import { neighborsForMove, resolveDrop, type OrderedRef } from '$lib/itinerary/drag-reorder';
	import { ideaDisplayOrder } from '$lib/itinerary/idea-groups';

	interface ParkingZoneInput {
		phaseId: string;
		items: Item[];
	}

	// #424: a parking zone binds its ideas in DISPLAY order (type groups, then vote
	// score), so the headings the zone renders line up with the dnd children.
	const ideaOrder = (items: Item[]) => ideaDisplayOrder(items, (i) => i.type, scoreById);

	interface ParkingZone {
		phaseId: string;
		items: Item[];
		/** A drag is in flight anywhere on the day (grows the collapsed drop strip). */
		dragActive: boolean;
		onConsider: (e: CustomEvent<DndEvent<Item>>) => void;
		onFinalize: (e: CustomEvent<DndEvent<Item>>) => void;
	}

	let {
		dayItems,
		parkingByPhase = [],
		dayPhaseIds = [],
		scoreById = {},
		tripSlug,
		dayId,
		canArrange = true,
		canPullUp = () => true,
		children
	}: {
		dayItems: Item[];
		/** One entry per phase the day belongs to (two on a boundary day). #87. */
		parkingByPhase?: ParkingZoneInput[];
		dayPhaseIds?: string[];
		/** Weighted vote score per idea id: orders ideas within each type group. */
		scoreById?: Record<string, number>;
		tripSlug: string;
		dayId: string;
		/**
		 * #499 — may the viewer rearrange the day? A drag rebalances EVERY day item's
		 * sort_order, which items.pb.js only allows an owner/co_owner. False disables
		 * drag on the timeline and the parking zones.
		 */
		canArrange?: boolean;
		/** #499 — per idea: may the viewer tap-to-plan it (itemPermissions.canMove)? */
		canPullUp?: (item: Item) => boolean;
		children: Snippet<
			[
				{
					timelineItems: Item[];
					pullUp: (itemId: string) => void;
					onTimelineConsider: (e: CustomEvent<DndEvent<Item>>) => void;
					onTimelineFinalize: (e: CustomEvent<DndEvent<Item>>) => void;
					/** One drop zone per phase — the day page renders a divider for each. */
					parkingZones: ParkingZone[];
					/** An idea that this day accepts is in flight: the timeline offers itself as a drop target (#445). */
					planDrop: boolean;
					/** #499 — the viewer can't rearrange: render cards, but no drag. */
					dragDisabled: boolean;
					canPullUp: (item: Item) => boolean;
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
		for (const zone of parkingByPhase) next[zone.phaseId] = ideaOrder(zone.items);
		parkingItemsByPhase = next;
	});

	// #499 — a refused move used to leave the card where it was dropped, silently,
	// until reload: enhance doesn't invalidate on failure. Snap back and say so.
	const revertOnFailure: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'failure' || result.type === 'error') {
				reseed();
				toast.show("Couldn't move that. Reload the page and try again.", 'error');
				return;
			}
			await update();
		};
	};

	// Re-seed both surfaces to server truth (used for snapback / reject reverts).
	// queued so it wins the race against the other zone's finalize handler.
	function reseed() {
		queueMicrotask(() => {
			timelineItems = ordered(dayItems);
			const next: Record<string, Item[]> = {};
			for (const zone of parkingByPhase) next[zone.phaseId] = ideaOrder(zone.items);
			parkingItemsByPhase = next;
		});
	}

	// #424: every zone arms itself (whole-card long-press / immediate mouse drag),
	// so there is no handle to unlock. This only tells the collapsed parking strip a
	// drag is in flight, so it grows into an easier drop target (#294).
	let dragActive = $state(false);

	let reorderForm = $state<HTMLFormElement | undefined>();
	let pullForm = $state<HTMLFormElement | undefined>();
	let pushForm = $state<HTMLFormElement | undefined>();

	let formItemId = $state('');
	// Full resulting timeline display order (comma-joined ids) for the whole-day
	// rebalance on the `reorder`/`pullToPlan` actions (#237).
	let formOrder = $state('');

	// Tap-to-plan: the parking card's pull-up chevron schedules an idea without a
	// drag (appends to the day tail — pullToPlan treats null/null neighbors as append).
	function pullUp(itemId: string) {
		submit(pullForm, itemId, null, null);
	}

	function submit(
		form: HTMLFormElement | undefined,
		itemId: string,
		before: number | null,
		after: number | null,
		order: string[] | null = null
	) {
		formItemId = itemId;
		formOrder = order?.join(',') ?? '';
		queueMicrotask(() => form?.requestSubmit());
	}

	// A drag (any zone, any input) starts the strip growing; finalize or a keyboard
	// stop ends it.
	function trackDrag(info: DndEvent<Item>['info']) {
		if (info.trigger === TRIGGERS.DRAG_STARTED) {
			dragActive = true;
			const idea = parkingByPhase.flatMap((z) => z.items).find((i) => i.id === info.id);
			draggingIdeaPhase = idea ? idea.phase : null;
		} else if (info.trigger === TRIGGERS.DRAG_STOPPED) {
			dragActive = false;
			draggingIdeaPhase = null;
		}
	}

	// #445: phase of the idea being dragged (null when a day item, or nothing, is).
	let draggingIdeaPhase = $state<string | null>(null);
	const planDrop = $derived(draggingIdeaPhase !== null && canPlanOnDay(draggingIdeaPhase, dayPhaseIds));

	function onTimelineConsider(e: CustomEvent<DndEvent<Item>>) {
		timelineItems = e.detail.items;
		trackDrag(e.detail.info);
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
			// The full resulting display order drives the whole-day sort_order
			// rebalance (#237) so an untimed item sticks anywhere — between/below
			// timed items — instead of re-weaving back to the top.
			const order = next.map((i) => i.id);
			switch (action.kind) {
				case 'reorder':
					submit(reorderForm, movedId, action.before, action.after, order);
					break;
				case 'pull':
					submit(pullForm, movedId, action.before, action.after, order);
					break;
				case 'snapback':
				case 'reject':
					reseed();
					break;
			}
		}
		dragActive = false;
		draggingIdeaPhase = null;
	}

	function onParkingConsider(phaseId: string, e: CustomEvent<DndEvent<Item>>) {
		parkingItemsByPhase[phaseId] = e.detail.items;
		trackDrag(e.detail.info);
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
				// Same-zone drop (#424): dragging among ideas changes nothing. The
				// order is the vote order (type group, then score), so snap back to
				// server truth instead of persisting a hand sort (retires #160's
				// parking reorder post).
				reseed();
			}
		}
		dragActive = false;
		draggingIdeaPhase = null;
	}

	const parkingZones = $derived<ParkingZone[]>(
		parkingByPhase.map((zone) => ({
			phaseId: zone.phaseId,
			items: parkingItemsByPhase[zone.phaseId] ?? [],
			dragActive,
			onConsider: (e: CustomEvent<DndEvent<Item>>) => onParkingConsider(zone.phaseId, e),
			onFinalize: (e: CustomEvent<DndEvent<Item>>) => onParkingFinalize(zone.phaseId, e)
		}))
	);

	// #445: the desktop context rail hosts the day's ideas as a drag source. Only the
	// instance in the desktop tree publishes (AppShell renders the page twice).
	onMount(() => {
		if (!reorderForm?.closest('[data-shell="desktop"]')) return;
		const mine = () => ({ zones: parkingZones, pullUp, dragDisabled: !canArrange, canPullUp });
		dayRail.get = mine;
		return () => {
			if (dayRail.get === mine) dayRail.get = null;
		};
	});
</script>

<!-- Hidden forms for the existing server actions. enhance() invalidates the load
     on success, which re-seeds the working copies from server truth. -->
<!-- reorder/pullToPlan rebalance the WHOLE day to the resulting display order
     (#237) — `order` is the comma-joined item ids; an empty `order` on pull means
     tap-to-plan (append to the tail). -->
<form bind:this={reorderForm} method="POST" action="?/reorder" use:enhance={revertOnFailure} class="hidden">
	<input type="hidden" name="item_id" value={formItemId} />
	<input type="hidden" name="order" value={formOrder} />
</form>
<form bind:this={pullForm} method="POST" action="?/pullToPlan" use:enhance={revertOnFailure} class="hidden">
	<input type="hidden" name="item_id" value={formItemId} />
	<input type="hidden" name="order" value={formOrder} />
</form>
<form bind:this={pushForm} method="POST" action="?/pushToParking" use:enhance={revertOnFailure} class="hidden">
	<input type="hidden" name="item_id" value={formItemId} />
</form>

{@render children({
	timelineItems,
	pullUp,
	onTimelineConsider,
	onTimelineFinalize,
	parkingZones,
	planDrop,
	dragDisabled: !canArrange,
	canPullUp
})}
