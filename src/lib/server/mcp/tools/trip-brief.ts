import { z } from 'zod';
import type { Item, Phase } from '$lib/types';
import { formatClock, formatTimeText } from '$lib/shell/format';
import { tripNow, tripTz } from '$lib/shell/trip-time';
import { primaryPhaseForDay } from '$lib/itinerary/phases';
import { toDateOnly } from '$lib/itinerary/multi-day';
import { codesForItem } from '$lib/documents/codes';
import { getNowFeed } from '$lib/trip-mode/now-state';
import { isSpanning } from '$lib/trip-mode/spanning';
import { currentPhaseId } from '$lib/trip-mode/current-phase';
import { myTrips, resolveTrip, type TripRef } from '../context';
import { dayFrom, dayHeading, loadTripDays, loadTripItems, resolveDate } from '../day-data';
import { lodgingForNight, type CodeDoc } from '../audit';
import { offTrip, result, ymd, EMOJI, type Card } from '../present';
import type { ToolDef } from './types';

// #502 — the Now page, as text: where the group is, what's on now and next today,
// where they sleep tonight, and the codes for today's and tomorrow's bookings.
// Composition only: the Now buckets, the live phase and the nights come from the
// modules the Now page uses.

/** The open-or-not trip today falls in, else the next to start. */
async function defaultTrip(ctx: Parameters<ToolDef['run']>[0]): Promise<TripRef> {
	const trips = await myTrips(ctx);
	const today = (t: TripRef) => resolveDate(tripTz(t.trip), 'today', ctx.now);
	const current = trips.find(
		(t) =>
			t.trip.start_date && ymd(t.trip.start_date) <= today(t) && today(t) <= ymd(t.trip.end_date)
	);
	if (current) return current;
	const next = trips
		.filter((t) => t.trip.start_date && ymd(t.trip.start_date) > today(t))
		.sort((a, b) => a.trip.start_date.localeCompare(b.trip.start_date))[0];
	if (next) return next;
	throw new Error('You have no trip happening now or coming up. Name a trip to brief.');
}

const line = (i: Item) => [formatTimeText(i), i.title].filter(Boolean).join(' · ');

export const tripBrief: ToolDef = {
	name: 'trip_brief',
	title: 'Trip brief',
	description:
		"Right now on a trip, in its local time: the current place, what's happening now and next today, " +
		"tonight's lodging with its address, and confirmation codes for today's and tomorrow's bookings. " +
		'Without `trip`, briefs the trip happening now, else the next one coming up. Before a trip starts it briefs day one.',
	inputSchema: {
		trip: z
			.string()
			.optional()
			.describe('Trip slug, or part of its title (default: the current or next trip)')
	},
	async run(ctx, { trip: ref }: { trip?: string }) {
		const t = ref?.trim() ? await resolveTrip(ctx, ref) : await defaultTrip(ctx);
		if (!t.open) return offTrip(t.trip);
		const trip = t.trip;
		const tz = tripTz(trip);
		const today = resolveDate(tz, 'today', ctx.now);
		const start = ymd(trip.start_date);
		const end = ymd(trip.end_date);
		if (start && today > end) {
			return result(trip.title, [], {
				note: `This trip ended on ${end}. Ask about a day or search it instead.`
			});
		}
		const upcoming = !start || today < start;
		const date = upcoming ? start : today;

		const [days, items, phases, codeDocs] = await Promise.all([
			loadTripDays(ctx, trip),
			loadTripItems(ctx, trip),
			ctx.pb.collection('phases').getFullList<Phase>({
				filter: ctx.pb.filter('trip = {:t}', { t: trip.id }),
				fields: 'id,name,location,start_date,end_date,order',
				sort: 'order',
				requestKey: null
			}),
			ctx.pb.collection('documents').getFullList<CodeDoc>({
				filter: ctx.pb.filter('trip = {:t} && kind = "code"', { t: trip.id }),
				fields: 'id,item,kind,code_label,code_value',
				sort: 'created',
				requestKey: null
			})
		]);
		const d = dayFrom(days, items, date);
		if (!d.day) return result(trip.title, [], { note: 'This trip has no days yet.' });

		const cards: Card[] = [];
		const discrete = d.items.filter((i) => !isSpanning(i));
		// Before the trip, day one is shown whole: nothing has started yet.
		const now = upcoming ? new Date(`${date}T00:00:00Z`) : tripNow(tz, ctx.now);
		const feed = getNowFeed(discrete, now, true, t.memberId);

		const forward = items
			.filter(
				(i) =>
					i.day &&
					i.day !== d.day!.id &&
					!isSpanning(i) &&
					i.start_time &&
					toDateOnly(i.start_time) > date
			)
			.sort((a, b) => a.start_time.localeCompare(b.start_time));
		const fallback = primaryPhaseForDay(d.day, phases)?.id ?? '';
		const phase = phases.find(
			(p) =>
				p.id ===
				currentPhaseId({
					todayItems: discrete,
					now,
					forwardItems: forward,
					fallbackPhaseId: fallback
				})
		);
		cards.push({
			emoji: '📍',
			title: phase ? phase.location || phase.name : trip.location_summary || trip.title,
			tag: upcoming ? `starts ${start}` : 'now',
			lines: [
				phase && phase.location && phase.name !== phase.location ? phase.name : '',
				dayHeading(trip, date)
			].filter(Boolean)
		});

		const focus = feed.focus;
		if (focus.kind === 'mid-event') {
			cards.push({
				emoji: '⏱️',
				title: 'Happening now',
				lines: focus.heroes.map(
					(i) => `${i.title}${i.end_time ? ` · until ${formatClock(i.end_time)}` : ''}`
				)
			});
		}
		const next = feed.restItems;
		cards.push({
			emoji: '➡️',
			title: upcoming ? 'Day one' : 'Next today',
			lines: next.length
				? next.map(line)
				: [
						focus.kind === 'wrapped-summary'
							? "That's the day: nothing else planned."
							: 'Nothing else planned today.'
					]
		});

		const tonight = lodgingForNight(items, days, date);
		cards.push(
			tonight.length
				? {
						emoji: EMOJI.lodging,
						title: `Tonight: ${tonight.map((l) => l.title).join(', ')}`,
						tag: tonight.every((l) => l.booked) ? 'booked' : undefined,
						lines: tonight.map((l) => l.location_address || l.location_name).filter(Boolean)
					}
				: {
						emoji: EMOJI.lodging,
						title: 'Tonight',
						lines: [date === end ? 'Last day: no night here.' : 'No lodging recorded for tonight.']
					}
		);

		const next1 = new Date(`${date}T00:00:00Z`);
		next1.setUTCDate(next1.getUTCDate() + 1);
		const tomorrow = dayFrom(days, items, next1.toISOString().slice(0, 10));
		const withCodes = [...tonight, ...d.items, ...tomorrow.items]
			.filter((i, n, all) => all.findIndex((x) => x.id === i.id) === n)
			.map((i) => ({ i, codes: codesForItem(codeDocs, i.id) }))
			.filter((x) => x.codes.length);
		if (withCodes.length) {
			cards.push({
				emoji: '🔖',
				title: 'Confirmation codes',
				lines: withCodes.flatMap(({ i, codes }) =>
					codes.map((c) => `${i.title} · ${c.label || 'Code'}: ${c.value}`)
				)
			});
		}
		return result(`${trip.title} · brief`, cards, { date, timezone: tz });
	}
};
