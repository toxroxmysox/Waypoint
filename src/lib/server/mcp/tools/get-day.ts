import { z } from 'zod';
import { tripTz } from '$lib/shell/trip-time';
import { resolveTrip } from '../context';
import { dayCards, dayHeading, loadDay, resolveDate } from '../day-data';
import { offTrip, result } from '../present';
import type { ToolDef } from './types';

export const getDay: ToolDef = {
	name: 'get_day',
	title: 'Get a day',
	description:
		"One day of a trip in the trip's local time: where the group is staying, every item in timeline order with times and places, and the day's notes. " +
		'`date` is YYYY-MM-DD, "today", "tomorrow" or "yesterday" (trip-local).',
	inputSchema: {
		trip: z.string().describe('Trip slug, or part of its title'),
		date: z.string().optional().describe('YYYY-MM-DD, "today" (default), "tomorrow" or "yesterday"')
	},
	async run(ctx, { trip: ref, date }: { trip: string; date?: string }) {
		const t = await resolveTrip(ctx, ref);
		if (!t.open) return offTrip(t.trip);
		const tz = tripTz(t.trip);
		const d = resolveDate(tz, date ?? 'today', ctx.now);
		const data = await loadDay(ctx, t.trip, d);
		if (!data.day) return result(dayHeading(t.trip, d), [], { date: d, note: 'That date is outside the trip.' });
		return result(dayHeading(t.trip, d), dayCards(data), { date: d, timezone: tz });
	}
};
