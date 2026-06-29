import type { RecordModel } from 'pocketbase';
import type { TripMember } from '$lib/collaboration/types';

// A Document is an artifact (PDF or image) attached to a trip, or to a single
// item within it. `item` empty = trip-scoped; set = item-scoped. ADR-0005 — no
// encryption; membership-gated like all trip data.
//
// #268 / ADR-0016 — the documents collection also holds confirmation codes,
// discriminated by `kind` (`file` | `code`). A `kind: 'code'` row carries
// `code_label` + `code_value` instead of a `file`. Legacy file rows store
// `kind: ''` (a non-required select); treat `'' | 'file'` as a FILE and only
// `'code'` as a code.
export type DocumentKind = '' | 'file' | 'code';

export interface Document extends RecordModel {
	trip: string;
	item: string;
	file: string;
	caption: string;
	uploaded_by: string;
	kind: DocumentKind;
	code_label: string;
	code_value: string;
	expand?: {
		uploaded_by?: TripMember;
	};
}

// A Document annotated for rendering: a ready-to-use file href (token already
// applied server-side), the uploader's display name, and the item's display
// label when shown outside its own item (the S2 aggregate).
export interface DocumentView extends Document {
	file_href: string;
	uploader_name: string;
	uploader_role: string;
	item_title?: string;
	item_type?: string;
}
