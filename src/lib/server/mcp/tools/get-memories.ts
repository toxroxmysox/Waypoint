import { z } from 'zod';
import { formatDayDate } from '$lib/shell/format';
import { toDateOnly } from '$lib/itinerary/multi-day';
import { resolveTrip } from '../context';
import { offTrip, result, type Card } from '../present';
import { loadMembers, memberName } from './get-trip';
import type { ToolDef } from './types';

export const getMemories: ToolDef = {
	name: 'get_memories',
	title: 'Memories',
	description:
		"What members wrote in a trip's memories (their thoughts on each day), oldest day first. Photos are never shared. " +
		'`date` (YYYY-MM-DD) narrows to one day.',
	inputSchema: {
		trip: z.string().describe('Trip slug, or part of its title'),
		date: z.string().optional().describe('YYYY-MM-DD')
	},
	async run(ctx, { trip: ref, date }: { trip: string; date?: string }) {
		const t = await resolveTrip(ctx, ref);
		if (!t.open) return offTrip(t.trip);
		const pb = ctx.pb;
		let filter = pb.filter('trip = {:t} && thought != ""', { t: t.trip.id });
		if (date) filter += ' && ' + pb.filter('day.date >= {:a} && day.date <= {:b}', { a: `${date} 00:00:00.000Z`, b: `${date} 23:59:59.999Z` });
		// ADR-0024 §5: `photo` is never requested.
		const [rows, members] = await Promise.all([
			pb.collection('memories').getFullList({
				filter,
				fields: 'id,thought,author,created,expand.day.date',
				expand: 'day',
				requestKey: null
			}),
			loadMembers(ctx, t.trip.id)
		]);
		const name = new Map(members.map((m) => [m.id, memberName(m)]));
		const cards: Card[] = rows
			.map((r) => ({ date: toDateOnly((r.expand?.day?.date as string) ?? ''), r }))
			.sort((a, b) => a.date.localeCompare(b.date))
			.map(({ date: d, r }) => ({
				emoji: '📸',
				title: d ? formatDayDate(d) : 'Memory',
				tag: name.get(r.author as string) ?? 'member',
				lines: [r.thought as string]
			}));
		return result(`Memories · ${t.trip.title}`, cards, cards.length ? {} : { note: 'No written memories yet.' });
	}
};
