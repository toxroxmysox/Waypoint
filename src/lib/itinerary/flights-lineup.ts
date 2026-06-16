import type { Item } from '$lib/types';
import type { MemberWithAvatar } from '$lib/collaboration/member-avatar';
import { memberDisplayName, memberInitial } from './member-name';

// Flights Smart List (#225, PRD docs/ITEM_ASSIGNMENT_PRD.md — Slice 3): a
// trip-wide READ-ONLY lens, sibling to the Booking Smart List. Generalizes the
// "Smart List" glossary term from a checkable projection (booking) to a
// checkable-OR-read-only projection — this one is a pure read.
//
// Each row is a `type='flight'` Item projected from ONLY its STORED fields — the
// data the flight lookup persisted at create/edit time. We never call the flight
// API here. Field mapping (see FlightLookup.svelte → ItemForm.handleFlightSelect):
//   location_name → departure label  e.g. "JFK Airport (JFK)"
//   description   → arrival label     e.g. "→ LAX Airport (LAX)" (leading "→ ")
//   start_time    → departure datetime "YYYY-MM-DD HH:MM:00.000Z" (or '')
//   end_time      → arrival datetime   "YYYY-MM-DD HH:MM:00.000Z" (or '')
//   end_date      → arrival calendar date for red-eyes "YYYY-MM-DD …" (or '')
//   assigned_to   → passenger member ids (resolved to avatars)
// The owning `day` relation carries the departure calendar date when no time is
// set; the route resolves it and passes it in as `dayDate`.

/** A flight Item with its day's calendar date resolved by the loader (mirrors
 * what the Booking route does with `days`). `dayDate` is 'YYYY-MM-DD' or ''. */
export type FlightItemInput = Item & { dayDate?: string };

/** One resolved assignee avatar (placeholder/no-avatar → initials fallback). */
export interface LineupAvatar {
	initial: string;
	name: string;
	img: string;
}

/** One projected, read-only flight row. */
export interface FlightLineupRow {
	id: string;
	title: string;
	from: string;
	to: string;
	/** Departure date-time as a display string: 'YYYY-MM-DD HH:MM' or just the
	 * calendar date 'YYYY-MM-DD' when no time is stored, or '' if neither. */
	departure: string;
	/** Arrival date-time, same shape as `departure`; '' when none is stored. */
	arrival: string;
	assignees: LineupAvatar[];
}

// PB stores wall-clock datetimes as 'YYYY-MM-DD HH:MM:SS.mmmZ'. For display +
// chronological sort we only need minute precision; the stored format already
// sorts lexically (zero-padded), and a bare 'YYYY-MM-DD' sorts before any time
// on that day — exactly the ordering we want for time-less flights.
function toMinute(datetime: string): string {
	if (!datetime) return '';
	const [date, rest] = datetime.split(/[T ]/);
	if (!rest) return date; // already date-only
	return `${date} ${rest.slice(0, 5)}`;
}

// Departure date-time for display + sort: prefer the stored `start_time`
// datetime; fall back to the resolved owning-day calendar date when the flight
// has a day but no time. '' when truly unscheduled.
function departureKey(item: FlightItemInput): string {
	if (item.start_time) return toMinute(item.start_time);
	if (item.dayDate) return item.dayDate.split(/[T ]/)[0];
	return '';
}

// Arrival date-time for display + sort: prefer `end_time`; if there's only a
// red-eye `end_date` (arrival on a later calendar day, no clock time), fall back
// to that bare date so the row still shows where it lands. '' otherwise.
function arrivalKey(item: FlightItemInput): string {
	if (item.end_time) return toMinute(item.end_time);
	if (item.end_date) return item.end_date.split(/[T ]/)[0];
	return '';
}

// Strip the leading "→ " arrow the lookup prepends to the arrival label so the
// route can render its own route arrow. Tolerant of a missing prefix.
function arrivalLabel(description: string): string {
	return description.replace(/^→\s*/, '').trim();
}

function resolveAssignees(ids: string[], members: MemberWithAvatar[]): LineupAvatar[] {
	if (!ids?.length) return [];
	return ids.map((id) => {
		const m = members.find((x) => x.id === id);
		return {
			initial: memberInitial(m),
			name: memberDisplayName(m),
			img: m?.avatarUrl ?? ''
		};
	});
}

/**
 * Project the trip's flight items into an ordered, read-only lineup.
 *
 * Pure: same inputs → same output, no I/O. Filters defensively to flights (the
 * loader already scopes by `type='flight'`, but the contract says non-flight
 * items are excluded), projects route/times from stored fields only, resolves
 * each passenger to an avatar (placeholder → initials), and sorts chronologically
 * by departure then arrival. Time-less flights sort by their day; fully
 * unscheduled flights (no day, no time) sort last, then by title for stability.
 */
export function flightsLineup(
	items: FlightItemInput[],
	members: MemberWithAvatar[]
): FlightLineupRow[] {
	const flights = items.filter((i) => i.type === 'flight');

	const rows = flights.map((item) => {
		const dep = departureKey(item);
		const arr = arrivalKey(item);
		return {
			_dep: dep,
			_arr: arr,
			row: {
				id: item.id,
				title: item.title,
				from: item.location_name ?? '',
				to: arrivalLabel(item.description ?? ''),
				departure: dep,
				arrival: arr,
				assignees: resolveAssignees(item.assigned_to ?? [], members)
			} satisfies FlightLineupRow
		};
	});

	// Empty departure sorts last (unscheduled flights to the bottom). Otherwise
	// lexical compare of the zero-padded datetime strings == chronological order.
	rows.sort((a, b) => {
		if (a._dep !== b._dep) {
			if (!a._dep) return 1;
			if (!b._dep) return -1;
			return a._dep < b._dep ? -1 : 1;
		}
		if (a._arr !== b._arr) {
			if (!a._arr) return 1;
			if (!b._arr) return -1;
			return a._arr < b._arr ? -1 : 1;
		}
		return a.row.title.localeCompare(b.row.title);
	});

	return rows.map((r) => r.row);
}
