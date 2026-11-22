import type { ConfirmationCode } from '$lib/itinerary/types';
import type { Document } from './types';

// #268 / ADR-0016 — confirmation codes are now `kind: 'code'` Documents, not the
// legacy `items.confirmation_codes` json blob. These pure helpers re-source the
// code shape the UI still expects (`{ label, value }[]`) from code Documents, so
// every reader (item detail, Documents window, export) reads ONE source of truth.
//
// A Document is a code IFF `kind === 'code'`. Legacy file rows store `kind: ''`
// (a non-required select); only `'code'` counts — everything else is a file.

/** A code Document carries a non-empty `code_value`; the rest are file artifacts. */
export function isCodeDocument(doc: Pick<Document, 'kind'>): boolean {
	return doc.kind === 'code';
}

/** A file Document is anything that isn't a code (legacy `''` rows included). */
export function isFileDocument(doc: Pick<Document, 'kind'>): boolean {
	return doc.kind !== 'code';
}

/**
 * #592 — the one order codes read in everywhere: stored (creation) order. Codes
 * saved in the same millisecond (one form submit, an import, a seed) tie on
 * `created`, and PB returns ties in whatever order the query plan gives, so a
 * newest-first fetch that is then reversed showed them flipped. `@rowid` (insertion
 * order) makes this a total order. Use it as the PB `sort` for every code fetch.
 */
export const CODE_ORDER = 'created,@rowid';

/**
 * The exact reverse of CODE_ORDER, for fetches that mix file and code Documents and
 * show files newest first. Reversing a list fetched with this yields CODE_ORDER.
 */
export const NEWEST_FIRST = '-created,-@rowid';

type CodeDoc = Pick<Document, 'item' | 'code_label' | 'code_value' | 'kind'>;

/** Project a single code Document into the legacy `{ label, value }` shape. */
export function codeFromDocument(doc: CodeDoc): ConfirmationCode {
	return { label: doc.code_label ?? '', value: doc.code_value ?? '' };
}

/**
 * Group code Documents by their owning item id, preserving input order. Code docs
 * with no value are dropped (a value-less code is meaningless — and the create
 * hook rejects it). Trip-scoped code docs (no item) bucket under the empty key.
 *
 * Pass docs in CODE_ORDER (fetch with it, or reverse a NEWEST_FIRST fetch) so
 * every surface lists an item's codes in the same order.
 */
export function codesByItem(docs: CodeDoc[]): Map<string, ConfirmationCode[]> {
	const out = new Map<string, ConfirmationCode[]>();
	for (const doc of docs) {
		if (!isCodeDocument(doc)) continue;
		if (!(doc.code_value ?? '').trim()) continue;
		const key = doc.item ?? '';
		const bucket = out.get(key) ?? [];
		bucket.push(codeFromDocument(doc));
		out.set(key, bucket);
	}
	return out;
}

/** The codes belonging to one item, in input order ([] when none). */
export function codesForItem(docs: CodeDoc[], itemId: string): ConfirmationCode[] {
	return codesByItem(docs).get(itemId) ?? [];
}

/**
 * Mutate each item in-place, setting `confirmation_codes` from the code Documents.
 * Used by readers (Now / Upcoming cards) that render `item.confirmation_codes` but
 * fetch the item directly — the legacy json field is now inert, so the codes must
 * be re-sourced from the documents collection. Returns the same array for chaining.
 */
export function attachCodesToItems<
	T extends { id: string; confirmation_codes?: ConfirmationCode[] }
>(items: T[], codeDocs: CodeDoc[]): T[] {
	const byItem = codesByItem(codeDocs);
	for (const it of items) {
		it.confirmation_codes = byItem.get(it.id) ?? [];
	}
	return items;
}
