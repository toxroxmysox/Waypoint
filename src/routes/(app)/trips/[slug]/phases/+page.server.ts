import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Item, Phase, Vote } from '$lib/types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { trip, membership, phases } = await parent();

	// Launch-card data: how many items the member hasn't rated yet, and the first
	// phase (in order) that still has unrated cards to kick the deck off from.
	const items = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}" && (status = "planned" || status = "unplanned")`,
		fields: 'id,phase'
	});
	const myVotes = await locals.pb.collection('votes').getFullList<Vote>({
		filter: `trip = "${trip.id}" && member = "${membership.id}"`,
		fields: 'item'
	});
	const votedItemIds = new Set(myVotes.map((v) => v.item));

	const unratedByPhase: Record<string, number> = {};
	let unratedTotal = 0;
	for (const it of items) {
		if (votedItemIds.has(it.id)) continue;
		unratedByPhase[it.phase] = (unratedByPhase[it.phase] ?? 0) + 1;
		unratedTotal++;
	}
	const launchPhaseId = (phases as Phase[]).find((p) => (unratedByPhase[p.id] ?? 0) > 0)?.id ?? null;

	// #196 — catch-all for pre-existing orphans: unplanned items with no phase
	// render on no surface (every parking lot is phase-scoped). Surface them here
	// so they can be re-homed. New code can't create these (block-at-delete +
	// phase-required validation), but legacy data may already have them.
	const orphans = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}" && status = "unplanned" && phase = ""`,
		fields: 'id,title,type',
		sort: 'title'
	});

	return { trip, phases, unratedTotal, launchPhaseId, orphans };
};

export const actions: Actions = {
	create: async ({ request, locals, params }) => {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
		const data = await request.formData();
		const name = data.get('name')?.toString().trim();
		const location = data.get('location')?.toString().trim() || '';
		const countryCode = data.get('country_code')?.toString().trim() || '';
		const startDate = data.get('start_date')?.toString();
		const endDate = data.get('end_date')?.toString();
		if (!name) return fail(400, { error: 'Phase name is required.' });
		if (!startDate || !endDate) return fail(400, { error: 'Start and end dates are required.' });
		if (new Date(startDate) > new Date(endDate)) {
			return fail(400, { error: 'Start date must be before end date.' });
		}

		const tripStart = (trip['start_date'] as string).split('T')[0].split(' ')[0];
		const tripEnd = (trip['end_date'] as string).split('T')[0].split(' ')[0];
		if (startDate < tripStart || endDate > tripEnd) {
			return fail(400, {
				error: `Phase dates must fall within the trip (${tripStart} to ${tripEnd}). Edit the trip dates first if you need a wider range.`
			});
		}

		try {
			const existing = await locals.pb.collection('phases').getFullList({
				filter: `trip = "${trip.id}"`,
				sort: '-order',
				fields: 'order'
			});
			const nextOrder = existing.length > 0 ? Number(existing[0]['order']) + 1 : 0;

			await locals.pb.collection('phases').create({
				trip: trip.id,
				name,
				location,
				country_code: countryCode,
				start_date: startDate + ' 00:00:00.000Z',
				end_date: endDate + ' 00:00:00.000Z',
				order: nextOrder
			});

			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to create phase.';
			return fail(500, { error: message });
		}
	},

	reorder: async ({ request, locals, params }) => {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
		const data = await request.formData();
		const phaseId = data.get('phase_id')?.toString();
		const direction = data.get('direction')?.toString();

		if (!phaseId || !direction) return fail(400, { error: 'Missing parameters.' });

		try {
			const phases = await locals.pb.collection('phases').getFullList({
				filter: `trip = "${trip.id}"`,
				sort: 'order'
			});

			const idx = phases.findIndex((p) => p.id === phaseId);
			if (idx === -1) return fail(404, { error: 'Phase not found.' });

			const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
			if (swapIdx < 0 || swapIdx >= phases.length) return { success: true };

			const currentOrder = Number(phases[idx]['order']);
			const swapOrder = Number(phases[swapIdx]['order']);

			await Promise.all([
				locals.pb.collection('phases').update(phases[idx].id, { order: swapOrder }),
				locals.pb.collection('phases').update(phases[swapIdx].id, { order: currentOrder })
			]);

			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to reorder.';
			return fail(500, { error: message });
		}
	},

	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const phaseId = data.get('phase_id')?.toString();

		if (!phaseId) return fail(400, { error: 'Missing phase ID.' });

		try {
			await locals.pb.collection('phases').delete(phaseId);
			return { success: true };
		} catch (err: unknown) {
			// #196 — the delete hook throws a BadRequestError ("Move N ideas first")
			// when the phase still holds unplanned items. PB nests that message under
			// .response.message; surface it (not the SDK's generic .message) so the
			// user sees the actionable instruction, and return 400 for a validation
			// failure rather than 500.
			const e = err as {
				status?: number;
				message?: string;
				response?: { message?: string };
			};
			const hookMessage = e.response?.message;
			if (hookMessage) {
				return fail(e.status && e.status >= 400 && e.status < 500 ? e.status : 400, {
					error: hookMessage
				});
			}
			return fail(500, { error: e.message || 'Failed to delete phase.' });
		}
	}
};
