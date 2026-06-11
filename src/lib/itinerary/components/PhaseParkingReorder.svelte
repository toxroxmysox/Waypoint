<script lang="ts">
	import { enhance } from '$app/forms';
	import { dndzone, SOURCES, TRIGGERS, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import type { Item } from '$lib/types';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import Card from '$lib/ui/Card.svelte';
	import { titleCase } from '$lib/shell/format';
	import { neighborsForMove, resolveDrop, type OrderedRef } from '$lib/itinerary/drag-reorder';

	// #88 — drag-reorder of a phase's parking-lot ideas, persisting `sort_order`.
	// Handle-only drag (a card tap opens item detail; the grip starts the drag).
	// The decision routes through resolveDrop (parking→parking → `reorder`) so this
	// surface and the day timeline share one source of truth for drag semantics.
	let {
		items,
		tripSlug
	}: {
		items: Item[];
		tripSlug: string;
	} = $props();

	const FLIP_MS = 150;

	// Working copy svelte-dnd-action mutates during a drag. Re-seed from server
	// truth whenever page data changes (after the reorder action invalidates load).
	let parkingItems = $state<Item[]>([]);
	$effect(() => {
		parkingItems = [...items];
	});
	function reseed() {
		queueMicrotask(() => {
			parkingItems = [...items];
		});
	}

	let dragDisabled = $state(true);

	let reorderForm = $state<HTMLFormElement | undefined>();
	let formItemId = $state('');
	let formBefore = $state('');
	let formAfter = $state('');

	const refs = (list: Item[]): OrderedRef[] =>
		list.map((i) => ({ id: i.id, sort_order: i.sort_order ?? 0 }));

	// A handle press unlocks the zone; svelte-dnd-action grabs the item under the
	// pointer. Re-locked after a pointer drag so a stray tap never starts one.
	function startDrag() {
		dragDisabled = false;
	}

	function submit(itemId: string, before: number | null, after: number | null) {
		formItemId = itemId;
		formBefore = before?.toString() ?? '';
		formAfter = after?.toString() ?? '';
		queueMicrotask(() => reorderForm?.requestSubmit());
	}

	function onConsider(e: CustomEvent<DndEvent<Item>>) {
		parkingItems = e.detail.items;
		// Keyboard drags re-lock on DRAG_STOPPED (pointer drags re-lock on finalize).
		if (e.detail.info.source === SOURCES.KEYBOARD && e.detail.info.trigger === TRIGGERS.DRAG_STOPPED) {
			dragDisabled = true;
		}
	}

	function onFinalize(e: CustomEvent<DndEvent<Item>>) {
		const next = e.detail.items;
		const movedId = e.detail.info.id;
		parkingItems = next;

		const moved = next.find((i) => i.id === movedId);
		if (moved) {
			const { before, after } = neighborsForMove(refs(next), movedId);
			const action = resolveDrop({
				source: 'parking',
				target: 'parking',
				item: { phase: moved.phase, start_time: moved.start_time },
				before,
				after,
				dayPhases: []
			});
			if (action.kind === 'reorder') {
				submit(movedId, action.before, action.after);
			} else {
				// No other action is reachable parking→parking, but stay defensive.
				reseed();
			}
		}
		if (e.detail.info.source === SOURCES.POINTER) dragDisabled = true;
	}

	function onHandlePointer(e: Event) {
		e.stopPropagation();
		e.preventDefault();
		startDrag();
	}
	function onHandleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') startDrag();
	}
</script>

<!-- Hidden form for the phase-detail `reorder` action. enhance() invalidates the
     load on success, which re-seeds the working copy from server truth. -->
<form bind:this={reorderForm} method="POST" action="?/reorder" use:enhance class="hidden">
	<input type="hidden" name="item_id" value={formItemId} />
	<input type="hidden" name="before_order" value={formBefore} />
	<input type="hidden" name="after_order" value={formAfter} />
</form>

<section
	class="space-y-1.5"
	use:dndzone={{ items: parkingItems, dragDisabled, type: 'phase-parking-item', flipDurationMs: FLIP_MS, dropTargetStyle: {} }}
	onconsider={onConsider}
	onfinalize={onFinalize}
>
	{#each parkingItems as item (item.id)}
		<div animate:flip={{ duration: FLIP_MS }} class="no-callout flex items-stretch gap-1">
			<!-- Drag handle (sibling of the link → starts a drag, never navigates). -->
			<button
				type="button"
				class="text-line flex shrink-0 touch-none cursor-grab items-center px-1"
				aria-label="Drag to reorder idea"
				onpointerdown={onHandlePointer}
				onmousedown={onHandlePointer}
				ontouchstart={onHandlePointer}
				onkeydown={onHandleKeydown}
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
					<circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
					<circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
				</svg>
			</button>

			<div class="min-w-0 flex-1">
				<Card href="/trips/{tripSlug}/items/{item.id}" class="no-callout">
					<div class="flex items-center gap-3 px-3 py-2">
						<TypeIcon type={item.type} sub={item.subtype} size={18} />
						<div class="min-w-0 flex-1">
							<p class="text-ink truncate text-sm" title={item.title}>{item.title}</p>
						</div>
						<span class="bg-paper text-ink-muted shrink-0 rounded px-1.5 py-0.5 text-[11px]">
							{titleCase(item.type)}
						</span>
					</div>
				</Card>
			</div>
		</div>
	{/each}
</section>
