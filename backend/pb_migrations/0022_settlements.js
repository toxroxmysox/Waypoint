/// <reference path="../pb_data/types.d.ts" />
// M3b: settlements collection.
// Records a payment between two trip members. Either party can create.
// Read by any trip member. Update/delete by creator or owner/co_owner (hook-enforced).
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const tripMembers = app.findCollectionByNameOrId('trip_members');

		const MEMBER_VIA_TRIP =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';

		const collection = new Collection({
			type: 'base',
			name: 'settlements',
			fields: [
				{ type: 'relation', name: 'trip', required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'relation', name: 'from_member', required: true, collectionId: tripMembers.id, maxSelect: 1 },
				{ type: 'relation', name: 'to_member', required: true, collectionId: tripMembers.id, maxSelect: 1 },
				{ type: 'number', name: 'amount_usd', required: true, min: 0.01 },
				{ type: 'date', name: 'date', required: true },
				{ type: 'text', name: 'note', max: 500 },
				{ type: 'relation', name: 'created_by', required: true, collectionId: tripMembers.id, maxSelect: 1 },
			],
			indexes: [
				'CREATE INDEX idx_settlements_trip ON settlements (trip)',
				'CREATE INDEX idx_settlements_from ON settlements (from_member)',
				'CREATE INDEX idx_settlements_to ON settlements (to_member)',
			],
			listRule: MEMBER_VIA_TRIP,
			viewRule: MEMBER_VIA_TRIP,
			// Create: any trip member (hook validates from_member or to_member is the caller).
			createRule: MEMBER_VIA_TRIP,
			// Update: creator only.
			updateRule: MEMBER_VIA_TRIP + ' && created_by.user = @request.auth.id',
			// Delete: creator or owner/co_owner — hook-enforced.
			deleteRule: MEMBER_VIA_TRIP,
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('settlements');
		app.delete(collection);
	}
);
