// #502 — what every MCP tool runs with, and how a tool finds the trip it was
// asked about. The PB client is the connected user's own (PB rules = their Role,
// ADR-0024 §1); AI Access (ADR-0024 §2) is enforced here, in TripRef.open.
import type PocketBase from 'pocketbase';
import type { MemberRole, Trip } from '$lib/types';
import { tripDates } from './present';

export interface McpContext {
	pb: PocketBase;
	user: { id: string; name: string };
	now: Date;
}

export interface TripRef {
	trip: Trip;
	role: MemberRole;
	memberId: string;
	open: boolean;
}

// ADR-0024 §5 layer 1: no file fields (cover_image), no share token.
const TRIP_FIELDS = ['id', 'slug', 'title', 'start_date', 'end_date', 'timezone', 'location_summary', 'countries', 'ai_access', 'archived'];

/** Every trip the user is an active member of, newest start first. */
export async function myTrips(ctx: McpContext): Promise<TripRef[]> {
	const rows = await ctx.pb.collection('trip_members').getFullList({
		filter: ctx.pb.filter('user = {:u} && removed_at = ""', { u: ctx.user.id }),
		expand: 'trip',
		fields: ['id', 'role', ...TRIP_FIELDS.map((f) => `expand.trip.${f}`)].join(','),
		requestKey: null
	});
	return rows
		.filter((m) => m.expand?.trip)
		.map((m) => {
			const trip = m.expand!.trip as Trip;
			return { trip, role: m.role as MemberRole, memberId: m.id, open: trip.ai_access !== false };
		})
		.sort((a, b) => (b.trip.start_date || '9999').localeCompare(a.trip.start_date || '9999'));
}

/**
 * The trip `ref` names: slug or id exactly, else title / location contains
 * (case-insensitive). Several matches → ask which, never pick one silently.
 */
export async function resolveTrip(ctx: McpContext, ref: string): Promise<TripRef> {
	const trips = await myTrips(ctx);
	const r = ref.trim();
	const exact = trips.find((t) => t.trip.slug === r || t.trip.id === r);
	if (exact) return exact;
	const needle = r.toLowerCase();
	const hits = needle
		? trips.filter((t) => t.trip.title.toLowerCase().includes(needle) || (t.trip.location_summary ?? '').toLowerCase().includes(needle))
		: [];
	if (hits.length === 1) return hits[0];
	if (!hits.length) throw new Error(`No trip matching "${ref}" that you're a member of.`);
	const list = hits.map((t) => `${t.trip.title} (${tripDates(t.trip)}, slug ${t.trip.slug})`).join('; ');
	throw new Error(`"${ref}" matches several trips: ${list}. Which one?`);
}
