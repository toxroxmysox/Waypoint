// Pure derivations behind the Row (#433; spec §Row, CARD_SYSTEM D11): the sub-line
// per item type, the flight sub-line's overflow rule, and which single value
// sits in the trailing slot. No DOM, no I/O: layout is proven by
// `pnpm verify:visual`, these are the rules it renders.
import { formatClock, formatDayDate, formatTimeText } from '$lib/shell/format';
import { estimateTextWidth } from '$lib/itinerary/card-anatomy';
import type { TimeFields } from '$lib/itinerary/timeline';
import { needsBooking } from '$lib/itinerary/booking-projection';
import type { Day, Item } from '$lib/types';
import type { ItemType } from '$lib/itinerary/types';
import { arrivalKey, arrivalLabel, departureKey, type FlightItemInput } from '$lib/itinerary/flights-lineup';
import { flightPlaceLine } from '$lib/itinerary/flight-place';

const SEP = ' · ';
const dateOnly = (s: string | undefined) => (s ?? '').split(/[T ]/)[0];

/** UTC calendar-day difference b - a (both 'YYYY-MM-DD'); 0 when either is missing. */
function daysBetween(a: string, b: string): number {
	if (!a || !b) return 0;
	return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export interface RowItemFields extends TimeFields {
	type: ItemType;
	end_date?: string;
	location_name?: string;
}

/**
 * The sub-line of a non-flight Row, in the text grammar. A single-day item
 * reads `Thu Oct 1 · 6:30p · Place` (the date leads: Rows sit across days). A
 * multi-day item (lodging with an `end_date`) reads
 * `Thu Oct 1–Sat Oct 3 · 2 nights · Place`. The place is the location, else the
 * phase name. Empty parts are omitted; '' when nothing is known.
 */
export function rowSub(item: RowItemFields, ctx: { dayDate?: string; phaseName?: string } = {}): string {
	const start = dateOnly(ctx.dayDate);
	const end = dateOnly(item.end_date);
	const place = item.location_name?.trim() || ctx.phaseName?.trim() || '';
	const parts: string[] = [];
	const nights = daysBetween(start, end);
	if (start && end && nights > 0) {
		parts.push(`${formatDayDate(start)}–${formatDayDate(end)}`, `${nights} night${nights === 1 ? '' : 's'}`);
	} else {
		parts.push(formatTimeText(item, { date: start }));
	}
	parts.push(place);
	return parts.filter(Boolean).join(SEP);
}

// --- Flights ----------------------------------------------------------------
const AIRPORT = /\(([A-Z0-9]{3,4})\)/;

/** `MKE → DEN` from the airport codes in the two labels; else the labels; else whichever exists. */
export function flightRoute(from: string, to: string): string {
	const f = from.trim();
	const t = to.trim();
	const fc = AIRPORT.exec(f)?.[1];
	const tc = AIRPORT.exec(t)?.[1];
	if (fc && tc) return `${fc} → ${tc}`;
	return [f, t].filter(Boolean).join(' → ');
}

export interface FlightSub {
	/** `Thu Oct 1`, the departure day. */
	date: string;
	/** `2:05p`; '' when no clock is stored. */
	dep: string;
	/** `4:20p`, `6:10a +1` (a later day), or the arrival date for a clock-less red-eye. */
	arr: string;
	route: string;
}

/**
 * Split a flight into the four parts of its sub-line. `departure` / `arrival` are
 * the lineup's keys: 'YYYY-MM-DD HH:MM', a bare 'YYYY-MM-DD', or ''.
 */
export function flightSub(input: { departure: string; arrival: string; from: string; to: string }): FlightSub {
	const depDate = dateOnly(input.departure);
	const arrDate = dateOnly(input.arrival);
	const depClock = formatClock(input.departure);
	const arrClock = formatClock(input.arrival);
	const later = daysBetween(depDate, arrDate);
	const arr = arrClock
		? `${arrClock}${later > 0 ? ` +${later}` : ''}`
		: arrDate && arrDate !== depDate
			? formatDayDate(arrDate)
			: '';
	return { date: formatDayDate(depDate), dep: depClock, arr, route: flightRoute(input.from, input.to) };
}

export type FlightDrop = 'arr' | 'dep' | 'date';
/** Arrival time goes first so the route survives; then the departure time; then the date. */
const DROP_ORDER: FlightDrop[] = ['arr', 'dep', 'date'];

function flightSubText(sub: FlightSub, dropped: FlightDrop[]): string {
	const dep = dropped.includes('dep') ? '' : sub.dep;
	const arr = dropped.includes('arr') ? '' : sub.arr;
	const times = dep && arr ? `${dep} → ${arr}` : dep || (arr ? `arrives ${arr}` : '');
	return [dropped.includes('date') ? '' : sub.date, times, sub.route].filter(Boolean).join(SEP);
}

/**
 * The flight sub-line that fits `available` px. While it doesn't fit, parts drop
 * in order: arrival time, departure time, date. The route never drops (CSS
 * truncates it last). `measure` is injectable for tests; the default is the
 * Card strip's estimate at the Row's 12px sub-line.
 */
export function fitFlightSub(
	sub: FlightSub,
	available: number,
	measure: (text: string) => number = (t) => estimateTextWidth(t, 12)
): { text: string; dropped: FlightDrop[] } {
	const dropped: FlightDrop[] = [];
	for (const part of DROP_ORDER) {
		if (measure(flightSubText(sub, dropped)) <= available) break;
		if (sub[part]) dropped.push(part);
	}
	return { text: flightSubText(sub, dropped), dropped };
}

// --- Trailing slot ----------------------------------------------------------
export type RowTrailingKind = 'chip' | 'cost' | 'people' | 'chevron';

/**
 * The one value in the trailing slot: a chip (an open loop or a confirmation)
 * beats a cost, which beats people bubbles; with none, the chevron says "opens".
 */
export function rowTrailing(input: { chip?: string; cost?: number; people?: number }): RowTrailingKind {
	if (input.chip) return 'chip';
	if ((input.cost ?? 0) > 0) return 'cost';
	if ((input.people ?? 0) > 0) return 'people';
	return 'chevron';
}

// --- One call per item ------------------------------------------------------
/** The fields `rowContent` reads; any Item satisfies it. */
export type RowContentItem = RowItemFields & { description?: string; title?: string; flight_number?: string };

/**
 * What a Row shows under the title: a flight's four parts (the Row fits them to
 * its width) plus their full text as the fallback, or the plain `sub` text for
 * every other type. `dayDate` is the owning day's calendar date.
 */
export function rowContent(
	item: RowContentItem,
	ctx: { dayDate?: string; phaseName?: string } = {}
): { sub: string; flight: FlightSub | null } {
	if (item.type !== 'flight') return { sub: rowSub(item, ctx), flight: null };
	const input = { ...item, dayDate: ctx.dayDate ?? '' } as FlightItemInput;
	const flight = flightSub({
		departure: departureKey(input),
		arrival: arrivalKey(input),
		from: item.location_name ?? '',
		to: arrivalLabel(item.description ?? '')
	});
	// #435 — the number leads the route only for flights whose title lacks it.
	const placed = {
		...flight,
		route: flightPlaceLine({ title: item.title ?? '', flight_number: item.flight_number, route: flight.route })
	};
	return { sub: fitFlightSub(placed, Number.POSITIVE_INFINITY).text, flight: placed };
}

// --- The overview's Flights & stays ------------------------------------------
export type KeyItem = RowContentItem &
	Pick<Item, 'id' | 'title' | 'subtype' | 'day' | 'status' | 'booked' | 'requires_booking'>;

export interface KeyItemRow {
	id: string;
	type: ItemType;
	subtype: string;
	title: string;
	sub: string;
	flight: FlightSub | null;
	/** The trailing chip: gold `Needs booking` when the loop is open. */
	needsBooking: boolean;
}

/**
 * Flights and stays as Rows, in date order (undated last, then by start time),
 * with whether each still needs booking. Pure: the loader hands in the fetched
 * items and the trip's days.
 */
export function keyItemRows(items: KeyItem[], days: Pick<Day, 'id' | 'date'>[]): KeyItemRow[] {
	return items
		.filter((i) => i.type === 'flight' || i.type === 'lodging')
		.map((i) => {
			const dayDate = i.day ? dateOnly(days.find((d) => d.id === i.day)?.date) : '';
			return { i, dayDate, start: i.start_time ?? '' };
		})
		.sort(
			(a, b) =>
				Number(!a.dayDate) - Number(!b.dayDate) ||
				a.dayDate.localeCompare(b.dayDate) ||
				Number(!a.start) - Number(!b.start) ||
				a.start.localeCompare(b.start) ||
				a.i.title.localeCompare(b.i.title)
		)
		.map(({ i, dayDate }) => ({
			id: i.id,
			type: i.type,
			subtype: i.subtype ?? '',
			title: i.title,
			...rowContent(i, { dayDate }),
			needsBooking: needsBooking(i)
		}));
}
