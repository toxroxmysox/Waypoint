import type { ItemType } from '$lib/types';
import type { ConfirmationCode } from '$lib/itinerary/types';
import type { DocumentView } from './types';

// Aggregate grouping for the Trip Documents view (#71): the Trip-level group
// first, then item-type groups in a fixed order. Empty groups are omitted.
// Within a group, input order is preserved (callers pass newest-first).

export type DocumentGroupKey = 'trip' | ItemType;

export interface DocumentGroup {
	key: DocumentGroupKey;
	label: string;
	// The item type for the round badge; undefined for the Trip-level group.
	type?: ItemType;
	docs: DocumentView[];
}

// Item-type render order + plural labels (PRD: Lodging, Flights, Transportation,
// Activities, Meals, Notes). `checklist` is unusual as a document parent but kept
// last so nothing is silently dropped.
const TYPE_ORDER: { type: ItemType; label: string }[] = [
	{ type: 'lodging', label: 'Lodging' },
	{ type: 'flight', label: 'Flights' },
	{ type: 'transportation', label: 'Transportation' },
	{ type: 'activity', label: 'Activities' },
	{ type: 'meal', label: 'Meals' },
	{ type: 'note', label: 'Notes' },
	{ type: 'checklist', label: 'Checklists' }
];

/** A document is trip-scoped when it has no parent item. */
function groupKeyFor(doc: DocumentView): DocumentGroupKey {
	return doc.item ? ((doc.item_type as ItemType) ?? 'note') : 'trip';
}

export function groupDocuments(docs: DocumentView[]): DocumentGroup[] {
	const tripLevel: DocumentView[] = [];
	const byType = new Map<ItemType, DocumentView[]>();

	for (const doc of docs) {
		const key = groupKeyFor(doc);
		if (key === 'trip') {
			tripLevel.push(doc);
		} else {
			const bucket = byType.get(key) ?? [];
			bucket.push(doc);
			byType.set(key, bucket);
		}
	}

	const groups: DocumentGroup[] = [];
	if (tripLevel.length > 0) {
		groups.push({ key: 'trip', label: 'Whole trip', docs: tripLevel });
	}
	for (const { type, label } of TYPE_ORDER) {
		const bucket = byType.get(type);
		if (bucket && bucket.length > 0) {
			groups.push({ key: type, label, type, docs: bucket });
		}
	}
	return groups;
}

/** Per-type counts for the ContextRail summary, in the same order as the groups. */
export function documentTypeBreakdown(docs: DocumentView[]): { label: string; count: number }[] {
	return groupDocuments(docs).map((g) => ({ label: g.label, count: g.docs.length }));
}

// Confirmation codes live on the item, not the file (#205). A member hunting for
// "the hotel code" looks in Documents — so the aggregate surfaces every
// code-bearing item in one dedicated section, INDEPENDENT of whether that item
// has an uploaded document (a booking often has a code and no PDF). Read-only;
// edits stay on item detail. Items arrive in itinerary (sort_order) order; blank
// values are dropped, and an item with no non-blank codes is omitted entirely.
export interface ItemCodes {
	item_id: string;
	item_title: string;
	item_type: ItemType;
	codes: ConfirmationCode[];
}

export function itemsWithCodes(
	items: { id: string; title: string; type: ItemType; confirmation_codes?: ConfirmationCode[] }[]
): ItemCodes[] {
	const out: ItemCodes[] = [];
	for (const it of items) {
		const codes = (it.confirmation_codes ?? []).filter((c) => c.value?.trim());
		if (codes.length === 0) continue;
		out.push({ item_id: it.id, item_title: it.title || 'Item', item_type: it.type, codes });
	}
	return out;
}
