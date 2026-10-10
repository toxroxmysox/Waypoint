// #445 — the day page's parking zones, handed to the desktop context rail. The rail
// lives in AppShell, outside the page, but the dnd handlers (and the working copies
// svelte-dnd-action mutates mid-drag) belong to DragDropTimeline. It publishes a
// getter here; the rail calls it inside its template, so every consider/finalize
// re-renders the rail without an effect hop.
import type { DndEvent } from 'svelte-dnd-action';
import type { Item } from '$lib/types';

export interface RailZone {
	phaseId: string;
	items: Item[];
	dragActive: boolean;
	onConsider: (e: CustomEvent<DndEvent<Item>>) => void;
	onFinalize: (e: CustomEvent<DndEvent<Item>>) => void;
}

export interface DayRailBundle {
	zones: RailZone[];
	pullUp: (itemId: string) => void;
	/** #499 — the viewer can't rearrange the day. */
	dragDisabled: boolean;
	canPullUp: (item: Item) => boolean;
}

export const dayRail = $state<{ get: (() => DayRailBundle) | null }>({ get: null });
