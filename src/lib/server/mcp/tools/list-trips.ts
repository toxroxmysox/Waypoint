import { myTrips } from '../context';
import { result, tripDates, type Card } from '../present';
import type { ToolDef } from './types';

export const listTrips: ToolDef = {
	name: 'list_trips',
	title: 'List my trips',
	description:
		"Every trip the user belongs to, past, current and upcoming, with dates, the user's role and the trip's slug. " +
		'Use the slug (or part of the title) as `trip` in the other tools.',
	inputSchema: {},
	async run(ctx) {
		const trips = await myTrips(ctx);
		const cards: Card[] = trips.map(({ trip, role, open }) => ({
			emoji: open ? '🧭' : '🔒',
			title: trip.title,
			tag: open ? role : `${role} · AI access off`,
			lines: [tripDates(trip), [trip.location_summary, `slug: ${trip.slug}`].filter(Boolean).join(' · ')]
		}));
		return result(`${ctx.user.name}'s trips`, cards);
	}
};
