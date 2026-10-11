// #502 — "what are we missing?": the gaps Waypoint can see on a trip, computed
// from the app's own modules (booking need, codes, overlaps, spans). Pure. It
// reports gaps; it doesn't decide what to do about them.
import type { Day, Item, Task, Trip } from '$lib/types';
import type { Document } from '$lib/documents/types';
import { needsBooking } from '$lib/itinerary/booking-projection';
import { codesForItem } from '$lib/documents/codes';
import { detectOverlaps } from '$lib/itinerary/timeline';
import { itemDateRange, toDateOnly } from '$lib/itinerary/multi-day';

export type CodeDoc = Pick<Document, 'item' | 'code_label' | 'code_value' | 'kind'>;

export interface AuditGap {
	kind: 'no_lodging' | 'unbooked' | 'flight_no_code' | 'overlap' | 'unplaced_idea' | 'open_task';
	title: string;
	date?: string;
	itemId?: string;
}

/** Lodging the group sleeps in on night `date`: a stay whose [start, end) covers it,
 *  or a single-night lodging item placed on that day. */
export function lodgingForNight(items: Item[], days: Day[], date: string): Item[] {
	const dayDate = new Map(days.map((d) => [d.id, toDateOnly(d.date)]));
	return items.filter((l) => {
		if (l.type !== 'lodging' || !l.day) return false;
		const r = itemDateRange(l, days);
		return r ? r.start <= date && date < r.end : dayDate.get(l.day) === date;
	});
}

/** Every trip day but the last is a night. */
export const nightsOf = (days: Day[]) => days.slice(0, -1).map((d) => toDateOnly(d.date));

export function auditTrip(input: { trip: Trip; days: Day[]; items: Item[]; codeDocs: CodeDoc[]; tasks: Task[] }): AuditGap[] {
	const { days, items, codeDocs, tasks } = input;
	const dayDate = new Map(days.map((d) => [d.id, toDateOnly(d.date)]));
	const placed = items.filter((i) => i.day && dayDate.has(i.day));
	const gaps: AuditGap[] = [];

	for (const date of nightsOf(days)) {
		if (!lodgingForNight(items, days, date).length) gaps.push({ kind: 'no_lodging', title: 'No lodging', date });
	}
	for (const i of placed) {
		if (needsBooking(i)) gaps.push({ kind: 'unbooked', title: i.title, date: dayDate.get(i.day), itemId: i.id });
	}
	for (const i of placed) {
		if (i.type === 'flight' && !codesForItem(codeDocs, i.id).length) {
			gaps.push({ kind: 'flight_no_code', title: i.title, date: dayDate.get(i.day), itemId: i.id });
		}
	}
	for (const d of days) {
		const dayItems = placed.filter((i) => i.day === d.id && !itemDateRange(i, days));
		const ids = detectOverlaps(dayItems);
		if (ids.size) {
			const names = dayItems.filter((i) => ids.has(i.id)).map((i) => i.title);
			gaps.push({ kind: 'overlap', title: names.join(' / '), date: toDateOnly(d.date) });
		}
	}
	for (const i of items.filter((x) => !x.day)) gaps.push({ kind: 'unplaced_idea', title: i.title, itemId: i.id });
	for (const t of tasks.filter((x) => !x.checked)) gaps.push({ kind: 'open_task', title: t.title });
	return gaps;
}
