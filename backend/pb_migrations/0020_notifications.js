/// <reference path="../pb_data/types.d.ts" />
// M2f: notifications collection.
// All creates go through hook triggers (admin context) — createRule is null.
// Recipients can read their own and mark them read; nothing else.
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const tripMembers = app.findCollectionByNameOrId('trip_members');
		const users = app.findCollectionByNameOrId('users');

		const collection = new Collection({
			type: 'base',
			name: 'notifications',
			fields: [
				{ type: 'relation', name: 'trip', required: true, collectionId: trips.id, maxSelect: 1 },
				// recipient is a trip_member record
				{ type: 'relation', name: 'recipient', required: true, collectionId: tripMembers.id, maxSelect: 1 },
				// type discriminator: suggestion_added | comment_added | member_joined
				{ type: 'text', name: 'type', required: true },
				// human-readable label, e.g. "Jake suggested: Hotel check-in"
				{ type: 'text', name: 'body', max: 500 },
				// deep link within the app
				{ type: 'text', name: 'link', max: 500 },
				{ type: 'datetime', name: 'read_at' },
			],
			// recipient reads their own via trip_members.user = auth.id
			listRule: '@request.auth.id != "" && recipient.user = @request.auth.id',
			viewRule: '@request.auth.id != "" && recipient.user = @request.auth.id',
			createRule: null,
			// recipient marks read by setting read_at
			updateRule: '@request.auth.id != "" && recipient.user = @request.auth.id',
			deleteRule: null,
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('notifications');
		app.delete(collection);
	}
);
