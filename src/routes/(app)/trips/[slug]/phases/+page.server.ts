import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Item, Phase, Vote } from '$lib/types';
import { validateNewPhaseStart, toDay } from '$lib/itinerary/phase-tiling';
import { applyRetile } from '$lib/itinerary/phase-tiling.server';

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
		if (!name) return fail(400, { error: 'Phase name is required.' });
		if (!startDate) return fail(400, { error: 'A start day is required.' });

		const tripStart = toDay(String(trip['start_date']));
		const tripEnd = toDay(String(trip['end_date']));

		// Boundary model (ADR-0021): a phase is defined by its start day; its end is
		// derived from the next phase's start. Validate the start splits an existing
		// segment; applyRetile then recomputes every phase's end + order.
		const existing = await locals.pb.collection('phases').getFullList({
			filter: `trip = "${trip.id}"`,
			fields: 'start_date'
		});
		const validationError = validateNewPhaseStart(
			startDate,
			tripStart,
			tripEnd,
			existing.map((p) => String(p['start_date']))
		);
		if (validationError) return fail(400, { error: validationError });

		try {
			// Placeholder end = trip end; applyRetile immediately corrects it to the
			// next phase's start. order is likewise corrected by applyRetile.
			await locals.pb.collection('phases').create({
				trip: trip.id,
				name,
				location,
				country_code: countryCode,
				start_date: toDay(startDate) + ' 00:00:00.000Z',
				end_date: tripEnd + ' 00:00:00.000Z',
				order: 0
			});
			await applyRetile(locals.pb, trip.id, tripEnd);
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
