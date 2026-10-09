// #424 (spec §Ideas grouping, CARD_SYSTEM D7): the Parking Lot reads as a
// categorized list. The type moves off each card onto a group heading (icon +
// plural label) in a fixed order; inside a group ideas sort by the weighted vote
// score, ties by sort order. No DOM, no I/O: the surfaces (day page zone,
// desktop Ideas panel, Phase Detail) all render through these.
import { scoreVotes, sortByVoteScore, type DisplayVote } from '$lib/collaboration/voting';
import { cardMeta, type CardItemFields } from '$lib/itinerary/card-anatomy';
import type { ItemType } from '$lib/itinerary/types';

/** The six group types, in heading order. */
export type IdeaGroupType = 'lodging' | 'flight' | 'transportation' | 'activity' | 'meal' | 'note';

export const IDEA_GROUP_ORDER: IdeaGroupType[] = ['lodging', 'flight', 'transportation', 'activity', 'meal', 'note'];

export const IDEA_GROUP_LABEL: Record<IdeaGroupType, string> = {
	lodging: 'Lodging',
	flight: 'Flights',
	transportation: 'Transportation',
	activity: 'Activities',
	meal: 'Meals',
	note: 'Notes'
};

/** A type's group. Anything outside the six (the legacy `checklist`) folds into Notes. */
export function ideaGroupType(type: string): IdeaGroupType {
	return (IDEA_GROUP_ORDER as string[]).includes(type) ? (type as IdeaGroupType) : 'note';
}

export interface IdeaGroup<T> {
	type: IdeaGroupType;
	label: string;
	items: T[];
}

type Orderable = { id: string; sort_order: number };

/**
 * Bucket entries into the fixed group order (empty groups omitted) and sort each
 * bucket by `scoreById` desc, ties `sort_order` asc. `typeOf` reads an entry's
 * item type, so real items and ghosts (type in the payload) share this.
 */
export function ideaGroups<T extends Orderable>(
	entries: T[],
	typeOf: (e: T) => string,
	scoreById: Record<string, number> = {}
): IdeaGroup<T>[] {
	const buckets = new Map<IdeaGroupType, T[]>();
	for (const e of entries) {
		const g = ideaGroupType(typeOf(e));
		const list = buckets.get(g);
		if (list) list.push(e);
		else buckets.set(g, [e]);
	}
	return IDEA_GROUP_ORDER.filter((t) => buckets.has(t)).map((t) => ({
		type: t,
		label: IDEA_GROUP_LABEL[t],
		items: sortByVoteScore(buckets.get(t)!, scoreById)
	}));
}

/** The groups flattened: the order a flat, drag-bound list must hold. */
export function ideaDisplayOrder<T extends Orderable>(
	entries: T[],
	typeOf: (e: T) => string,
	scoreById: Record<string, number> = {}
): T[] {
	return ideaGroups(entries, typeOf, scoreById).flatMap((g) => g.items);
}

/**
 * For a flat list already in display order: id -> group type for the first idea
 * of each contiguous run. A heading renders inside that idea's drag wrapper
 * (svelte-dnd-action maps children 1:1 onto items, so a heading can't be a
 * sibling). Computed from the live array so it follows a drag in flight.
 */
export function ideaRunStarts<T extends { id: string }>(flat: T[], typeOf: (e: T) => string): Map<string, IdeaGroupType> {
	const starts = new Map<string, IdeaGroupType>();
	let prev: IdeaGroupType | null = null;
	for (const e of flat) {
		const g = ideaGroupType(typeOf(e));
		if (g !== prev) starts.set(e.id, g);
		prev = g;
	}
	return starts;
}

/** Weighted vote score per item id (2 / 1 / 0 / -2). Drives sort only; never shown. */
export function ideaScores(votesByItem: Record<string, DisplayVote[]>): Record<string, number> {
	const out: Record<string, number> = {};
	for (const [id, votes] of Object.entries(votesByItem)) out[id] = scoreVotes(votes);
	return out;
}

/** `$40`, `$1,250`, `$12.50`. */
function money(n: number): string {
	return `$${n.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/**
 * The idea card's sub-line: `place · cost` (`Sheboygan · $40`). The place is the
 * card meta (location; a flight's route; a note's first line). Empty parts are
 * omitted; '' when neither is known.
 */
export function ideaSub(item: Pick<CardItemFields, 'location_name' | 'description'> & { type: ItemType | string; cost_estimate_usd?: number }): string {
	const place = cardMeta(item as Pick<CardItemFields, 'type' | 'location_name' | 'description'>);
	const cost = (item.cost_estimate_usd ?? 0) > 0 ? money(item.cost_estimate_usd as number) : '';
	return [place, cost].filter(Boolean).join(' · ');
}
