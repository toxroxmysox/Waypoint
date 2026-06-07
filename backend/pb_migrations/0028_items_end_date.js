/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const items = app.findCollectionByNameOrId('items');
		items.fields.add(
			new DateField({
				name: 'end_date'
			})
		);
		app.save(items);
	},
	(app) => {
		const items = app.findCollectionByNameOrId('items');
		items.fields.removeByName('end_date');
		app.save(items);
	}
);
