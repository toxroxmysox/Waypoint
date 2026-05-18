/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('items');
		const statusField = collection.fields.getByName('status');
		statusField.values = ['planned', 'done', 'considered'];
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('items');
		const statusField = collection.fields.getByName('status');
		statusField.values = ['planned', 'done'];
		app.save(collection);
	}
);
