/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		trips.fields.add(
			new TextField({ name: 'vault_password_hash', max: 500 })
		);
		app.save(trips);
	},
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		trips.fields.removeByName('vault_password_hash');
		app.save(trips);
	}
);
