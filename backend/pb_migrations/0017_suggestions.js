/// <reference path="../pb_data/types.d.ts" />
// M2d: suggestions collection.
//
// All creates + updates go through hook endpoints (admin context).
// Direct API rules are locked down so only owners/co-owners can list all,
// and authors can read their own via the list endpoint (which uses admin).
// The collection rules below are for direct API access as a safety net.
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const tripMembers = app.findCollectionByNameOrId('trip_members');
		const items = app.findCollectionByNameOrId('items');

		const collection = new Collection({
			type: 'base',
			name: 'suggestions',
			fields: [
				{ type: 'relation', name: 'trip', required: true, collectionId: trips.id, maxSelect: 1 },
				{ type: 'relation', name: 'author', required: true, collectionId: tripMembers.id, maxSelect: 1 },
				{ type: 'select', name: 'target_type', required: true, maxSelect: 1, values: ['new_item', 'comment'] },
				{ type: 'relation', name: 'target_item', required: false, collectionId: items.id, maxSelect: 1 },
				{ type: 'json', name: 'payload', maxSize: 65536 },
				{ type: 'text', name: 'comment_text', max: 5000 },
				{ type: 'select', name: 'status', required: true, maxSelect: 1, values: ['pending', 'approved', 'rejected'] },
				{ type: 'relation', name: 'reviewed_by', required: false, collectionId: tripMembers.id, maxSelect: 1 },
				{ type: 'datetime', name: 'reviewed_at' },
			],
			listRule: '@request.auth.id != "" && trip.members_via_trip.user ?= @request.auth.id',
			viewRule: '@request.auth.id != "" && trip.members_via_trip.user ?= @request.auth.id',
			createRule: null,
			updateRule: null,
			deleteRule: null,
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('suggestions');
		app.delete(collection);
	}
);
