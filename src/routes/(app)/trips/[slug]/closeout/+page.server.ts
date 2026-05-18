import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Item, TripMember } from '$lib/types';

export const load: PageServerLoad = async ({ parent, locals, params }) => {
	const { trip, membership, days, phases } = await parent();

	if (membership.role !== 'owner' && membership.role !== 'co_owner') {
		redirect(303, `/trips/${params.slug}`);
	}

	const items = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}"`,
		sort: 'day,slot,order'
	});

	return { trip, membership, days, phases, items };
};

export const actions: Actions = {
	markDone: async ({ request, locals }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		if (!itemId) return fail(400, { error: 'Missing item ID.' });

		try {
			await locals.pb.collection('items').update(itemId, { status: 'done' });
			return { success: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to update item.' });
		}
	},

	markDoneAll: async ({ request, locals }) => {
		const data = await request.formData();
		const itemIds = data.getAll('item_ids').map((id) => id.toString());
		if (itemIds.length === 0) return fail(400, { error: 'No items to mark.' });

		try {
			await Promise.all(
				itemIds.map((id) => locals.pb.collection('items').update(id, { status: 'done' }))
			);
			return { bulkSuccess: true, count: itemIds.length };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to bulk update.' });
		}
	},

	addReplacement: async ({ request, locals }) => {
		const data = await request.formData();
		const tripId = data.get('trip_id')?.toString();
		const originalItemId = data.get('original_item_id')?.toString();
		const dayId = data.get('day_id')?.toString() || '';
		const phaseId = data.get('phase_id')?.toString() || '';
		const slot = data.get('slot')?.toString() || 'anytime';
		const title = data.get('title')?.toString().trim();
		const type = data.get('type')?.toString() || 'activity';

		if (!tripId || !title) return fail(400, { error: 'Trip ID and title are required.' });

		try {
			if (originalItemId) {
				await locals.pb.collection('items').update(originalItemId, { status: 'considered' });
			}

			await locals.pb.collection('items').create({
				trip: tripId,
				day: dayId,
				phase: phaseId,
				slot,
				type,
				title,
				status: 'done',
				booked: false,
				order: 999
			});
			return { replacementAdded: true };
		} catch (err: unknown) {
			return fail(500, {
				error: err instanceof Error ? err.message : 'Failed to create replacement.'
			});
		}
	},

	finishCloseout: async ({ locals, params }) => {
		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}"`);
			if (membership.role !== 'owner' && membership.role !== 'co_owner') {
				return fail(403, { error: 'Only trip owners can archive.' });
			}

			const updates: Record<string, unknown> = { archived: true };
			if (trip.archive_enabled && !trip.public_share_token) {
				const { generateArchiveToken } = await import('$lib/utils/archive-token');
				updates.public_share_token = generateArchiveToken();
			}

			await locals.pb.collection('trips').update(trip.id, updates);
			redirect(303, `/trips/${params.slug}`);
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to archive.' });
		}
	}
};
