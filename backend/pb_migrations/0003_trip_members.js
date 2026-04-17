/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const users = app.findCollectionByNameOrId('users');

		const collection = new Collection({
			type: 'base',
			name: 'trip_members',
			fields: [
				{ type: 'relation', name: 'trip', required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'relation', name: 'user', collectionId: users.id, maxSelect: 1 },
				{ type: 'text', name: 'placeholder_name', max: 100 },
				{ type: 'email', name: 'placeholder_email' },
				{ type: 'text', name: 'display_name', max: 100 },
				{ type: 'select', name: 'role', required: true, values: ['owner', 'co_owner', 'traveler', 'viewer'], maxSelect: 1 },
				{ type: 'date', name: 'joined_at' },
			],
			indexes: [
				'CREATE INDEX idx_trip_members_trip_user ON trip_members (trip, user)',
				'CREATE UNIQUE INDEX idx_trip_members_unique ON trip_members (trip, user) WHERE user != ""',
			],
			// Permissive rules initially; tightened in 0008
			listRule: '@request.auth.id != ""',
			viewRule: '@request.auth.id != ""',
			createRule: null,
			updateRule: '@request.auth.id != ""',
			deleteRule: null,
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('trip_members');
		app.delete(collection);
	}
);
