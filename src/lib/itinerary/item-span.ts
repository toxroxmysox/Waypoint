/**
 * #411 — the span rule items.pb.js enforces on every item save: an `end_date`
 * needs a start day, falls strictly after it, and on/before the trip end.
 * Writers that copy a span from elsewhere (clone, import) run it through here so
 * a span that can't hold is dropped instead of failing the write mid-way.
 * Inputs may be 'YYYY-MM-DD' or PB datetimes; returns the span unchanged or ''.
 */
export function sanitizeItemSpan(
	dayDate: string | null | undefined,
	endDate: string | null | undefined,
	tripEnd: string | null | undefined
): string {
	const end = String(endDate || '');
	const e = end.slice(0, 10);
	const d = String(dayDate || '').slice(0, 10);
	const t = String(tripEnd || '').slice(0, 10);
	if (!e || !d || e <= d) return '';
	if (t && e > t) return '';
	return end;
}
