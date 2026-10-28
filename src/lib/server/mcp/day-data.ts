// #502 — one trip day as the app shows it: the stays spanning it (span-band text),
// its items in the app's timeline order, its notes. Shared by get_day and
// trip_brief. All times are trip-local wall clock, as stored.
import type { Day, Item, Trip } from '$lib/types';
import { tripToday } from '$lib/shell/trip-time';
import { formatDayDate, formatTimeText } from '$lib/shell/format';
import { orderDayItems } from '$lib/itinerary/timeline';
import { spanBandText, spanningItemsForDate, toDateOnly } from '$lib/itinerary/multi-day';
import { isOvernightFlight, landingView, overnightNote } from '$lib/itinerary/overnight';
import { isSpanning } from '$lib/trip-mode/spanning';
import type { McpContext } from './context';
import { EMOJI, stripHtml, type Card } from './present';

// ADR-0024 §5 layer 1: items carry no file fields; this is still an allowlist.
export const ITEM_FIELDS = [
	'id',
	'trip',
	'phase',
	'day',
	'type',
	'subtype',
	'title',
	'description',
	'location_name',
	'location_address',
	'start_time',
	'end_time',
	'end_date',
	'status',
	'rating',
	'booked',
	'requires_booking',
	'cost_estimate_usd',
	'assigned_to',
	'not_going',
	'sort_order',
	'flight_number',
	'created',
	'updated'
].join(',');

const shift = (ymd: string, n: number) => {
	const d = new Date(ymd + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
};

/** 'today' | 'tomorrow' | 'yesterday' | YYYY-MM-DD → YYYY-MM-DD, trip-local. */
export function resolveDate(tz: string, date: string, now: Date): string {
	const d = (date || 'today').trim().toLowerCase();
	let safeTz = tz;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
	} catch {
		safeTz = 'UTC';
	}
	const today = tripToday(safeTz, now);
	if (d === 'today') return today;
	if (d === 'tomorrow') return shift(today, 1);
	if (d === 'yesterday') return shift(today, -1);
	if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
	throw new Error(
		`Use a date as YYYY-MM-DD, or "today", "tomorrow" or "yesterday" (got "${date}").`
	);
}

export async function loadTripDays(ctx: McpContext, trip: Trip): Promise<Day[]> {
	return ctx.pb.collection('days').getFullList<Day>({
		filter: ctx.pb.filter('trip = {:t}', { t: trip.id }),
		fields: 'id,trip,date,notes,phases',
		sort: 'date',
		requestKey: null
	});
}

export async function loadTripItems(ctx: McpContext, trip: Trip): Promise<Item[]> {
	return ctx.pb.collection('items').getFullList<Item>({
		filter: ctx.pb.filter('trip = {:t}', { t: trip.id }),
		fields: ITEM_FIELDS,
		requestKey: null
	});
}

export interface DayData {
	date: string;
	day: Day | null;
	days: Day[];
	stays: Item[];
	items: Item[];
	notes: string;
}

export async function loadDay(ctx: McpContext, trip: Trip, date: string): Promise<DayData> {
	const [days, all] = await Promise.all([loadTripDays(ctx, trip), loadTripItems(ctx, trip)]);
	return dayFrom(days, all, date);
}

/** Pure part of loadDay, for callers that already hold the trip's days + items. */
export function dayFrom(days: Day[], all: Item[], date: string): DayData {
	const day = days.find((d) => toDateOnly(d.date) === date) ?? null;
	if (!day) return { date, day: null, days, stays: [], items: [], notes: '' };
	// #538 — a red-eye is an item on both days (as on the Day page and Now), never a
	// stay. On its landing day it's ordered by landing time.
	const stays = spanningItemsForDate(all.filter(isSpanning), days, date);
	const stayIds = new Set(stays.map((s) => s.id));
	const own = all.filter((i) => i.day === day.id && !isSpanning(i) && !stayIds.has(i.id));
	const landing = all.filter(
		(i) => i.day !== day.id && isOvernightFlight(i) && toDateOnly(i.end_date!) === date
	);
	const byId = new Map(all.map((i) => [i.id, i]));
	const items = orderDayItems([...own, ...landing.map(landingView)]).map((i) => byId.get(i.id)!);
	return { date, day, days, stays, items, notes: stripHtml(day.notes ?? '') };
}

const RATING_TEXT: Record<string, string> = {
	recommend: 'Recommended',
	not_recommend: 'Not recommended'
};

/** #576 — a stay's name with its closeout rating, for get_trip's nights. */
export const stayLabel = (s: Pick<Item, 'title' | 'rating'>) =>
	[s.title, RATING_TEXT[s.rating ?? '']].filter(Boolean).join(' · ');

export function itemCard(i: Item, date?: string): Card {
	return {
		emoji: EMOJI[i.type] ?? '•',
		title: i.title,
		tag: i.booked ? 'booked' : i.requires_booking ? 'not booked' : undefined,
		lines: [
			formatTimeText(i, { date }),
			i.location_name || i.location_address,
			// #576 — closeout rating, as words.
			RATING_TEXT[i.rating ?? '']
		].filter(Boolean) as string[]
	};
}

export function dayCards(d: DayData): Card[] {
	const stays: Card[] = d.stays.map((s) => ({
		emoji: EMOJI[s.type] ?? '•',
		title: s.title,
		tag: s.booked ? 'booked' : undefined,
		lines: [
			spanBandText(s, d.days, d.date)?.text ?? '',
			s.location_name || s.location_address,
			// #576 — a stay's rating, as on itemCard.
			RATING_TEXT[s.rating ?? '']
		].filter(Boolean) as string[]
	}));
	const cards = [
		...stays,
		...d.items.map((i) => {
			const c = itemCard(i);
			const note = overnightNote(i, i.day === d.day?.id ? 'departure' : 'landing');
			if (note) c.lines.splice(1, 0, note.text);
			return c;
		})
	];
	if (d.notes) cards.push({ emoji: '📝', title: 'Day notes', lines: [d.notes] });
	return cards;
}

export const dayHeading = (trip: Trip, date: string) => `${trip.title} · ${formatDayDate(date)}`;
