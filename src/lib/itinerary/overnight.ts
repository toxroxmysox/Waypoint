// #538 — a red-eye on the Day page. A flight that lands on a later day (FlightLookup
// sets `end_date`) is still one timed item (#498): a card on BOTH days. The departure
// day places it by take-off as usual; the landing day places it by landing time and
// does not let anyone drag it, since the item belongs to the departure day.
import { formatClock, formatDayDate } from '$lib/shell/format';
import type { ItemType } from '$lib/itinerary/types';

interface FlightFields {
	type: ItemType;
	start_time?: string;
	end_time?: string;
	end_date?: string;
}

/** A flight that lands on a later calendar day than it departs. */
export function isOvernightFlight(item: FlightFields): boolean {
	return item.type === 'flight' && !!item.end_date && item.end_date.trim() !== '';
}

/**
 * The item as the landing day's timeline sees it: no start, so it is an end-only
 * item anchored AT its landing time. Ordering, the Morning/Afternoon/Evening
 * bucket, free-time gaps and overlaps then all read the landing clock, not
 * yesterday's take-off.
 */
export function landingView<T extends FlightFields>(item: T): T {
	return { ...item, start_time: '' };
}

const ymd = (s: string | undefined) => (s ?? '').slice(0, 10);

function daysBetween(from: string, to: string): number {
	const a = Date.parse(`${ymd(from)}T00:00:00Z`);
	const b = Date.parse(`${ymd(to)}T00:00:00Z`);
	return Number.isNaN(a) || Number.isNaN(b) ? 0 : Math.round((b - a) / 86_400_000);
}

/** `tomorrow` / `yesterday` for one day apart, else the calendar day (`Tue Oct 27`). */
function relativeDay(from: string, to: string, dir: 'next' | 'prev'): string {
	if (daysBetween(from, to) === 1) return dir === 'next' ? 'tomorrow' : 'yesterday';
	return formatDayDate(ymd(dir === 'next' ? to : from));
}

export interface OvernightNote {
	/** The card line: `Lands tomorrow 6:40a` / `Lands 6:40a · departed yesterday`. */
	text: string;
	/** Leads the card's accessible name in place of the time. */
	spoken: string;
}

/**
 * The card line that tells the two cards apart. `placement` is which day is
 * showing it: `departure` (its own day) or `landing` (a later day).
 * The departure date is the start_time's date; the landing date is `end_date`.
 */
export function overnightNote(
	item: FlightFields,
	placement: 'departure' | 'landing'
): OvernightNote | null {
	if (!isOvernightFlight(item)) return null;
	const departed = item.start_time ?? '';
	const clock = formatClock(item.end_time ?? ''); // 6:40a
	const said = clock ? `${clock.slice(0, -1)} ${clock.endsWith('p') ? 'PM' : 'AM'}` : '';
	const landDay = item.end_date ?? '';
	if (placement === 'departure') {
		const when = relativeDay(departed, landDay, 'next');
		return {
			text: clock ? `Lands ${when} ${clock}` : `Lands ${when}`,
			spoken: said ? `lands ${when} ${said}` : `lands ${when}`
		};
	}
	const when = departed ? relativeDay(departed, landDay, 'prev') : '';
	const tail = when ? `departed ${when}` : '';
	return {
		text: [clock ? `Lands ${clock}` : 'Lands today', tail].filter(Boolean).join(' · '),
		spoken: [said ? `lands ${said}` : 'lands today', tail].filter(Boolean).join(', ')
	};
}
