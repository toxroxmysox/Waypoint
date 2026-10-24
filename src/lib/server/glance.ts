// Token-gated "at a glance" numbers for the Homepage dashboard tile.
import { timingSafeEqual, createHash } from 'node:crypto';

export type GlanceTrip = { id: string; start: string; end: string };

const dayNum = (d: string) =>
	Math.floor(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000);

/** Trips overlapping today's year; days = distinct dates from Jan 1 through today (inclusive) covered by any trip. */
export function computeGlance(
	trips: GlanceTrip[],
	itemCountByTrip: Map<string, number>,
	today: string
) {
	const year = +today.slice(0, 4);
	const yStart = `${year}-01-01`;
	const yEnd = `${year}-12-31`;
	const lo = dayNum(yStart);
	const hi = dayNum(today);
	const days = new Set<number>();
	let count = 0;
	let items = 0;
	for (const t of trips) {
		if (t.start > yEnd || t.end < yStart) continue;
		count++;
		items += itemCountByTrip.get(t.id) ?? 0;
		const from = Math.max(dayNum(t.start), lo);
		const to = Math.min(dayNum(t.end), hi);
		for (let d = from; d <= to; d++) days.add(d);
	}
	return { year, trips: count, days: days.size, items };
}

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Constant-time Bearer check; false when no token is configured. */
export function checkGlanceToken(header: string | null, expected: string | undefined): boolean {
	if (!expected) return false;
	const given = header?.startsWith('Bearer ') ? header.slice(7) : '';
	const ok = timingSafeEqual(digest(given), digest(expected));
	return ok && given.length > 0;
}
