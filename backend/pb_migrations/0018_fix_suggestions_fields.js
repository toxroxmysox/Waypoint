/// <reference path="../pb_data/types.d.ts" />
// 0017 created the suggestions collection but fields were not persisted.
// This migration adds the missing fields using the fields.add() pattern.
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const tripMembers = app.findCollectionByNameOrId('trip_members');
		const items = app.findCollectionByNameOrId('items');
		const collection = app.findCollectionByNameOrId('suggestions');

		collection.fields.add(new RelationField({ name: 'trip', required: true, collectionId: trips.id, maxSelect: 1 }));
		collection.fields.add(new RelationField({ name: 'author', required: true, collectionId: tripMembers.id, maxSelect: 1 }));
		collection.fields.add(new SelectField({ name: 'target_type', required: true, maxSelect: 1, values: ['new_item', 'comment'] }));
		collection.fields.add(new RelationField({ name: 'target_item', required: false, collectionId: items.id, maxSelect: 1 }));
		collection.fields.add(new JSONField({ name: 'payload', maxSize: 65536 }));
		collection.fields.add(new TextField({ name: 'comment_text', max: 5000 }));
		collection.fields.add(new SelectField({ name: 'status', required: true, maxSelect: 1, values: ['pending', 'approved', 'rejected'] }));
		collection.fields.add(new RelationField({ name: 'reviewed_by', required: false, collectionId: tripMembers.id, maxSelect: 1 }));
		collection.fields.add(new DateField({ name: 'reviewed_at' }));

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('suggestions');
		['trip', 'author', 'target_type', 'target_item', 'payload', 'comment_text', 'status', 'reviewed_by', 'reviewed_at'].forEach((name) => {
			collection.fields.removeByName(name);
		});
		app.save(collection);
	}
);
