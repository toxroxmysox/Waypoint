import type { PageServerLoad } from './$types';
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

	const active = trips.filter((t) => {
		const today = tripToday(tripTz(t.trip!));
		const start = t.trip!.start_date.split('T')[0];
		const end = t.trip!.end_date.split('T')[0];
		return start <= today && today <= end;
	});

	const upcoming = trips.filter((t) => {
		const today = tripToday(tripTz(t.trip!));
		const start = t.trip!.start_date.split('T')[0];
		return start > today;
	});

	const past = trips.filter((t) => {
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

	return {
		active,
		upcoming,
		past,
		profileName: u.name,
		avatarUrl,
		pendingClaims,
		firstClaimTitle
	};
};
