import { toDateOnly } from './multi-day';

/**
 * #401 — the span copy every level header uses: `5 days · 4 nights`, `1 day`,
 * and for a trip ` · 3 phases`. Calendar-date math in UTC (stored days are UTC
 * midnight). Empty dates → ''.
 */
export function spanLabel(start: string, end: string, phaseCount?: number): string {
	const s = toDateOnly(start);
	const e = toDateOnly(end);
	if (!s || !e) return '';
	const ms = new Date(`${e}T00:00:00Z`).getTime() - new Date(`${s}T00:00:00Z`).getTime();
	const days = Math.max(1, Math.round(ms / 86_400_000) + 1);
	const nights = days - 1;
	let out = days === 1 ? '1 day' : `${days} days · ${nights} night${nights === 1 ? '' : 's'}`;
	if (phaseCount !== undefined) out += ` · ${phaseCount} phase${phaseCount === 1 ? '' : 's'}`;
	return out;
}

/**
 * #401 review — the dates a Level Header states before its span: `Nov 18 – 22`,
 * `Nov 28 – Dec 2`, `Nov 18`; with `year`, `Nov 18 – 24, 2027` (each side gets its
 * year when they differ). Calendar dates, formatted in UTC. Empty → ''.
 */
export function dateRangeLabel(start: string, end: string, opts: { year?: boolean } = {}): string {
	const s = toDateOnly(start);
	const e = toDateOnly(end);
	if (!s || !e) return '';
	const fmt = (d: string, o: Intl.DateTimeFormatOptions) =>
		new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { ...o, timeZone: 'UTC' });
	const md = (d: string) => fmt(d, { month: 'short', day: 'numeric' });
	const year = (d: string) => d.slice(0, 4);
	if (s === e) return opts.year ? `${md(s)}, ${year(s)}` : md(s);
	if (opts.year && year(s) !== year(e)) return `${md(s)}, ${year(s)} – ${md(e)}, ${year(e)}`;
	const right = s.slice(0, 7) === e.slice(0, 7) ? fmt(e, { day: 'numeric' }) : md(e);
	return `${md(s)} – ${right}${opts.year ? `, ${year(e)}` : ''}`;
}
