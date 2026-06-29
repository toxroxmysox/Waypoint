import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Day, Item, Document } from '$lib/types';
import { attachCodesToItems } from '$lib/documents/codes';
import { tripNow, tripTz } from '$lib/shell/trip-time';
import { isTripActive } from '$lib/trip-mode/activation';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { trip, days } = await parent();

	// Trip Mode is only reachable on an active trip (#204) — see now/+page.server.ts.
	if (!isTripActive(trip)) redirect(303, `/trips/${params.slug}`);

	const now = tripNow(tripTz(trip));
	const upcomingDayIds: string[] = [];

	for (let i = 1; i <= 3; i++) {
		const d = new Date(now);
		d.setUTCDate(d.getUTCDate() + i);
		const ds = d.toISOString().split('T')[0];
		const found = days.find((day: Day) => day.date.split(/[T ]/)[0] === ds);
		if (found) upcomingDayIds.push(found.id);
	}

	const items = upcomingDayIds.length > 0
		? await locals.pb.collection('items').getFullList<Item>({
				filter: upcomingDayIds.map((id) => `day = "${id}"`).join(' || '),
				sort: 'day,start_time,sort_order'
			})
		: [];

	// #268 / ADR-0016 — the TripModeCard renders `item.confirmation_codes`, which now
	// live as `kind: 'code'` Documents. Re-source them onto the cards.
	if (items.length > 0) {
		const codeDocs = await locals.pb.collection('documents').getFullList<Document>({
			filter: `trip = "${trip.id}" && kind = "code"`,
			sort: 'created'
		});
		attachCodesToItems(items, codeDocs);
	}

	return { items, now: now.toISOString() };
};
