import { error, fail } from '@sveltejs/kit';
import { planIdeaOnDay } from '$lib/server/plan-idea';
import type { Actions, PageServerLoad } from './$types';
import type { Day, Item, Vote, TripMember } from '$lib/types';
import { phasesForDay } from '$lib/itinerary/phases';
import { rebalanceDayOrder } from '$lib/itinerary/sort-order';
import { spanningItemsForDate } from '$lib/itinerary/multi-day';
import { summarizeDays } from '$lib/itinerary/day-card';
import { withAvatarUrls } from '$lib/collaboration/member-avatar';
import { DISCRETE_FILTER, SPANNING_FILTER } from '$lib/trip-mode/spanning';

// A failed PB call's status when it is an HTTP error, else 500 (#499: a refused
// move is a 403, not a 500).
function failStatus(err: unknown): number {
	const status = (err as { status?: number } | null)?.status;
	return typeof status === 'number' && status >= 400 && status < 600 ? status : 500;
}

// #499 — reorder and drag-to-plan rebalance EVERY item on the day, and items.pb.js
// lets only an owner/co_owner write another member's sort_order. Gate up front.
async function canArrangeDay(locals: App.Locals, dayId: string): Promise<boolean> {
	try {
		const day = await locals.pb.collection('days').getOne<Day>(dayId, { fields: 'trip' });
		const member = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(
				`trip = "${day.trip}" && user = "${locals.user!.id}" && removed_at = ""`
			);
		return member.role === 'owner' || member.role === 'co_owner';
	} catch {
		return false;
	}
}

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { trip, phases, days } = await parent();

	let day: Day;
	try {
		day = await locals.pb.collection('days').getOne<Day>(params.dayId);
	} catch {
		error(404, 'Day not found');
	}

	if (day.trip !== trip.id) {
		error(404, 'Day not found');
	}

	// #538 — the day's discrete items: a red-eye that departs today is one of
	// them (#498's rule, shared with Now), not a Span banner.
	const items = await locals.pb.collection('items').getFullList<Item>({
		filter: `day = "${day.id}" && ${DISCRETE_FILTER}`,
		sort: 'sort_order'
	});

	// #538 — a red-eye that departed on an earlier day and lands today: a card here
	// too, placed by landing time. It belongs to its departure day (no drag here).
	const dayDate = day.date.split(/[T ]/)[0];
	const landingItems = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}" && type = "flight" && day != "${day.id}" && end_date >= "${dayDate} 00:00:00" && end_date <= "${dayDate} 23:59:59"`,
		sort: 'end_time'
	});

	// Multi-day items that span this calendar date (rendered as banners, not timeline).
	const allMultiDay = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}" && ${SPANNING_FILTER}`,
		sort: 'day'
	});
	const spanningItems = spanningItemsForDate(allMultiDay, days as Day[], dayDate);

	const dayPhases = phasesForDay(day, phases);

	const phaseIds = dayPhases.map((p) => p.id);
	const parkingLotItems =
		phaseIds.length > 0
			? await locals.pb.collection('items').getFullList<Item>({
					filter: `trip = "${trip.id}" && status = "unplanned" && (${phaseIds.map((id) => `phase = "${id}"`).join(' || ')})`,
					sort: 'sort_order'
				})
			: [];

	// #394 — votes for the day's items AND its parking-lot ideas: the parking
	// divider and the desktop Ideas rail both render a sentiment pill from
	// votesByItem, and ideas are what votes exist to rank. One trip-scoped query
	// (votes carry `trip`), kept to the shown ids below: an id-per-clause OR chain
	// grows with the parking lot and would hit PB's filter-length limit.
	const shownIds = new Set([...items, ...landingItems, ...parkingLotItems].map((i) => i.id));
	const [votes, members] = await Promise.all([
		shownIds.size > 0
			? locals.pb
					.collection('votes')
					.getFullList<Vote>({ filter: `trip = "${trip.id}"` })
					.then((all) => all.filter((v) => shownIds.has(v.item)))
			: Promise.resolve([] as Vote[]),
		locals.pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${trip.id}" && removed_at = ""`,
			expand: 'user'
		})
	]);

	const votesByItem: Record<string, Vote[]> = {};
	for (const v of votes) (votesByItem[v.item] ??= []).push(v);

	// #420 — the strip's documents count: attached FILES per day item (codes are
	// Documents too, ADR-0016, but they get their own chip in Trip Mode).
	const dayItemIds = new Set([...items, ...landingItems].map((i) => i.id));
	const docCountByItem: Record<string, number> = {};
	if (dayItemIds.size > 0) {
		const docs = await locals.pb
			.collection('documents')
			.getFullList<{ item: string }>({
				filter: `trip = "${trip.id}" && item != "" && kind != "code"`,
				fields: 'id,item'
			})
			.catch(() => []);
		for (const d of docs)
			if (dayItemIds.has(d.item)) docCountByItem[d.item] = (docCountByItem[d.item] ?? 0) + 1;
	}

	// #445 — the desktop rail's Up next rows (title, count, to-book) ride merged page
	// data under the overview's own key. One trip-wide items read, as the overview does.
	const tripItems = await locals.pb
		.collection('items')
		.getFullList<Item>({ filter: `trip = "${trip.id}"` });
	const daySummaries = summarizeDays(tripItems, days as Day[]);

	return {
		day,
		daySummaries,
		dayItems: items,
		landingItems,
		dayPhases,
		votesByItem,
		docCountByItem,
		members: withAvatarUrls(locals.pb, members),
		parkingLotItems,
		spanningItems,
		allDays: days
	};
};

