import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { TripMember } from '$lib/types';
import { loadAvailabilityPoll } from '$lib/ideation/availability-poll.server';

// #271 / ADR-0023 — the availability poll surface. A forming-phase tool: members
// paint when they're free; the group heatmap surfaces consensus (green = everyone
// available). Reachable on forming AND dated trips, but PAINT is FROZEN read-only
// once the trip is dated (Decision 9 — no re-poll on a dated trip in v1).

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip, membership } = await parent();

	// today as a bare 'YYYY-MM-DD' day (the canvas floor).
	const today = new Date().toISOString().slice(0, 10);

	const poll = await loadAvailabilityPoll(locals.pb, trip.id, membership.id, today);

	// Painting is a forming-only affordance; a dated trip shows the frozen heatmap.
	const canPaint = !trip.start_date;

	return { poll, canPaint, slug: trip.slug };
};

export const actions: Actions = {
	// Upsert / clear the caller's OWN availability cells for a batch of days.
	// Body: deltas = JSON [{ day: 'YYYY-MM-DD', value: 'available'|'maybe'|null }].
	// A null value clears (deletes) the cell. PB rules already enforce member.user =
	// auth on availability writes, and the caller writes only their own membership id,
	// so this is safe against another member's cells.
	paint: async ({ request, locals, params }) => {
		// Resolve trip + the caller's active membership (an action's event has no
		// parent(); mirror the goals/scenarios action pattern).
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
		let membership: TripMember;
		try {
			membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem<TripMember>(
					`trip = "${trip.id}" && user = "${locals.user!.id}" && removed_at = ""`
				);
		} catch {
			return fail(403, { error: 'You are not a member of this trip.' });
		}

		// Frozen once dated (ADR-0023 Decision 9).
		if (trip.start_date) {
			return fail(400, { error: 'This trip already has dates — the poll is closed.' });
		}

		const fd = await request.formData();
		let deltas: { day: string; value: 'available' | 'maybe' | null }[] = [];
		try {
			deltas = JSON.parse((fd.get('deltas') as string) || '[]');
		} catch {
			return fail(400, { error: 'Bad request.' });
		}
		if (!Array.isArray(deltas) || deltas.length === 0) {
			return { ok: true };
		}

		for (const d of deltas) {
			const day = String(d?.day || '').slice(0, 10);
			if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
			const value = d?.value;
			const dayStamp = `${day} 00:00:00.000Z`;

			// Find the caller's existing cell for this day (unique per trip,member,day).
			let existing: { id: string } | null = null;
			try {
				existing = await locals.pb
					.collection('availability')
					.getFirstListItem(
						`trip = "${trip.id}" && member = "${membership.id}" && day >= "${day} 00:00:00.000Z" && day <= "${day} 23:59:59.999Z"`
					);
			} catch {
				existing = null;
			}

			if (value === null || value === undefined) {
				// Clear the day.
				if (existing) {
					try {
						await locals.pb.collection('availability').delete(existing.id);
					} catch {
						/* best-effort */
					}
				}
				continue;
			}
			if (value !== 'available' && value !== 'maybe') continue;

			try {
				if (existing) {
					await locals.pb.collection('availability').update(existing.id, { value });
				} else {
					await locals.pb.collection('availability').create({
						trip: trip.id,
						member: membership.id,
						day: dayStamp,
						value
					});
				}
			} catch {
				/* best-effort per-cell — a transient failure re-seeds on next load */
			}
		}

		return { ok: true };
	}
};
