import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Trip, TripMember } from '$lib/types';
import { tripToday, tripTz } from '$lib/shell/trip-time';
import { pbFileUrl } from '$lib/shell/pb-file-url';
import { PUBLIC_PB_URL } from '$env/static/public';

export const load: PageServerLoad = async ({ locals, fetch }) => {
	// Get all trip memberships for the current user
	const memberships = await locals.pb.collection('trip_members').getFullList<TripMember>({
		// #133: a Departed Member's `user` is cleared, so a removed trip already
		// drops off this list; guard explicitly to keep the invariant total.
		filter: `user = "${locals.user!.id}" && removed_at = ""`,
		expand: 'trip'
	});

	const trips = memberships
		.map((m) => ({
			trip: m.expand?.trip as Trip | undefined,
			role: m.role,
			memberId: m.id
		}))
		.filter((m) => m.trip)
		.sort((a, b) => {
			// Active first (start <= now <= end), then upcoming, then past
			const aTrip = a.trip!;
			const bTrip = b.trip!;
			const aStart = aTrip.start_date.split('T')[0];
			const bStart = bTrip.start_date.split('T')[0];
			return aStart > bStart ? 1 : aStart < bStart ? -1 : 0;
		});

	// #270 / ADR-0022 — forming = dateless (start_date ''). Split FIRST: an empty
	// start_date compares as '' <= today (true) and '' < today (true), so without
	// this a forming trip would leak into BOTH the active and past filters.
	// Forming sorts ahead of past in the list (the page renders the groups in
	// order: active, upcoming, forming, past).
	const forming = trips.filter((t) => !t.trip!.start_date);
	const dated = trips.filter((t) => !!t.trip!.start_date);

	const active = dated.filter((t) => {
		const today = tripToday(tripTz(t.trip!));
		const start = t.trip!.start_date.split('T')[0];
		const end = t.trip!.end_date.split('T')[0];
		return start <= today && today <= end;
	});

	const upcoming = dated.filter((t) => {
		const today = tripToday(tripTz(t.trip!));
		const start = t.trip!.start_date.split('T')[0];
		return start > today;
	});

	const past = dated.filter((t) => {
		const today = tripToday(tripTz(t.trip!));
		const end = t.trip!.end_date.split('T')[0];
		return end < today;
	});

	// Header identity → links to /account (the Profile surface, #104).
	const u = locals.user!;
	// Browser-facing avatar URL → PUBLIC base, not the SSR client's internal base.
	const avatarUrl = u.avatar ? pbFileUrl(u, u.avatar as string) : '';

	// #179c: pending placeholder claims the user skipped at login are otherwise
	// unreachable until the next fresh login. Surface a count here so the user
	// can re-enter the claim flow. Best-effort — a failure must never break the
	// trips list (one throwing query 500s the whole page; see cerebrum).
	let pendingClaims = 0;
	let firstClaimTitle = '';
	let invitations: PendingInvitation[] = [];
	// #397 — invites waiting for this user's email, accepted right here instead
	// of via each email link (every link opened in a fresh browser context costs
	// a new one-time code). Both lookups are best-effort and run in parallel.
	await Promise.all([
		(async () => {
			try {
				const token = locals.pb.authStore.token;
				const res = await fetch(`${PUBLIC_PB_URL}/api/members/my-claims`, {
					headers: { Authorization: `Bearer ${token}` }
				});
				if (res.ok) {
					const { claims } = (await res.json()) as {
						claims: { trip_title?: string }[];
					};
					pendingClaims = claims?.length ?? 0;
					firstClaimTitle = claims?.[0]?.trip_title ?? '';
				}
			} catch {
				// Swallow — the claims card just won't render.
			}
		})(),
		(async () => {
			invitations = await myInvitations(locals.pb);
		})()
	]);

	return {
		active,
		upcoming,
		forming,
		past,
		profileName: u.name,
		avatarUrl,
		pendingClaims,
		firstClaimTitle,
		invitations
	};
};

export interface PendingInvitation {
	code: string;
	trip_title: string;
	inviter_name: string;
	role: string;
	/** The trip has unclaimed placeholders → accept on /invite/<code>, where the
	 *  invitee can claim one instead of joining as a duplicate. */
	needs_choice: boolean;
}

async function myInvitations(pb: App.Locals['pb']): Promise<PendingInvitation[]> {
	try {
		return (await pb.send<{ invites: PendingInvitation[] }>('/api/invites/my-pending', {})).invites;
	} catch {
		return []; // the section just won't render
	}
}

function errorMessage(err: unknown, fallback: string): string {
	const msg = (err as { response?: { message?: string } })?.response?.message;
	return typeof msg === 'string' && msg ? msg : fallback;
}

export const actions: Actions = {
	// #397 — accept in place: the user is already signed in, so no code.
	acceptInvite: async ({ request, locals }) => {
		const code = (await request.formData()).get('code')?.toString() ?? '';
		if (!code) return fail(400, { error: 'Missing invite.', code });
		// Re-check at accept time, not just when the list loaded: if the trip has
		// gained an unclaimed placeholder (or the POST was hand-made), accepting
		// in place would make a duplicate member — send them to the invite page,
		// where they can claim it (they're signed in, so still no code).
		const current = (await myInvitations(locals.pb)).find((i) => i.code === code);
		if (!current) return fail(400, { error: 'That invite is no longer available.', code });
		if (current.needs_choice) redirect(303, `/invite/${code}`);
		try {
			const res = await locals.pb.send<{ trip_id: string; trip_slug?: string }>('/api/invites/accept', {
				method: 'POST',
				body: { code }
			});
			redirect(303, res.trip_slug ? `/trips/${res.trip_slug}` : '/trips');
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(400, { error: errorMessage(err, 'Couldn’t accept that invite.'), code });
		}
	},

	// Decline deletes the invite (Scott, 2026-10-02) — no declined state.
	declineInvite: async ({ request, locals }) => {
		const code = (await request.formData()).get('code')?.toString() ?? '';
		if (!code) return fail(400, { error: 'Missing invite.', code });
		try {
			await locals.pb.send('/api/invites/decline', { method: 'POST', body: { code } });
			return { declined: code };
		} catch (err) {
			return fail(400, { error: errorMessage(err, 'Couldn’t decline that invite.'), code });
		}
	}
};
