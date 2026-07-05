/// <reference path="../pb_data/types.d.ts" />
// #271 (Availability wedge / ADR-0023 Decision 7) — `soft_token` on trip_members.
//
// The "poll is the invite" two-tier new-user model: a Tier-1 respondent taps the
// share link, paints their days, and gives a NAME ONLY (no OTP). A name-only
// Placeholder Member is created and their availability cells are saved. A soft
// cookie identity (`soft_token`, an httpOnly cookie value) keys re-entry so the
// SAME person re-paints the SAME placeholder instead of spawning a duplicate on
// return (POST /api/poll/paint, M4). It is a low-security convenience key — the
// hard identity is still the OTP claim (Tier 2), which sets `user` on the same row
// (cells already point at member.id, so nothing is re-keyed).
//
// Append-only + additive (fields.add, not a fields[] rebuild) so the system
// created/updated autodate fields on trip_members are preserved (cerebrum
// Do-Not-Repeat: explicit-field migrations drop autodate).
migrate(
	(app) => {
		const tripMembers = app.findCollectionByNameOrId('trip_members');
		tripMembers.fields.add(
			new TextField({
				name: 'soft_token',
				required: false,
				max: 80
			})
		);
		app.save(tripMembers);
	},
	(app) => {
		const tripMembers = app.findCollectionByNameOrId('trip_members');
		tripMembers.fields.removeByName('soft_token');
		app.save(tripMembers);
	}
);
