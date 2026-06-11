// Pure drag semantics for the day timeline + parking surfaces (#60).
// `resolveDrop` is the single source of truth: the Svelte components and the
// SvelteKit form actions are thin wrappers that call it and dispatch on `kind`.
// See docs/PHASE_REDESIGN_PRD.md §Modules and the plan's branch table.

export interface OrderedRef {
	id: string;
	sort_order: number;
}

/**
 * Given a flat list in its dropped display order, return the `sort_order`
 * values immediately before and after `movedId`. Feeds the `reorder` /
 * `pullToPlan` actions, which call `insertBetween(before, after)`.
 */
export function neighborsForMove(
	ordered: OrderedRef[],
	movedId: string
): { before: number | null; after: number | null } {
	const idx = ordered.findIndex((o) => o.id === movedId);
	if (idx === -1) return { before: null, after: null };
	const before = idx > 0 ? ordered[idx - 1].sort_order : null;
	const after = idx < ordered.length - 1 ? ordered[idx + 1].sort_order : null;
	return { before, after };
}

export type Zone = 'timeline' | 'parking';

export interface DropContext {
	/** Zone the item was dragged from. */
	source: Zone;
	/** Zone the item was dropped into. */
	target: Zone;
	/** The moved item — only the fields the decision depends on. */
	item: { phase: string; start_time: string };
	/** Neighbor `sort_order` at the drop position (from `neighborsForMove`). */
	before: number | null;
	after: number | null;
	/** Phase ids the TARGET day belongs to (one, or two on a boundary day). */
	dayPhases: string[];
}

export type DropAction =
	| { kind: 'reorder'; before: number | null; after: number | null }
	| { kind: 'pull'; before: number | null; after: number | null }
	| { kind: 'push' }
	| { kind: 'reject' }
	| { kind: 'snapback' };

/**
 * Map a completed drag to a domain action. Encodes every rule from the PRD:
 *
 * - timeline → parking : `push`     (eject → unschedule; server strips time)
 * - parking  → timeline: `pull`     when the idea's phase is among the day's
 *                                    phases, else `reject` (phase is sticky)
 * - timeline → timeline: `snapback` for a timed item (the clock pins it),
 *                                    `reorder` for an untimed item
 * - parking  → parking : `reorder`  (reorder ideas — UI persistence is #88)
 */
export function resolveDrop(ctx: DropContext): DropAction {
	const { source, target, item, before, after, dayPhases } = ctx;

	if (source === 'timeline' && target === 'parking') {
		return { kind: 'push' };
	}

	if (source === 'parking' && target === 'timeline') {
		if (!dayPhases.includes(item.phase)) return { kind: 'reject' };
		return { kind: 'pull', before, after };
	}

	if (source === 'timeline' && target === 'timeline') {
		if (item.start_time) return { kind: 'snapback' };
		return { kind: 'reorder', before, after };
	}

	// parking → parking
	return { kind: 'reorder', before, after };
}
