import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Document, Item } from '$lib/types';
import { toDocumentView } from '$lib/documents/view';
import { documentTypeBreakdown, itemsWithCodes } from '$lib/documents/grouping';
import { isFileDocument } from '$lib/documents/codes';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip, membership } = await parent();

	// #268 / ADR-0016 — codes now live as `kind: 'code'` Documents. Fetch the whole
	// trip's documents once; split file rows (the cards) from code rows (the codes
	// section). File rows keep newest-first; code rows come back oldest-first so the
	// section reads in creation order.
	const [allDocuments, items] = await Promise.all([
		locals.pb.collection('documents').getFullList<Document>({
			filter: `trip = "${trip.id}"`,
			sort: '-created',
			expand: 'uploaded_by'
		}),
		locals.pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}"`,
			sort: 'sort_order',
			fields: 'id,type,title'
		})
	]);

	const itemMap = new Map(items.map((i) => [i.id, i]));
	// Only file artifacts render as document cards; code rows surface in the codes
	// section below (a code doc has no file → would render as a broken card).
	const fileDocs = allDocuments.filter(isFileDocument);
	const documents = fileDocs.map((d) => toDocumentView(d, trip.slug, itemMap.get(d.item)));

	// Code docs, oldest-first (reverse the newest-first fetch) so the codes section
	// reads in creation order.
	const codeDocs = allDocuments.filter((d) => d.kind === 'code').reverse();

	// Lightweight list for the add-sheet scope selector ("Whole trip" or an item).
	const itemOptions = items.map((i) => ({ id: i.id, title: i.title, type: i.type }));

	return {
		trip,
		membership,
		documents,
		itemOptions,
		// Every item carrying a confirmation code, for the dedicated Documents section.
		itemCodes: itemsWithCodes(items, codeDocs),
		documentSummary: {
			total: documents.length,
			breakdown: documentTypeBreakdown(documents)
		}
	};
};

export const actions: Actions = {
	// Trip-scoped upload (the aggregate defaults to whole-trip; an item may be
	// chosen in the add sheet). The documents.pb.js hook pins uploaded_by + blocks
	// viewers; PB mimeTypes/maxSize enforce type + 20 MB.
	uploadDocument: async ({ request, params, locals }) => {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

		const formData = await request.formData();
		const file = formData.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { uploadError: 'Choose a file to upload.' });
		}
		const itemId = formData.get('item')?.toString() ?? '';
		const caption = formData.get('caption')?.toString().trim() ?? '';

		try {
			const fd = new FormData();
			fd.set('trip', trip.id);
			if (itemId) fd.set('item', itemId);
			if (caption) fd.set('caption', caption);
			fd.set('file', file);
			await locals.pb.collection('documents').create(fd);
			return { uploadSuccess: true };
		} catch (err: unknown) {
			const e = err as { status?: number; response?: { data?: Record<string, unknown> } };
			if (e?.status === 403) {
				return fail(403, { uploadError: 'You do not have permission to upload here.' });
			}
			if (e?.response?.data?.file) {
				return fail(400, { uploadError: 'PDF or image only, up to 20 MB.' });
			}
			return fail(400, { uploadError: 'Failed to upload document.' });
		}
	},

	deleteDocument: async ({ request, params, locals }) => {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

		const formData = await request.formData();
		const docId = formData.get('document_id')?.toString();
		if (!docId) return fail(400, { error: 'Missing document id.' });

		try {
			const doc = await locals.pb.collection('documents').getOne<Document>(docId);
			if (doc.trip !== trip.id) return fail(403, { error: 'Not authorized.' });
			await locals.pb.collection('documents').delete(docId);
			return { documentDeleted: true };
		} catch (err: unknown) {
			const e = err as { status?: number };
			if (e?.status === 403) {
				return fail(403, { error: 'Only the uploader or a trip owner/co-owner can delete this.' });
			}
			const message = err instanceof Error ? err.message : 'Failed to delete document.';
			return fail(500, { error: message });
		}
	}
};
