/// <reference path="../pb_data/types.d.ts" />
// #508 — a user with zero trips could not read their OWN row: 0043's co-traveler
// viewRule only matches users who share a trip with the caller, and a tripless
// caller shares none with themself → /account getOne 404 → page 500.
//
// Append-only: re-adds the self clause 0014 had, OR'd with 0043's co-traveler
// expression. Nothing else on `users` changes.
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.viewRule =
			'@request.auth.id != "" && (id = @request.auth.id || trip_members_via_user.trip.trip_members_via_trip.user ?= @request.auth.id)';
		app.save(users);
	},
	(app) => {
		// Down: restore 0043's co-traveler-only rule.
		const users = app.findCollectionByNameOrId('users');
		users.viewRule =
			'@request.auth.id != "" && trip_members_via_user.trip.trip_members_via_trip.user ?= @request.auth.id';
		app.save(users);
	}
);
