/// <reference path="../pb_data/types.d.ts" />
// Add cascadeDelete to suggestions.trip so deleting a trip
// also removes its suggestions (fixture teardown was failing without this).
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const collection = app.findCollectionByNameOrId('suggestions');
		const field = collection.fields.getByName('trip');
		field.cascadeDelete = true;
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('suggestions');
		const field = collection.fields.getByName('trip');
		field.cascadeDelete = false;
		app.save(collection);
	}
);
