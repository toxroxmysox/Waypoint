import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Day, Item, Vote, TripMember } from '$lib/types';
import { phasesForDay } from '$lib/itinerary/phases';
import { rebalanceDayOrder, GAP } from '$lib/itinerary/sort-order';
import { spanningItemsForDate } from '$lib/itinerary/multi-day';
import { summarizeDays } from '$lib/itinerary/day-card';
import { withAvatarUrls } from '$lib/collaboration/member-avatar';

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
			.getFirstListItem<TripMember>(`trip = "${day.trip}" && user = "${locals.user!.id}" && removed_at = ""`);
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

	const items = await locals.pb.collection('items').getFullList<Item>({
		filter: `day = "${day.id}" && end_date = ""`,
		sort: 'sort_order'
	});

	// Multi-day items that span this calendar date (rendered as banners, not timeline).
	const dayDate = day.date.split(/[T ]/)[0];
	const allMultiDay = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}" && end_date != ""`,
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
	const shownIds = new Set([...items, ...parkingLotItems].map((i) => i.id));
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
	const dayItemIds = new Set(items.map((i) => i.id));
	const docCountByItem: Record<string, number> = {};
	if (dayItemIds.size > 0) {
		const docs = await locals.pb
			.collection('documents')
			.getFullList<{ item: string }>({
				filter: `trip = "${trip.id}" && item != "" && kind != "code"`,
				fields: 'id,item'
			})
			.catch(() => []);
		for (const d of docs) if (dayItemIds.has(d.item)) docCountByItem[d.item] = (docCountByItem[d.item] ?? 0) + 1;
	}

	// #445 — the desktop rail's Up next rows (title, count, to-book) ride merged page
	// data under the overview's own key. One trip-wide items read, as the overview does.
	const tripItems = await locals.pb.collection('items').getFullList<Item>({ filter: `trip = "${trip.id}"` });
	const daySummaries = summarizeDays(tripItems, days as Day[]);

	return { day, daySummaries, dayItems: items, dayPhases, votesByItem, docCountByItem, members: withAvatarUrls(locals.pb, members), parkingLotItems, spanningItems, allDays: days };
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
		// Scope matches the timeline the user sees (load uses `end_date = ""`) so
		// multi-day banner items aren't renumbered — they never appear in `order`.
		const day = await locals.pb.collection('items').getFullList<Item>({
			filter: `day = "${params.dayId}" && end_date = ""`,
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
		if (orderRaw && !(await canArrangeDay(locals, params.dayId))) return fail(403, { error: 'Not allowed.' });

		try {
			if (!orderRaw) {
				// Append to the end of the day (tap-to-plan, no drop position).
				const tail = await locals.pb.collection('items').getFullList({
					filter: `day = "${params.dayId}"`,
					sort: '-sort_order',
					fields: 'sort_order'
				});
				await locals.pb.collection('items').update(itemId, {
					day: params.dayId,
					status: 'planned',
					sort_order: tail.length > 0 ? Number(tail[0].sort_order) + GAP : GAP
				});
				return { success: true };
			}

			// Attach the pulled item to the day FIRST so it's part of the day set the
			// whole-day rebalance renumbers.
			await locals.pb.collection('items').update(itemId, { day: params.dayId, status: 'planned' });

			// Scope matches the visible timeline (load uses `end_date = ""`).
			const day = await locals.pb.collection('items').getFullList<Item>({
				filter: `day = "${params.dayId}" && end_date = ""`,
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

	pushToParking: async ({ request, locals }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		if (!itemId) return fail(400, { error: 'Missing item ID.' });

		try {
			// Eject → unschedule (#60): drop the day, mark unplanned, and STRIP the
			// time so "unscheduled" means unscheduled (no silent re-anchor later).
			await locals.pb.collection('items').update(itemId, {
				day: '',
				status: 'unplanned',
				sort_order: 0,
				start_time: '',
				end_time: ''
			});
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to remove item from day.';
			return fail(failStatus(err), { error: message });
		}
	}
};
