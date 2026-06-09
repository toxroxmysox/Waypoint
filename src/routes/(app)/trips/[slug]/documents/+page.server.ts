import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Document, Item } from '$lib/types';
import { toDocumentView } from '$lib/documents/view';
import { documentTypeBreakdown } from '$lib/documents/grouping';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip, membership } = await parent();

	const [rawDocuments, items] = await Promise.all([
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
	const documents = rawDocuments.map((d) => toDocumentView(d, trip.slug, itemMap.get(d.item)));

	// Lightweight list for the add-sheet scope selector ("Whole trip" or an item).
	const itemOptions = items.map((i) => ({ id: i.id, title: i.title, type: i.type }));

	return {
		trip,
		membership,
		documents,
		itemOptions,
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

		try {
			const fd = new FormData();
			fd.set('trip', trip.id);
			if (itemId) fd.set('item', itemId);
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
