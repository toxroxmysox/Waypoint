/// <reference path="../pb_data/types.d.ts" />
// M3b: trip_budgets collection.
// One budget per trip. Owner/co_owner can create and update.
// Any trip member can read. No direct delete (cascade from trip).
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');

		const MEMBER_VIA_TRIP =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';

		// Owner/co_owner check via trip membership role.
		const OWNER_OR_COOWNER =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id && trip.trip_members_via_trip.role ?= "owner" || trip.trip_members_via_trip.role ?= "co_owner"';

		const collection = new Collection({
			type: 'base',
			name: 'trip_budgets',
			fields: [
				{ type: 'relation', name: 'trip', required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'json', name: 'categories', required: true, maxSize: 50000 },
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_trip_budgets_trip ON trip_budgets (trip)',
			],
			listRule: MEMBER_VIA_TRIP,
			viewRule: MEMBER_VIA_TRIP,
			// Create/update: hook-enforced to owner/co_owner since PB rule syntax
			// for role checks on the same back-relation is unreliable with ?= operator.
			createRule: MEMBER_VIA_TRIP,
			updateRule: MEMBER_VIA_TRIP,
			deleteRule: null,
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('trip_budgets');
		app.delete(collection);
	}
);
