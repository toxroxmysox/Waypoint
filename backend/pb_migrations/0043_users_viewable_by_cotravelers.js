/// <reference path="../pb_data/types.d.ts" />
// #103 / ADR-0006 — loosen `users.viewRule` from self-only to co-traveler so a
// member can read another member's `name` + `avatar` (the avatar wire-up, #59).
//
// Append-only: 0014 set `users.viewRule = "id = @request.auth.id"`. This migration
// REPLACES only the view rule; everything else 0014 set on `users` is untouched:
//   - listRule stays SELF_ONLY — no user enumeration.
//   - createRule / deleteRule stay null (OTP-hook create; no API delete).
//   - updateRule stays SELF_ONLY — self-edit only (/account).
//   - emailVisibility stays OFF — email is NOT exposed through this path. PB also
//     always strips `password`/`tokenKey` on auth collections, so only `name` +
//     `avatar` (+ `verified`) become cross-readable.
//
// The expression is a TWO-LEVEL nested back-relation — deeper than any other rule
// in the codebase (all others stop at one level). PB 0.27 evaluates it; proven in
// backend/test-rules.mjs (#103 cross-read cases). Reads as: the caller is authed
// AND the target user has some membership whose trip also has a membership for the
// caller → caller shares a trip with the target.
//   - trip_members_via_user        : back-relation from users (trip_members.user → users)
//                                     = the target user's memberships.
//   - .trip.trip_members_via_trip.user ?= @request.auth.id
//                                     : for those trips, does any member's user equal the caller.
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.viewRule =
			'@request.auth.id != "" && trip_members_via_user.trip.trip_members_via_trip.user ?= @request.auth.id';
		app.save(users);
	},
	(app) => {
		// Down: restore the self-only view rule 0014 set (the immediately-prior state).
		const users = app.findCollectionByNameOrId('users');
		users.viewRule = 'id = @request.auth.id';
		app.save(users);
	}
);
