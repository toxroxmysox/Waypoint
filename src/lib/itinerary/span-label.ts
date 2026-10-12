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
