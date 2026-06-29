import type { ItemType } from '$lib/types';
import type { ConfirmationCode } from '$lib/itinerary/types';
import type { Document, DocumentView } from './types';
import { codesByItem } from './codes';

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

// Confirmation codes live in the Documents collection as `kind: 'code'` rows
// (#268 / ADR-0016), not on the item. A member hunting for "the hotel code" looks
// in Documents — so the aggregate surfaces every code-bearing item in one
// dedicated section, INDEPENDENT of whether that item also has an uploaded file (a
// booking often has a code and no PDF). Read-only here; edits stay on item detail.
//
// Code Documents are passed already ordered (the loader fetches oldest-first);
// items supply the title/type and the itinerary (sort_order) ordering of the
// sections. Trip-scoped code docs (no item) are dropped — codes are item-bound in
// the UI. An item with no codes is omitted entirely.
export interface ItemCodes {
	item_id: string;
	item_title: string;
	item_type: ItemType;
	codes: ConfirmationCode[];
}

export function itemsWithCodes(
	items: { id: string; title: string; type: ItemType }[],
	codeDocs: Pick<Document, 'item' | 'code_label' | 'code_value' | 'kind'>[]
): ItemCodes[] {
	const byItem = codesByItem(codeDocs);
	const out: ItemCodes[] = [];
	for (const it of items) {
		const codes = byItem.get(it.id);
		if (!codes || codes.length === 0) continue;
		out.push({ item_id: it.id, item_title: it.title || 'Item', item_type: it.type, codes });
	}
	return out;
}
