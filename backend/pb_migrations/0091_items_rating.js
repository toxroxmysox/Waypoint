/// <reference path="../pb_data/types.d.ts" />
// #576 — closeout rating: one optional verdict per done item. Only `done` items
// carry it; the items model hooks clear it on any other status.
migrate(
	(app) => {
		const c = app.findCollectionByNameOrId('items');
		c.fields.add(
			new SelectField({
				name: 'rating',
				required: false,
				maxSelect: 1,
				values: ['recommend', 'not_recommend']
			})
		);
		app.save(c);
	},
	(app) => {
		const c = app.findCollectionByNameOrId('items');
		c.fields.removeByName('rating');
		app.save(c);
	}
);
