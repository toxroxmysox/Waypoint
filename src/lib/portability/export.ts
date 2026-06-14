import type {
	Trip,
	Phase,
	Day,
	Item,
	Checklist,
	Task,
	TripMember,
	Expense,
	Settlement,
	TripGoal,
	GoalVote,
	TripExport
} from '$lib/types';

/**
 * EXPORT COVERAGE — what a Waypoint export contains, and why (#174, finding WP-B-016).
 *
 * Two tiers, because import re-creates a trip under ONE owner (the importer) and
 * never reconstructs the member roster:
 *
 *  Restored on import (structural / plan — no member-id foreign keys):
 *    • trip, phases, days, items
 *    • manual trip/phase-scoped checklists + tasks (item-scoped + smart lists excluded)
 *    • budget (category targets)
 *
 *  Snapshot only — exported for the record, deliberately NOT restored on import:
 *    • members (display_name + role; a human key for the refs below — no user id / email)
 *    • expenses, settlements (the money ledger)
 *    • goals + their votes (group input)
 *  These all key members by id. A single-owner re-import can't rebuild the roster,
 *  so re-linking would mis-attribute money/votes. Same reason checklist `assignee`
 *  is stripped. The kept file is therefore a complete BACKUP OF RECORD; import is a
 *  structural/plan restore. (Archive export — #208 — is deferred and builds on this.)
 *
 *  Out entirely: item-level votes, documents/files, suggestion queue, sensitive
 *  tokens (public_share_token), assignees.
 *
 * DATE FORMAT (the round-trip bug): PocketBase stores dates as full datetimes
 * (`YYYY-MM-DD 00:00:00.000Z`). Import appends `' 00:00:00.000Z'` to the
 * date-only calendar fields, so the export MUST emit those as bare `YYYY-MM-DD`
 * — otherwise the concatenation doubles up into an invalid datetime and PB 400s
 * the whole import. `toDateOnly` enforces that for every calendar-date field
 * (trip/phase start/end, day.date, item.day_date, expense/settlement date).
 * Wall-clock datetime fields (item.start_time/end_time/end_date) are passed
 * through verbatim — import does not concatenate those.
 */

/** Slice any date / datetime string down to the bare `YYYY-MM-DD` calendar date. */
function toDateOnly(value: string | null | undefined): string {
	if (!value) return '';
	return value.slice(0, 10);
}

export function buildTripExport(
	trip: Trip,
	phases: Phase[],
	days: Day[],
	items: Item[],
	budget: TripExport['budget'],
	checklists: Checklist[] = [],
	checklistTasks: Task[] = [],
	members: TripMember[] = [],
	expenses: Expense[] = [],
	settlements: Settlement[] = [],
	goals: TripGoal[] = [],
	goalVotes: GoalVote[] = []
): TripExport {
	const phaseMap = new Map(phases.map((p) => [p.id, p]));
	const dayMap = new Map(days.map((d) => [d.id, d]));

	return {
		_waypoint_version: 1,
		exported_at: new Date().toISOString(),
		trip: {
			title: trip.title,
			slug: trip.slug,
			start_date: toDateOnly(trip.start_date),
			end_date: toDateOnly(trip.end_date),
			timezone: trip.timezone,
			location_summary: trip.location_summary,
			countries: trip.countries || [],
			photo_album_url: trip.photo_album_url || '',
			archive_enabled: trip.archive_enabled,
			archive_publish_after_days: trip.archive_publish_after_days,
			auto_approve_suggestions: trip.auto_approve_suggestions
		},
		phases: phases.map((p) => ({
			name: p.name,
			location: p.location || '',
			country_code: p.country_code || '',
			start_date: toDateOnly(p.start_date),
			end_date: toDateOnly(p.end_date),
			order: p.order
		})),
		days: days.map((d) => {
			const phaseNames = (d.phases || [])
				.map((pid) => phaseMap.get(pid)?.name)
				.filter(Boolean) as string[];
			return {
				date: toDateOnly(d.date),
				notes: d.notes || '',
				phase_names: phaseNames
			};
		}),
		items: items.map((item) => {
			const day = item.day ? dayMap.get(item.day) : null;
			const phase = item.phase ? phaseMap.get(item.phase) : null;
			return {
				day_date: day ? toDateOnly(day.date) : null,
				phase_name: phase?.name || null,
				type: item.type,
				subtype: item.subtype || '',
				title: item.title,
				description: item.description || '',
				location_name: item.location_name || '',
				location_address: item.location_address || '',
				location_coords: item.location_coords || null,
				google_place_id: item.google_place_id || '',
				start_time: item.start_time || null,
				end_time: item.end_time || null,
				start_tz: item.start_tz || '',
				end_tz: item.end_tz || '',
				end_date: item.end_date || null,
				status: item.status,
				booked: item.booked,
				requires_booking: item.requires_booking ?? false,
				confirmation_codes: item.confirmation_codes || [],
				cost_estimate_usd: item.cost_estimate_usd || 0,
				cost_actual_usd: item.cost_actual_usd || 0,
				reservation_url: item.reservation_url || '',
				notes: ''
			};
		}),
		// Only trip/phase-scoped manual lists; item-scoped lists can't re-link on
		// import (items carry no stable id). `assignee` is dropped here.
		checklists: checklists
			.filter((c) => c.kind === 'manual' && !c.item)
			.map((c) => ({
				title: c.title,
				phase_name: c.phase ? (phaseMap.get(c.phase)?.name ?? null) : null,
				tasks: checklistTasks
					.filter((t) => t.checklist === c.id)
					.map((t) => ({ title: t.title, checked: t.checked }))
			})),
		budget,
		// ── Snapshot-only sections (see EXPORT COVERAGE above) ────────────────────
		// Member id is the join key for the money/goals refs below; we expose only
		// display_name + role (no user id, no email).
		members: members.map((m) => ({
			ref: m.id,
			display_name: m.display_name || m.placeholder_name || '',
			role: m.role
		})),
		expenses: expenses.map((e) => ({
			paid_by_ref: e.paid_by || '',
			amount_usd: e.amount_usd || 0,
			description: e.description || '',
			date: toDateOnly(e.date),
			category: e.category,
			split_mode: e.split_mode,
			split_data: e.split_data ?? null
		})),
		settlements: settlements.map((s) => ({
			from_member_ref: s.from_member || '',
			to_member_ref: s.to_member || '',
			amount_usd: s.amount_usd || 0,
			date: toDateOnly(s.date),
			note: s.note || ''
		})),
		goals: goals.map((g) => ({
			title: g.title,
			description: g.description || '',
			status: g.manual_status,
			sort_order: g.sort_order,
			created_by_ref: g.created_by || '',
			votes: goalVotes
				.filter((v) => v.goal === g.id)
				.map((v) => ({ member_ref: v.member, value: v.value }))
		}))
	};
}
