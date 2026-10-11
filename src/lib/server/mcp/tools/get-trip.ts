import { z } from 'zod';
import type { GoalStatus, Item, ItemStatus, Phase, TripGoal, TripMember, Vote } from '$lib/types';
import { formatDayDate } from '$lib/shell/format';
import { itemDateRange, toDateOnly } from '$lib/itinerary/multi-day';
import { deriveGoalStatus } from '$lib/itinerary/goal-status';
import { scoreVotes, sortByVoteScore, tallyVotes } from '$lib/collaboration/voting';
import { resolveTrip } from '../context';
import { loadTripDays, loadTripItems } from '../day-data';
import { offTrip, result, stripHtml, tripDates, ymd, EMOJI, type Card } from '../present';
import type { ToolDef } from './types';

export const memberName = (m: Pick<TripMember, 'display_name' | 'placeholder_name'>) =>
	m.display_name || m.placeholder_name || 'member';

export async function loadMembers(ctx: Parameters<ToolDef['run']>[0], tripId: string): Promise<TripMember[]> {
	return ctx.pb.collection('trip_members').getFullList<TripMember>({
		filter: ctx.pb.filter('trip = {:t} && removed_at = ""', { t: tripId }),
		fields: 'id,display_name,placeholder_name,role',
		requestKey: null
	});
}

export const getTrip: ToolDef = {
	name: 'get_trip',
	title: 'Trip overview',
	description:
		'A trip at a glance: its phases (places and dates), where the group sleeps each night, members by name and role, ' +
		'goals with their status, and unplaced ideas with vote counts.',
	inputSchema: { trip: z.string().describe('Trip slug, or part of its title') },
	async run(ctx, { trip: ref }: { trip: string }) {
		const t = await resolveTrip(ctx, ref);
		if (!t.open) return offTrip(t.trip);
		const trip = t.trip;
		const [phases, days, items, members, goals, votes] = await Promise.all([
			ctx.pb.collection('phases').getFullList<Phase>({
				filter: ctx.pb.filter('trip = {:t}', { t: trip.id }),
				fields: 'id,name,location,country_code,start_date,end_date,order',
				sort: 'order',
				requestKey: null
			}),
			loadTripDays(ctx, trip),
			loadTripItems(ctx, trip),
			loadMembers(ctx, trip.id),
			ctx.pb.collection('trip_goals').getFullList<TripGoal>({
				filter: ctx.pb.filter('trip = {:t}', { t: trip.id }),
				fields: 'id,title,description,manual_status,items,sort_order',
				sort: 'sort_order',
				requestKey: null
			}),
			ctx.pb.collection('votes').getFullList<Vote>({
				filter: ctx.pb.filter('trip = {:t}', { t: trip.id }),
				fields: 'id,item,value',
				requestKey: null
			})
		]);

		const cards: Card[] = phases.map((p) => ({
			emoji: '📍',
			title: p.name,
			tag: 'phase',
			lines: [[p.location, p.country_code].filter(Boolean).join(', '), tripDates(p)].filter(Boolean)
		}));

		// A night = every trip day but the last. Lodging covers night d when its
		// range is [start, end) around d, or (single-night) it sits on day d.
		const dayDate = new Map(days.map((d) => [d.id, toDateOnly(d.date)]));
		const lodging = items.filter((i) => i.type === 'lodging' && i.day);
		for (const d of days.slice(0, -1)) {
			const date = toDateOnly(d.date);
			const here = lodging.filter((l) => {
				const r = itemDateRange(l, days);
				return r ? r.start <= date && date < r.end : dayDate.get(l.day) === date;
			});
			cards.push({
				emoji: '🌙',
				title: formatDayDate(date),
				tag: 'night',
				lines: [here.length ? here.map((l) => l.title).join(', ') : 'no lodging']
			});
		}

		if (members.length) {
			cards.push({ emoji: '👥', title: 'Members', lines: members.map((m) => `${memberName(m)} · ${m.role.replace('_', '-')}`) });
		}

		const statusById = new Map(items.map((i) => [i.id, i.status as ItemStatus]));
		for (const g of goals) {
			const linked = (g.items ?? []).map((id) => statusById.get(id)).filter(Boolean) as ItemStatus[];
			const status: GoalStatus = deriveGoalStatus(linked, g.manual_status);
			cards.push({ emoji: '🎯', title: g.title, tag: status, lines: [stripHtml(g.description ?? '')].filter(Boolean) });
		}

		const ideas = items.filter((i) => !i.day);
		const votesBy = new Map<string, Vote[]>();
		for (const v of votes) votesBy.set(v.item, [...(votesBy.get(v.item) ?? []), v]);
		const scores = Object.fromEntries(ideas.map((i) => [i.id, scoreVotes(votesBy.get(i.id) ?? [])]));
		for (const i of sortByVoteScore(ideas as (Item & { sort_order: number })[], scores)) {
			const { counts, total } = tallyVotes(votesBy.get(i.id) ?? []);
			const breakdown = Object.entries(counts)
				.filter(([, n]) => n)
				.map(([k, n]) => `${n} ${k}`)
				.join(', ');
			cards.push({
				emoji: '💡',
				title: i.title,
				tag: 'idea',
				lines: [`${EMOJI[i.type] ?? ''} ${i.type}`.trim(), total ? `${total} vote${total === 1 ? '' : 's'}: ${breakdown}` : 'no votes']
			});
		}

		return result(`${trip.title} (${ymd(trip.start_date)} → ${ymd(trip.end_date)})`, cards, { timezone: trip.timezone });
	}
};
