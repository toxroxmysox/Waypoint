import type { Trip, Phase, Day, Item, Expense } from '$lib/types';

/**
 * The opt-in public budget SUMMARY (#243). A summary ONLY — trip total + rough
 * per-person — never itemized expenses or who-owes-whom (those stay members-only).
 * Total = sum of actual logged `amount_usd` across all expenses. Per-person = total ÷
 * active member count (rounded to whole dollars — "rough"). A zero/empty roster or no
 * expenses yields a $0 summary rather than a divide-by-zero.
 */
export function archiveBudgetSummary(
	expenses: Expense[],
	memberCount: number
): { total: number; perPerson: number } {
	const total = expenses.reduce((sum, e) => sum + (e.amount_usd || 0), 0);
	const perPerson = memberCount > 0 ? Math.round(total / memberCount) : 0;
	return { total: Math.round(total), perPerson };
}

// Pure builder for the Public Archive view model (ADR-0003 §7). Checklists and
// Tasks are deliberately NOT inputs here — the archive excludes operational
// scaffolding + assignee PII. Items are sanitized to display fields only
// (no booked/assignee/costs/confirmation codes).
//
// #243: when the owner has opted in (`trip.archive_show_budget`), the view carries a
// budget SUMMARY (total + rough per-person) — computed from `opts.expenses` /
// `opts.memberCount` — and NOTHING else money-related. When the flag is off (default)
// or the inputs are absent, `budgetSummary` is null and no money data is emitted.
export function buildArchiveView(
	trip: Trip,
	phases: Phase[],
	days: Day[],
	items: Item[],
	opts: { expenses?: Expense[]; memberCount?: number } = {}
) {
	const sanitizedItems = items.map((item) => ({
		id: item.id,
		day: item.day,
		phase: item.phase,
		type: item.type,
		subtype: item.subtype,
		title: item.title,
		description: item.description,
		location_name: item.location_name,
		location_address: item.location_address,
		start_time: item.start_time,
		end_time: item.end_time,
		status: item.status
	}));

	// Opt-in budget summary (#243). Default off → null. Only the aggregate total +
	// rough per-person are ever surfaced publicly; itemized expenses never reach here.
	const budgetSummary =
		trip.archive_show_budget && opts.expenses
			? archiveBudgetSummary(opts.expenses, opts.memberCount ?? 0)
			: null;

	return {
		trip: {
			title: trip.title,
			start_date: trip.start_date,
			end_date: trip.end_date,
			timezone: trip.timezone,
			location_summary: trip.location_summary,
			countries: trip.countries,
			photo_album_url: trip.photo_album_url
		},
		phases,
		days,
		doneItems: sanitizedItems.filter((i) => i.status === 'done'),
		// Planned-leak guard (#240, Grill Resolution #16): "what we considered" is the
		// public recommendations list — explicitly-`considered` items only (which now
		// INCLUDES kept parking-lot ideas: the owner ideas-review step marks a kept idea
		// `considered`, so it flows through here, #243), NEVER stray `planned`. A planned
		// item that never got walked must not masquerade as something the group weighed.
		consideredItems: sanitizedItems.filter((i) => i.status === 'considered'),
		// Opt-in public budget summary (#243): { total, perPerson } or null (default).
		budgetSummary
	};
}
