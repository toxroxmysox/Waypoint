import type { Item, Day, Phase } from '$lib/types';
import type { DayCardSummary } from './day-card';
import { toDateOnly } from './multi-day';
import { coversNight } from './lodging-nights';
import { formatCalendarDate } from '$lib/shell/format';

// #401 — Phase Detail's In / Staying / Out answers and the "On which day?" menu.
// Arrival = getting-in transport on the phase's first day; Departure = on its
// last day. A Travel Day is shared, so one train is both a phase's Departure and
// the next phase's Arrival. Multi-day transport (a rental car) counts on its
// start day; lodging is never an Arrival/Departure — it is Staying.

const MOVING: ReadonlySet<string> = new Set(['transportation', 'flight']);

function startDateOf(item: Item, dayById: Map<string, Day>): string {
	const d = item.day ? dayById.get(item.day) : undefined;
	return d ? toDateOnly(d.date) : '';
}

function movingOn(items: Item[], days: Day[], date: string): Item[] {
	const dayById = new Map(days.map((d) => [d.id, d]));
	return items
		.filter(
			(i) =>
				MOVING.has(i.type) && i.status !== 'considered' && date && startDateOf(i, dayById) === date
		)
		.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
}

export function phaseArrival(items: Item[], days: Day[], phase: Phase): Item[] {
	return movingOn(items, days, toDateOnly(phase.start_date));
}

export function phaseDeparture(items: Item[], days: Day[], phase: Phase): Item[] {
	return movingOn(items, days, toDateOnly(phase.end_date));
}

export interface StayLine {
	item: Item;
	nights: number;
}

export interface PhaseStaying {
	lines: StayLine[];
	coveredNights: number;
	totalNights: number;
}

function addDays(date: string, n: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

/**
 * Lodging covering at least one of the phase's nights, by the shared night rule
 * (lodging-nights.ts, #537). A phase's nights are its first day up to (not
 * including) its last day.
 */
export function phaseStaying(items: Item[], days: Day[], phase: Phase): PhaseStaying {
	const start = toDateOnly(phase.start_date);
	const end = toDateOnly(phase.end_date);
	const nights: string[] = [];
	if (start && end) for (let d = start; d < end; d = addDays(d, 1)) nights.push(d);

	const dayById = new Map(days.map((d) => [d.id, d]));
	const lines: StayLine[] = [];
	const covered = new Set<string>();
	const lodging = items
		.filter((i) => i.type === 'lodging')
		.map((i) => ({ item: i, from: startDateOf(i, dayById) }))
		.sort((a, b) => a.from.localeCompare(b.from));
	for (const s of lodging) {
		const mine = nights.filter((n) => coversNight(s.item, days, n));
		if (!mine.length) continue;
		mine.forEach((n) => covered.add(n));
		lines.push({ item: s.item, nights: mine.length });
	}
	return { lines, coveredNights: covered.size, totalNights: nights.length };
}

export interface DayMenuRow {
	dayId: string;
	/** `Thu 18` */
	label: string;
	/** `empty` / `1 item` / `3 items` */
	fullness: string;
	/** A Travel Day: the day belongs to more than one phase. */
	travel: boolean;
}

export function dayMenuRows(
	phaseDays: Day[],
	summaries: Record<string, DayCardSummary>
): DayMenuRow[] {
	return [...phaseDays]
		.sort((a, b) => toDateOnly(a.date).localeCompare(toDateOnly(b.date)))
		.map((day) => {
			const n = summaries[day.id]?.itemCount ?? 0;
			const label = `${formatCalendarDate(day.date, { weekday: 'short' })} ${formatCalendarDate(day.date, { day: 'numeric' })}`;
			return {
				dayId: day.id,
				label,
				fullness: n === 0 ? 'empty' : `${n} item${n === 1 ? '' : 's'}`,
				travel: (day.phases?.length ?? 0) > 1
			};
		});
}
