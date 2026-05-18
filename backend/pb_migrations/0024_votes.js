/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const items = app.findCollectionByNameOrId('items');
		const tripMembers = app.findCollectionByNameOrId('trip_members');

		const MEMBER_VIA_TRIP =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';

		const collection = new Collection({
			type: 'base',
			name: 'votes',
			fields: [
				{ type: 'relation', name: 'trip', required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'relation', name: 'item', required: true, collectionId: items.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'relation', name: 'member', required: true, collectionId: tripMembers.id, maxSelect: 1, cascadeDelete: true },
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_votes_item_member ON votes (item, member)',
				'CREATE INDEX idx_votes_trip ON votes (trip)',
				'CREATE INDEX idx_votes_item ON votes (item)',
			],
			listRule: MEMBER_VIA_TRIP,
			viewRule: MEMBER_VIA_TRIP,
			createRule: MEMBER_VIA_TRIP,
			deleteRule: MEMBER_VIA_TRIP + ' && member.user = @request.auth.id',
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('votes');
		app.delete(collection);
	}
);
