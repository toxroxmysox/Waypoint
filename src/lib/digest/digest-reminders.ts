// #522 — digest reminders: booking reminders, the pre-trip brief, the closeout
// nudge. Deterministic, no AI. Pure + Intl-free so the goja port in
// backend/pb_hooks/digest-core.js stays line-for-line (digest-core-parity.test.ts
// pins the two copies together — change them together).
//
// Stateless by design: the digest runs once per trip-local day (~8am), so a
// reminder fires on the day `today` hits its threshold and never again. A missed
// cron day is a missed reminder (accepted, #522).

export const BOOKING_LEADS = [60, 30, 14];
export const BRIEF_LEAD = 3;
export const CLOSEOUT_LAG = 3;

export interface ReminderItem {
	title: string;
	type: string;
	/** YYYY-MM-DD of the item's day, '' when unscheduled. */
	dayDate: string;
	/** YYYY-MM-DD start of the item's phase, '' when none. */
	phaseStart: string;
	requiresBooking: boolean;
	booked: boolean;
	/** trip_members ids of members going (assigned_to). */
	going: string[];
}

export interface ReminderInput {
	/** Trip-local today, YYYY-MM-DD. */
	today: string;
	tripStart: string;
	tripEnd: string;
	archived: boolean;
	items: ReminderItem[];
}

export interface BookingReminder {
	title: string;
	/** The date it's needed by: its day, else its phase start, else trip start. */
	date: string;
	daysOut: number;
	going: string[];
}

export interface BriefLine {
	title: string;
	date: string;
}

export interface TripReminders {
	booking: BookingReminder[];
	brief: { start: string; stays: BriefLine[]; travel: BriefLine[]; unbooked: BriefLine[] } | null;
	closeout: boolean;
}

/** Whole days from `a` to `b` (both YYYY-MM-DD); NaN if either is blank. */
export function daysBetween(a: string, b: string): number {
	const pa = /^(\d{4})-(\d{2})-(\d{2})/.exec(a || '');
	const pb = /^(\d{4})-(\d{2})-(\d{2})/.exec(b || '');
	if (!pa || !pb) return NaN;
	const ta = Date.UTC(+pa[1], +pa[2] - 1, +pa[3]);
	const tb = Date.UTC(+pb[1], +pb[2] - 1, +pb[3]);
	return Math.round((tb - ta) / 86400000);
}

function neededBy(item: ReminderItem, tripStart: string): string {
	return item.dayDate || item.phaseStart || tripStart || '';
}

function byDateThenTitle(a: { date: string; title: string }, b: { date: string; title: string }): number {
	return a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title);
}

/** Every reminder due today for one trip, before per-recipient filtering. */
export function composeReminders(input: ReminderInput): TripReminders {
	const out: TripReminders = { booking: [], brief: null, closeout: false };
	if (input.archived) return out;
	const start = (input.tripStart || '').slice(0, 10);
	const end = (input.tripEnd || '').slice(0, 10);

	for (const item of input.items) {
		if (!item.requiresBooking || item.booked) continue;
		const date = neededBy(item, start).slice(0, 10);
		const daysOut = daysBetween(input.today, date);
		if (BOOKING_LEADS.indexOf(daysOut) !== -1) {
			out.booking.push({ title: item.title, date: date, daysOut: daysOut, going: item.going.slice() });
		}
	}
	out.booking.sort(byDateThenTitle);

	if (start && daysBetween(input.today, start) === BRIEF_LEAD) {
		const stays: BriefLine[] = [];
		const travel: BriefLine[] = [];
		const unbooked: BriefLine[] = [];
		for (const item of input.items) {
			const date = neededBy(item, start).slice(0, 10);
			if (item.type === 'lodging') stays.push({ title: item.title, date: date });
			else if (item.type === 'flight' || item.type === 'transportation') travel.push({ title: item.title, date: date });
			// #522 review — only what's needed during the trip, and not twice.
			const dup = out.booking.some((bk) => bk.title === item.title && bk.date === date);
			const during = date >= start && (!end || date <= end);
			if (item.requiresBooking && !item.booked && during && !dup) unbooked.push({ title: item.title, date: date });
		}
		stays.sort(byDateThenTitle);
		travel.sort(byDateThenTitle);
		unbooked.sort(byDateThenTitle);
		out.brief = { start: start, stays: stays, travel: travel, unbooked: unbooked };
	}

	if (end && daysBetween(end, input.today) === CLOSEOUT_LAG) out.closeout = true;
	return out;
}

/**
 * One recipient's share. Booking: owners/co-owners get every item, travelers
 * only items they're going to, viewers none. Brief: everyone. Closeout:
 * owners/co-owners only.
 */
export function remindersFor(r: TripReminders, role: string, memberId: string): TripReminders {
	const planner = role === 'owner' || role === 'co_owner';
	const booking =
		role === 'viewer' ? [] : planner ? r.booking : r.booking.filter((b) => b.going.indexOf(memberId) !== -1);
	return { booking: booking, brief: r.brief, closeout: planner && r.closeout };
}

export function hasReminders(r: TripReminders | null | undefined): boolean {
	return !!r && (r.booking.length > 0 || !!r.brief || r.closeout);
}
