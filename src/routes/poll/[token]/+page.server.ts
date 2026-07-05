import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { PUBLIC_PB_URL } from '$env/static/public';
import {
	canvasExtent,
	daysInExtent,
	rollupByDay,
	myValueByDay,
	type AvailabilityCell,
	type AvailabilityValue
} from '$lib/ideation/availability';
import { toDay } from '$lib/ideation/scenario-planning';
import type { PollDay } from '$lib/ideation/availability-poll.server';

// #271 / ADR-0023 Decision 7 — the PUBLIC poll page ("the poll is the invite").
// Lives OUTSIDE the (app) auth gate (like /join, /invite). A tapper paints their
// days with NO OTP; giving a name creates a name-only Placeholder Member and a
// soft_token httpOnly cookie keys re-entry. OTP-to-enter-the-rest-of-the-trip is a
// separate, later step (the existing /join claim path — surfaced with a link here).

const SOFT_COOKIE = 'wp_poll_soft';

const MONTHS_SHORT = [
	'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
];
function mondayIndex(day: string): number {
	return (new Date(day + 'T00:00:00.000Z').getUTCDay() + 6) % 7;
}

type PollStatus = 'not_found' | 'inactive' | 'ready';

export const load: PageServerLoad = async ({ params, cookies, fetch }) => {
	const soft = cookies.get(SOFT_COOKIE) || '';

	// Anon context lookup (no auth). Includes the caller's own respondent (cookie
	// match) + the name-only respondent list for the "that's me" picker.
	let lookup: {
		role?: string;
		trip_title?: string;
		expired?: boolean;
		closed?: boolean;
		dated?: boolean;
		me?: { member_id: string; name: string } | null;
		respondents?: { member_id: string; name: string }[];
	} | null = null;
	let lookupStatus = 0;
	try {
		const qs = new URLSearchParams({ token: params.token, soft_token: soft });
		const res = await fetch(`${PUBLIC_PB_URL}/api/poll/lookup?${qs.toString()}`);
		lookupStatus = res.status;
		if (res.ok) lookup = await res.json();
	} catch {
		lookupStatus = 0;
	}

	if (lookupStatus !== 200 || !lookup) {
		return {
			token: params.token,
			status: 'not_found' as PollStatus,
			tripTitle: '',
			me: null,
			respondents: [],
			poll: null
		};
	}
	if (lookup.expired || lookup.closed || lookup.dated) {
		return {
			token: params.token,
			status: 'inactive' as PollStatus,
			tripTitle: lookup.trip_title || '',
			dated: !!lookup.dated,
			closed: !!lookup.closed,
			me: null,
			respondents: [],
			poll: null
		};
	}

	// Build the calendar. We fetch the FULL cell set + respondent list via a second
	// anon lookup would leak; instead the paint endpoint is admin-context and the
	// calendar for an anon tapper only needs THEIR OWN marks (My-mode) — the group
	// heatmap is an app-side surface. So render My-mode only for the public poll: the
	// tapper paints their availability; consensus lives inside the trip.
	//
	// The extent + my marks come from the caller's own cells, which we read via the
	// lookup's `me` member id against the availability collection (public read is
	// gated to trip members, so we can't list here). Keep it simple: the anon poll
	// renders a forward canvas (today → +6 weeks) for painting; the server merges the
	// tapper's existing marks returned from the paint endpoint on save. For the first
	// render with a known respondent, we surface their marks via a dedicated read.
	const today = new Date().toISOString().slice(0, 10);
	// A generous forward canvas for a fresh poll respondent (today → +6 weeks); this
	// is the paintable range. (The in-app group view derives the tighter ±2wk extent.)
	const extentStart = today;
	const extentEnd = daysInExtent(today, addWeeks(today, 6)).slice(-1)[0];

	// The caller's own marks (if the cookie resolved a respondent) — read via a
	// server-side authed-less path is not possible (public availability read requires
	// membership), so a fresh anon render starts blank and the endpoint returns the
	// merged state. This keeps the anon surface strictly write-forward.
	const myCells: AvailabilityCell[] = [];
	const mineByDay = myValueByDay(myCells);

	const days = daysInExtent(extentStart, extentEnd);
	const rollups = rollupByDay([], [], days); // no group data on the public surface
	const pollDays: PollDay[] = days.map((day) => {
		const r = rollups.get(day)!;
		return {
			day,
			monthTag: day.slice(8, 10) === '01' ? MONTHS_SHORT[Number(day.slice(5, 7)) - 1] : null,
			mine: mineByDay.get(day) ?? null,
			status: r.status,
			availableCount: r.availableCount,
			maybeCount: r.maybeCount,
			availableMembers: r.availableMembers,
			maybeMembers: r.maybeMembers,
			isToday: day === today,
			isPast: false
		};
	});
	const lead = mondayIndex(extentStart);
	const padded: (PollDay | null)[] = [...Array(lead).fill(null), ...pollDays];
	while (padded.length % 7 !== 0) padded.push(null);
	const weeks: (PollDay | null)[][] = [];
	for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));

	return {
		token: params.token,
		status: 'ready' as PollStatus,
		tripTitle: lookup.trip_title || '',
		role: lookup.role || '',
		me: lookup.me ?? null,
		respondents: (lookup.respondents ?? []).filter((r) => !lookup.me || r.member_id !== lookup.me.member_id),
		poll: { weeks }
	};
};

function addWeeks(day: string, w: number): string {
	const d = new Date(toDay(day) + 'T00:00:00.000Z');
	d.setUTCDate(d.getUTCDate() + w * 7);
	return d.toISOString().slice(0, 10);
}

export const actions: Actions = {
	// Paint (Tier-1, no OTP). Body: name?, member_id?, deltas. Posts to the anon PB
	// endpoint, which mints/echoes a soft_token; we set it as an httpOnly cookie
	// (mirrors hooks.server.ts). Returns the respondent name so the page can greet.
	paint: async ({ params, request, cookies, fetch }) => {
		const soft = cookies.get(SOFT_COOKIE) || '';
		const fd = await request.formData();
		const name = (fd.get('name')?.toString() || '').trim();
		const memberId = fd.get('member_id')?.toString() || '';
		let deltas: unknown = [];
		try {
			deltas = JSON.parse(fd.get('deltas')?.toString() || '[]');
		} catch {
			deltas = [];
		}

		try {
			const res = await fetch(`${PUBLIC_PB_URL}/api/poll/paint`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					token: params.token,
					name,
					member_id: memberId || undefined,
					soft_token: soft || undefined,
					deltas
				})
			});
			const data = await res.json().catch(() => null);
			if (!res.ok) {
				const msg = (data && data.message) || '';
				if (msg === 'NAME_REQUIRED' || /NAME_REQUIRED/.test(msg)) {
					return fail(400, { needName: true });
				}
				return fail(res.status === 429 ? 429 : 400, {
					error: res.status === 429 ? 'Too many saves — give it a moment.' : msg || 'Could not save.'
				});
			}
			// Set the soft_token cookie (httpOnly; the SvelteKit server owns it).
			if (data?.soft_token) {
				cookies.set(SOFT_COOKIE, data.soft_token, {
					path: '/',
					httpOnly: true,
					sameSite: 'lax',
					secure: process.env.NODE_ENV === 'production',
					maxAge: 60 * 60 * 24 * 180 // 180 days
				});
			}
			return { ok: true, savedName: name, memberId: data?.member_id, written: data?.written ?? 0 };
		} catch {
			return fail(500, { error: 'Could not reach the server.' });
		}
	}
};