export const actions: Actions = {
	updateNotes: async ({ request, params, locals }) => {
		const data = await request.formData();
		const notes = data.get('notes')?.toString() || '';

		try {
			await locals.pb.collection('days').update(params.dayId, { notes });
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to update notes.';
			return fail(500, { error: message });
		}
	},

	reorder: async ({ request, params, locals }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		const orderRaw = data.get('order')?.toString();

		if (!itemId) return fail(400, { error: 'Missing item ID.' });
		if (!(await canArrangeDay(locals, params.dayId))) return fail(403, { error: 'Not allowed.' });

		// #237: an untimed item must be able to land anywhere — between or below
		// timed items — and stick. A single midpoint sort_order can't encode that
		// (orderDayItems re-weaves untimed items against timed anchors whose
		// sort_order is unrelated to the clock). The client sends the full resulting
		// display order; rebalance the WHOLE day to match it so the drop round-trips.
		// Scope matches the timeline the user sees (load uses DISCRETE_FILTER) so
		// multi-day banner items aren't renumbered — they never appear in `order`.
		// A landing red-eye (#538) lives on another day, so it drops out here too.
		const day = await locals.pb.collection('items').getFullList<Item>({
			filter: `day = "${params.dayId}" && ${DISCRETE_FILTER}`,
			fields: 'id'
		});
		const dayIds = new Set(day.map((i) => i.id));

		const requested = (orderRaw ?? '').split(',').filter(Boolean);
		// Only trust ids that actually live on this day (drop stray/foreign ids), and
		// append any day items the client omitted so none lose their sort_order.
		const seen = new Set<string>();
		const orderedIds: string[] = [];
		for (const id of requested) {
			if (dayIds.has(id) && !seen.has(id)) {
				orderedIds.push(id);
				seen.add(id);
			}
		}
		for (const i of day) if (!seen.has(i.id)) orderedIds.push(i.id);

		const updates = rebalanceDayOrder(orderedIds.map((id) => ({ id })));
		try {
			await Promise.all(
				updates.map((u) => locals.pb.collection('items').update(u.id, { sort_order: u.sort_order }))
			);
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to reorder.';
			return fail(failStatus(err), { error: message });
		}
	},

	pullToPlan: async ({ request, params, locals }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		if (!itemId) return fail(400, { error: 'Missing item ID.' });

		// An idea pulled in via tap-to-plan has no drop position → append to the tail.
		// A drag carries the full resulting display order; rebalance the whole day so
		// the pulled item sticks where it landed — including between/below timed items
		// (#237), the same whole-day rebalance the timeline reorder uses.
		const orderRaw = data.get('order')?.toString();
		// A drag carries an order (whole-day rebalance): owner/co_owner only. Tap-to-
		// plan writes just this item, so items.pb.js decides (creator or privileged).
		if (orderRaw && !(await canArrangeDay(locals, params.dayId)))
			return fail(403, { error: 'Not allowed.' });

		try {
			if (!orderRaw) {
				// Append to the end of the day (tap-to-plan, no drop position).
				await planIdeaOnDay(locals.pb, itemId, params.dayId);
				return { success: true };
			}

			// Attach the pulled item to the day FIRST so it's part of the day set the
			// whole-day rebalance renumbers.
			await locals.pb.collection('items').update(itemId, { day: params.dayId, status: 'planned' });

			// Scope matches the visible timeline (load uses DISCRETE_FILTER).
			const day = await locals.pb.collection('items').getFullList<Item>({
				filter: `day = "${params.dayId}" && ${DISCRETE_FILTER}`,
				fields: 'id'
			});
			const dayIds = new Set(day.map((i) => i.id));

			const requested = orderRaw.split(',').filter(Boolean);
			const seen = new Set<string>();
			const orderedIds: string[] = [];
			for (const id of requested) {
				if (dayIds.has(id) && !seen.has(id)) {
					orderedIds.push(id);
					seen.add(id);
				}
			}
			for (const i of day) if (!seen.has(i.id)) orderedIds.push(i.id);

			const updates = rebalanceDayOrder(orderedIds.map((id) => ({ id })));
			await Promise.all(
				updates.map((u) => locals.pb.collection('items').update(u.id, { sort_order: u.sort_order }))
			);
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to add item to day.';
			return fail(failStatus(err), { error: message });
		}
	},

	pushToParking: async ({ request, locals, params }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		if (!itemId) return fail(400, { error: 'Missing item ID.' });

		try {
			// Eject → unschedule (#60): drop the day, mark unplanned, and STRIP the
			// time so "unscheduled" means unscheduled (no silent re-anchor later).
			// #411: drop the span too (it needs a start day), and keep a phase: the
			// item's own, else the phase of the day it leaves.
			const item = await locals.pb.collection('items').getOne(itemId, { fields: 'phase' });
			let phase = String(item.phase || '');
			if (!phase) {
				const day = await locals.pb.collection('days').getOne(params.dayId, { fields: 'phases' });
				phase = String((day.phases as string[] | undefined)?.[0] || '');
			}
			await locals.pb.collection('items').update(itemId, {
				day: '',
				phase,
				status: 'unplanned',
				sort_order: 0,
				start_time: '',
				end_time: '',
				end_date: ''
			});
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to remove item from day.';
			return fail(failStatus(err), { error: message });
		}
	}
};
