import type { User } from '$lib/types';

// #274 Onboarding spine — the per-user, once-ever complete-signal.
//
// A member "needs onboarding" until they've completed the welcome card once
// (their first real contribution, or tapping "Got it"). The signal is a single
// nullable `users.onboarded_at` date (migration 0054). PB serves an UNSET date
// field to the SvelteKit client as the empty string `''` (falsy) — NOT a truthy
// goja DateTime (that scar bites only PB hooks reading the field; cerebrum
// Do-Not-Repeat [2026-06-11]). So a plain truthiness test on the trimmed string
// is correct here: `''`/absent → true (needs onboarding).
//
// Keyed on the MEMBER, not on trip content — this is the fix for the ES-1 gap,
// where the content-keyed `isFresh` hero vanished the moment a trip had any
// items and so missed an invited member joining a POPULATED trip.
export function needsOnboarding(user: Pick<User, 'onboarded_at'> | null | undefined): boolean {
	if (!user) return false;
	return !(user.onboarded_at ?? '').trim();
}
