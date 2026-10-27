import { z } from 'zod';
import type { GoalStatus, Item, ItemStatus, Phase, TripGoal, TripMember, Vote } from '$lib/types';
import { formatDayDate } from '$lib/shell/format';
import { deriveGoalStatus } from '$lib/itinerary/goal-status';
import { scoreVotes, sortByVoteScore, tallyVotes } from '$lib/collaboration/voting';
import { resolveTrip } from '../context';
import { loadTripDays, loadTripItems } from '../day-data';
import { lodgingForNight, nightsOf } from '$lib/itinerary/lodging-nights';
import { offTrip, result, stripHtml, tripDates, ymd, EMOJI, type Card } from '../present';
import type { ToolDef } from './types';

/** As the app names members (memberDisplayName): display name, account name, placeholder name. Never an email (#409). */
export const memberName = (m: Pick<TripMember, 'display_name' | 'placeholder_name' | 'expand'>) =>
	m.display_name || m.expand?.user?.name || m.placeholder_name || 'member';

export async function loadMembers(
	ctx: Parameters<ToolDef['run']>[0],
	tripId: string
): Promise<TripMember[]> {
	return ctx.pb.collection('trip_members').getFullList<TripMember>({
		filter: ctx.pb.filter('trip = {:t} && removed_at = ""', { t: tripId }),
		// ADR-0024 §5: only the account's name, never its email or avatar.
		fields: 'id,display_name,placeholder_name,role,expand.user.name',
		expand: 'user',
		requestKey: null
	});
}

/**
 * #512 — one card per run of nights at the same place, not one per night: a
 * 45-night trip otherwise fills the 50-card cap and drops goals and ideas.
 */
export function nightCards(nights: { date: string; lodging: string }[]): Card[] {
	const runs: { from: string; to: string; lodging: string; n: number }[] = [];
	for (const { date, lodging } of nights) {
		const last = runs.at(-1);
		if (last && last.lodging === lodging) {
			last.to = date;
			last.n++;
		} else runs.push({ from: date, to: date, lodging, n: 1 });
	}
	return runs.map((r) => ({
		emoji: '🌙',
		title: r.n === 1 ? formatDayDate(r.from) : `${formatDayDate(r.from)} → ${formatDayDate(r.to)}`,
		tag: r.n === 1 ? 'night' : 'nights',
		lines: [r.n === 1 ? r.lodging : `${r.lodging} · ${r.n} nights`]
	}));
}

/** A phase card: place, dates, then its Phase Notes when set (#401). */
export function phaseCard(
	p: Pick<Phase, 'name' | 'location' | 'country_code' | 'start_date' | 'end_date' | 'notes'>
): Card {
	return {
		emoji: '📍',
		title: p.name,
		tag: 'phase',
		lines: [
			[p.location, p.country_code].filter(Boolean).join(', '),
			tripDates(p),
			p.notes || ''
		].filter(Boolean)
	};
}

/** #401 — the Trip Notes card, or null when the trip has none. */
export function tripNotesCard(notes: string | undefined): Card | null {
	return notes ? { emoji: '📝', title: 'Trip notes', lines: [notes] } : null;
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
				fields: 'id,name,location,country_code,start_date,end_date,order,notes',
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

		const notesCard = tripNotesCard(trip.notes);
		const cards: Card[] = [...(notesCard ? [notesCard] : []), ...phases.map(phaseCard)];

		cards.push(
			...nightCards(
				nightsOf(days).map((date) => {
					const here = lodgingForNight(items, days, date);
					return {
						date,
						lodging: here.length ? here.map((l) => l.title).join(', ') : 'no lodging'
					};
				})
			)
		);

		if (members.length) {
			cards.push({
				emoji: '👥',
				title: 'Members',
				lines: members.map((m) => `${memberName(m)} · ${m.role.replace('_', '-')}`)
			});
		}

		const statusById = new Map(items.map((i) => [i.id, i.status as ItemStatus]));
		for (const g of goals) {
			const linked = (g.items ?? [])
				.map((id) => statusById.get(id))
				.filter(Boolean) as ItemStatus[];
			const status: GoalStatus = deriveGoalStatus(linked, g.manual_status);
			cards.push({
				emoji: '🎯',
				title: g.title,
				tag: status,
				lines: [stripHtml(g.description ?? '')].filter(Boolean)
			});
		}

		const ideas = items.filter((i) => !i.day);
		const votesBy = new Map<string, Vote[]>();
		for (const v of votes) votesBy.set(v.item, [...(votesBy.get(v.item) ?? []), v]);
		const scores = Object.fromEntries(
			ideas.map((i) => [i.id, scoreVotes(votesBy.get(i.id) ?? [])])
		);
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
				lines: [
					`${EMOJI[i.type] ?? ''} ${i.type}`.trim(),
					total ? `${total} vote${total === 1 ? '' : 's'}: ${breakdown}` : 'no votes'
				]
			});
		}

		return result(`${trip.title} (${ymd(trip.start_date)} → ${ymd(trip.end_date)})`, cards, {
			timezone: trip.timezone
		});
	}
};
