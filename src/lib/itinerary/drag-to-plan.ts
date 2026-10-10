// Drag-to-plan derivation (#445; spec stories 26-30, 83). Pure: which timeline
// slot an idea offers while it is dragged, what the target says, whether the day
// accepts the idea at all, and the rail's Up next rows. No DOM, no I/O.
import { freeTimeGaps, freeTimeLabel, type FreeGap, type CardItemFields } from '$lib/itinerary/card-anatomy';
import { resolveDrop } from '$lib/itinerary/drag-reorder';
import type { DayCardSummary } from '$lib/itinerary/day-card';

/** `Drop to plan · 2h free · 4:30p to 6:30p`, or bare `Drop to plan` with no gap. */
export function dropPrompt(gap: FreeGap | null): string {
	return gap ? `Drop to plan · ${freeTimeLabel(gap)}` : 'Drop to plan';
}

/**
 * The slots an idea can land in: each free gap (>= 60 min), keyed by the timed
 * item that closes it (the same key `freeTimeGaps` uses), with its target text.
 * `items` is the timeline in display order.
 */
export function planDropLabels(items: CardItemFields[]): Map<string, string> {
	const out = new Map<string, string>();
	for (const [id, gap] of freeTimeGaps(items)) out.set(id, dropPrompt(gap));
	return out;
}

/** An idea can be planned on a day when its phase is one of the day's phases (phase is sticky). */
export function canPlanOnDay(ideaPhase: string, dayPhaseIds: string[]): boolean {
	return (
		resolveDrop({
			source: 'parking',
			target: 'timeline',
			item: { phase: ideaPhase, start_time: '' },
			before: null,
			after: null,
			dayPhases: dayPhaseIds
		}).kind === 'pull'
	);
}

/** The day's title: its notes, else its first item (+ N more), else "Nothing planned yet". */
export function dayHeadline(day: { notes?: string }, summary: Pick<DayCardSummary, 'itemCount' | 'leadTitle'>): string {
	const notes = day.notes?.trim();
	if (notes) return notes;
	if (!summary.leadTitle) return 'Nothing planned yet';
	const rest = summary.itemCount - 1;
	return rest > 0 ? `${summary.leadTitle} + ${rest} more` : summary.leadTitle;
}

export interface UpNextRow {
	title: string;
	itemCount: number;
	/** Items still to book: the gold open loop. */
	toBook: number;
	empty: boolean;
}

export function upNextRow(day: { notes?: string }, summary: DayCardSummary | undefined): UpNextRow {
	const s = summary ?? { itemCount: 0, leadTitle: '', needsBookingCount: 0 };
	return {
		title: dayHeadline(day, s),
		itemCount: s.itemCount,
		toBook: s.needsBookingCount,
		empty: !day.notes?.trim() && !s.leadTitle
	};
}
