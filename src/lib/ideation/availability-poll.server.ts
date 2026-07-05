import type PocketBase from 'pocketbase';
import type { TripMember } from '$lib/collaboration/types';
import { withAvatarUrls, type MemberWithAvatar } from '$lib/collaboration/member-avatar';
import {
	canvasExtent,
	daysInExtent,
	rollupByDay,
	myValueByDay,
	type AvailabilityCell,
	type AvailabilityValue,
	type DayStatus
} from './availability';
import { toDay } from './scenario-planning';

/** A raw availability row as PB stores it. */
interface AvailabilityRow {
	id: string;
	trip: string;
	member: string;
	day: string;
	value: AvailabilityValue;
}

/** One rendered day in the poll calendar — everything both modes need. */
export interface PollDay {
	day: string; // 'YYYY-MM-DD'
	monthTag: string | null; // 'MAR' on the 1st, for the corner tag
	/** The caller's own mark on this day (My-mode tint). null = blank. */
	mine: AvailabilityValue | null;
	/** Group colour (Group-mode tint). null = no response. */
	status: DayStatus;
	availableCount: number;
	maybeCount: number;
	/** Active member ids who marked available (avatar dots). */
	availableMembers: string[];
	maybeMembers: string[];
	isToday: boolean;
	isPast: boolean;
}

export interface AvailabilityPollData {
	/** Week rows (Monday-first); null = a leading/trailing padding cell. */
	weeks: (PollDay | null)[][];
	members: MemberWithAvatar[];
	/** The caller's own active trip_members id (the paint target). '' if not a member. */
	myMemberId: string;
	/** Count of active members — the green denominator (surfaced in copy). */
	activeMemberCount: number;
	extentStart: string;
	extentEnd: string;
	/** Days that are green across the whole group — the promote-window shortlist. */
	greenDays: string[];
}

const MONTHS_SHORT = [
	'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
];

/** Monday-first weekday index for a 'YYYY-MM-DD' day: 0 = Mon … 6 = Sun. */
function mondayIndex(day: string): number {
	return (new Date(day + 'T00:00:00.000Z').getUTCDay() + 6) % 7;
}

/**
 * Load the availability poll for a forming trip (#271). Fetches every cell + the
 * active members (removed_at = "" — ADR-0023 build invariant 4), derives the canvas
 * extent (today → min/max painted ± 2 weeks), and decorates each day with the
 * caller's own mark (My-mode) plus the group rollup (Group-mode). `today` is a bare
 * day string (caller passes the app's today). `callerMemberId` is the paint target.
 */
export async function loadAvailabilityPoll(
	pb: PocketBase,
	tripId: string,
	callerMemberId: string,
	today: string
): Promise<AvailabilityPollData> {
	const [rows, membersRaw] = await Promise.all([
		pb.collection('availability').getFullList<AvailabilityRow>({
			filter: `trip = "${tripId}"`
		}),
		// ADR-0023 build invariant 4: every read filters removed_at = "".
		pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${tripId}" && removed_at = ""`,
			expand: 'user'
		})
	]);
	const members = withAvatarUrls(pb, membersRaw as never);
	const activeMemberIds = members.map((m) => m.id);

	const cells: AvailabilityCell[] = rows.map((r) => ({
		member: r.member,
		day: toDay(r.day),
		value: r.value
	}));

	// Only cells belonging to the caller drive My-mode tint.
	const myCells = cells.filter((c) => c.member === callerMemberId);
	const mineByDay = myValueByDay(myCells);

	const t = toDay(today);
	const { start, end } = canvasExtent(cells, t);
	const days = daysInExtent(start, end);
	const rollups = rollupByDay(cells, activeMemberIds, days);

	const greenDays: string[] = [];
	const pollDays: PollDay[] = days.map((day) => {
		const r = rollups.get(day)!;
		if (r.status === 'green') greenDays.push(day);
		return {
			day,
			monthTag: day.slice(8, 10) === '01' ? MONTHS_SHORT[Number(day.slice(5, 7)) - 1] : null,
			mine: mineByDay.get(day) ?? null,
			status: r.status,
			availableCount: r.availableCount,
			maybeCount: r.maybeCount,
			availableMembers: r.availableMembers,
			maybeMembers: r.maybeMembers,
			isToday: day === t,
			isPast: day < t
		};
	});

	// Week-align (Monday-first), mirroring phase-calendar's padding.
	const lead = mondayIndex(start);
	const padded: (PollDay | null)[] = [...Array(lead).fill(null), ...pollDays];
	while (padded.length % 7 !== 0) padded.push(null);
	const weeks: (PollDay | null)[][] = [];
	for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));

	return {
		weeks,
		members,
		myMemberId: callerMemberId,
		activeMemberCount: activeMemberIds.length,
		extentStart: start,
		extentEnd: end,
		greenDays
	};
}
