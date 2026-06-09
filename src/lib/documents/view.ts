import type { Document, DocumentView } from './types';
import type { Item, TripMember } from '$lib/types';

// Map a raw `documents` record (with `uploaded_by` expanded) into a render-ready
// DocumentView: a same-origin file href plus the uploader's display fields, and
// optional item label/type for the aggregate. Pure — no PocketBase, no DOM.
export function toDocumentView(doc: Document, slug: string, item?: Item | null): DocumentView {
	const uploader = doc.expand?.uploaded_by as TripMember | undefined;
	return {
		...doc,
		file_href: `/trips/${slug}/documents/${doc.id}/file`,
		uploader_name: uploader?.display_name || uploader?.placeholder_name || '',
		uploader_role: uploader?.role ?? '',
		item_title: item?.title,
		item_type: item?.type
	};
}
