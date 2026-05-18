/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const tripMembers = app.findCollectionByNameOrId('trip_members');

		const MEMBER_VIA_TRIP =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';

		const collection = new Collection({
			type: 'base',
			name: 'vault_entries',
			fields: [
				{ type: 'relation', name: 'trip', required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'text', name: 'encrypted_title', required: true, max: 5000 },
				{ type: 'text', name: 'encrypted_body', required: true, max: 100000 },
				{ type: 'relation', name: 'created_by', required: true, collectionId: tripMembers.id, maxSelect: 1 },
			],
			indexes: [
				'CREATE INDEX idx_vault_entries_trip ON vault_entries (trip)',
			],
			listRule: MEMBER_VIA_TRIP,
			viewRule: MEMBER_VIA_TRIP,
			createRule: MEMBER_VIA_TRIP,
			updateRule: MEMBER_VIA_TRIP + ' && created_by.user = @request.auth.id',
			deleteRule: MEMBER_VIA_TRIP + ' && created_by.user = @request.auth.id',
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('vault_entries');
		app.delete(collection);
	}
);
