import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Day, Item, Phase, Vote } from '$lib/types';
import { toDateOnly } from '$lib/itinerary/multi-day';
import { validateNewPhaseStart, validateMovePhaseStart, retilePhases, toDay } from '$lib/itinerary/phase-tiling';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { trip, membership, phases } = await parent();

	// #391/#401 — one Phase Overview card per phase: its days (chips, with a dot
	// when a day has planned items), its idea count and how many this member has
	// left to rate. One query each for days, items and votes, bucketed in memory.
	const [days, items, myVotes] = await Promise.all([
		locals.pb.collection('days').getFullList<Day>({ filter: `trip = "${trip.id}"`, sort: 'date' }),
		locals.pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}" && (status = "planned" || status = "unplanned")`,
			fields: 'id,phase,day,status,end_date'
		}),
		locals.pb.collection('votes').getFullList<Vote>({
			filter: `trip = "${trip.id}" && member = "${membership.id}"`,
			fields: 'item'
		})
	]);
	const voted = new Set(myVotes.map((v) => v.item));
	const plannedByDayAll: Record<string, number> = {};
	for (const it of items) {
		if (it.status === 'planned' && it.day && !toDateOnly(it.end_date ?? '')) {
			plannedByDayAll[it.day] = (plannedByDayAll[it.day] ?? 0) + 1;
		}
	}
	const cards = (phases as Phase[]).map((phase) => {
		const phaseDays = days.filter((d) => (d.phases ?? []).includes(phase.id));
		const mine = items.filter((it) => it.phase === phase.id);
		return {
			phase,
			days: phaseDays,
			plannedByDay: Object.fromEntries(phaseDays.map((d) => [d.id, plannedByDayAll[d.id] ?? 0])),
			ideaCount: mine.filter((it) => it.status === 'unplanned' && !it.day).length,
			unratedCount: mine.filter((it) => !voted.has(it.id)).length
		};
	});

	// #196 — catch-all for pre-existing orphans: unplanned items with no phase
	// render on no surface (every parking lot is phase-scoped). Surface them here
	// so they can be re-homed. New code can't create these (block-at-delete +
	// phase-required validation), but legacy data may already have them.
	const orphans = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}" && status = "unplanned" && phase = ""`,
		fields: 'id,title,type',
		sort: 'title'
	});

	return { trip, phases, cards, orphans };
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
		// segment (for an in-context error); phases.pb.js re-validates and retiles
		// every phase's end + order (#411).
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
			// end_date / order are derived by phases.pb.js (#411); these are placeholders.
			await locals.pb.collection('phases').create({
				trip: trip.id,
				name,
				location,
				country_code: countryCode,
				start_date: toDay(startDate) + ' 00:00:00.000Z',
				end_date: tripEnd + ' 00:00:00.000Z',
				order: 0
			});
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to create phase.';
			return fail(500, { error: message });
		}
	},

	// #330 — the calendar editor drives boundary moves + renames from THIS page
	// (live-persist, no redirect). moveStart mirrors the phase-detail update's boundary
	// validation; rename touches only the name. Both retile after (rename doesn't need
	// it, but it's a cheap no-op that keeps ends/order canonical).
	moveStart: async ({ request, locals, params }) => {
		const data = await request.formData();
		const phaseId = data.get('phase_id')?.toString();
		const startDate = data.get('start_date')?.toString();
		if (!phaseId || !startDate) return fail(400, { error: 'Missing phase or start day.' });

		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
		const tripStart = toDay(String(trip['start_date']));
		const tripEnd = toDay(String(trip['end_date']));

		const all = await locals.pb.collection('phases').getFullList({
			filter: `trip = "${trip.id}"`,
			fields: 'id,start_date'
		});
		const tiled = retilePhases(all as unknown as { id: string; start_date: string }[], tripEnd);
		const moveError = validateMovePhaseStart(phaseId, startDate, tiled, tripStart, tripEnd);
		if (moveError) return fail(400, { error: moveError });

		try {
			await locals.pb
				.collection('phases')
				.update(phaseId, { start_date: toDay(startDate) + ' 00:00:00.000Z' });
			return { success: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to move boundary.' });
		}
	},

	rename: async ({ request, locals }) => {
		const data = await request.formData();
		const phaseId = data.get('phase_id')?.toString();
		const name = data.get('name')?.toString().trim();
		if (!phaseId) return fail(400, { error: 'Missing phase ID.' });
		if (!name) return fail(400, { error: 'Phase name is required.' });
		try {
			await locals.pb.collection('phases').update(phaseId, { name });
			return { success: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to rename phase.' });
		}
	},

	delete: async ({ request, locals, params }) => {
		const data = await request.formData();
		const phaseId = data.get('phase_id')?.toString();
		if (!phaseId) return fail(400, { error: 'Missing phase ID.' });

		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
			const tripEnd = toDay(String(trip['end_date']));

			// Boundary model (ADR-0021): deleting a phase merges its span into the
			// previous phase by start order (the first phase merges forward instead).
			const all = await locals.pb.collection('phases').getFullList({
				filter: `trip = "${trip.id}"`,
				fields: 'id,start_date'
			});
			const tiled = retilePhases(all as unknown as { id: string; start_date: string }[], tripEnd);
			const idx = tiled.findIndex((p) => p.id === phaseId);
			const target = idx > 0 ? tiled[idx - 1] : tiled[idx + 1]; // undefined only if last (hook blocks that)

			// Re-home this phase's PLANNED items to the merge target so they aren't
			// stranded phase-less. (Unplanned items are blocked by the delete hook.)
			if (target) {
				const planned = await locals.pb.collection('items').getFullList({
					filter: `phase = "${phaseId}" && status != "unplanned"`,
					fields: 'id'
				});
				for (const it of planned) {
					await locals.pb.collection('items').update(it.id, { phase: target.id });
				}
			}

			// The merge itself (the previous phase's end grows; on a first-phase delete
			// the next phase is pulled back to the trip start) is phases.pb.js's retile
			// after the delete (#411).
			await locals.pb.collection('phases').delete(phaseId);
			return { success: true };
		} catch (err: unknown) {
			// #196 — the delete hook throws "Move N ideas first" when the phase still
			// holds unplanned items; PB nests it under .response.message. Surface it
			// (not the SDK's generic .message) and return 400 for a validation failure.
			const e = err as { status?: number; message?: string; response?: { message?: string } };
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
