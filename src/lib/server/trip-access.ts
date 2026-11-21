// #543 — one place for loaders/actions to resolve "which trip, is the caller an
// active member, what is their role", and to map failed PB calls to HTTP statuses.
//
// PB is the real gate (ADR-0025): its rules + hooks enforce every write. This module
// only drives UX gating (hide a control, refuse early with a friendly message) and
// keeps the 404/403 mapping consistent across routes. SvelteKit side only.
//
// Vocabulary (CONTEXT.md): an **Organizer** is an owner or a co-owner. "Owner" alone
// means only the owner Role.
import { error } from '@sveltejs/kit';
import type PocketBase from 'pocketbase';
import type { MemberRole, Trip, TripMember } from '$lib/types';

/** Owner or co-owner — the members who run the trip. */
export function isOrganizer(role: MemberRole | undefined | null): boolean {
	return role === 'owner' || role === 'co_owner';
}

/** The owner Role only (never a co-owner). */
export function isOwner(role: MemberRole | undefined | null): boolean {
	return role === 'owner';
}

/** Read-only member. */
export function isViewer(role: MemberRole | undefined | null): boolean {
	return role === 'viewer';
}

/** A failed PB call's status when it is an HTTP error (400-599), else 500. */
export function failStatus(err: unknown): number {
	const status = (err as { status?: number } | null)?.status;
	return typeof status === 'number' && status >= 400 && status < 600 ? status : 500;
}

/** The trip with this slug. Throws the PB error (404) when there is none. */
export function getTripBySlug(pb: PocketBase, slug: string): Promise<Trip> {
	return pb.collection('trips').getFirstListItem<Trip>(pb.filter('slug = {:slug}', { slug }));
}

// #133: a Departed Member's `user` is cleared on removal, but the access gate guards
// `removed_at` explicitly — a tombstone must never resolve as a member.
function activeMemberFilter(tripId: string, userId: string): string {
	return `trip = "${tripId}" && user = "${userId}" && removed_at = ""`;
}

/**
 * The caller's active membership. Throws the PB error (404) when not a member, and a
 * plain (status-less → 500) error when signed out — never a `user = ""` query, which
 * would match a placeholder member.
 */
export async function getActiveMembership(
	pb: PocketBase,
	tripId: string,
	userId: string | undefined
): Promise<TripMember> {
	if (!userId) throw new Error('Not signed in.');
	return pb
		.collection('trip_members')
		.getFirstListItem<TripMember>(activeMemberFilter(tripId, userId));
}

/** The caller's active membership, or null when not a member (or the read failed). */
export function findActiveMembership(
	pb: PocketBase,
	tripId: string,
	userId: string | undefined
): Promise<TripMember | null> {
	return getActiveMembership(pb, tripId, userId).catch(() => null);
}

/**
 * Whether the caller is a viewer on this trip — the app-layer gate for paths PB
 * rules leave open to every member (tasks, ADR-0003). Throws like
 * getActiveMembership when the caller isn't a member.
 */
export async function callerIsViewer(
	pb: PocketBase,
	tripId: string,
	userId: string | undefined
): Promise<boolean> {
	return isViewer((await getActiveMembership(pb, tripId, userId)).role);
}

/**
 * Loader gate: 404 for an unknown trip, 403 for a non-member. A missing `userId`
 * (signed out) is a 403 — never a `user = ""` query, which would match a placeholder.
 */
export async function loadTripAccess(
	pb: PocketBase,
	slug: string,
	userId: string | undefined
): Promise<{ trip: Trip; membership: TripMember }> {
	let trip: Trip;
	try {
		trip = await getTripBySlug(pb, slug);
	} catch {
		error(404, 'Trip not found');
	}
	if (!userId) error(403, 'You are not a member of this trip');
	let membership: TripMember;
	try {
		membership = await getActiveMembership(pb, trip.id, userId);
	} catch {
		error(403, 'You are not a member of this trip');
	}
	return { trip, membership };
}

export const ORGANIZER_ONLY = 'Only owners or co-owners can do that.';

export type OrganizerGate =
	| { ok: true; trip: Trip; membership: TripMember }
	| { ok: false; status: 403; message: string };

/**
 * Action gate for Organizer-only actions. A non-organizer gets `{ ok: false }` to
 * return as `fail(gate.status, …)`. A missing trip or membership THROWS the PB
 * error — the caller's catch decides what that becomes.
 */
export async function requireOrganizer(
	pb: PocketBase,
	slug: string,
	userId: string | undefined
): Promise<OrganizerGate> {
	const trip = await getTripBySlug(pb, slug);
	const membership = await getActiveMembership(pb, trip.id, userId);
	if (!isOrganizer(membership.role)) return { ok: false, status: 403, message: ORGANIZER_ONLY };
	return { ok: true, trip, membership };
}
