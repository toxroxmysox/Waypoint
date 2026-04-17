/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');

		const collection = new Collection({
			type: 'base',
			name: 'phases',
			fields: [
				{ type: 'relation', name: 'trip', required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'text', name: 'name', required: true, min: 1, max: 100 },
				{ type: 'text', name: 'location', max: 200 },
				{ type: 'text', name: 'country_code', max: 2 },
				{ type: 'date', name: 'start_date' },
				{ type: 'date', name: 'end_date' },
				{ type: 'text', name: 'color', max: 7 },
				{ type: 'number', name: 'order', min: 0 },
			],
			indexes: ['CREATE INDEX idx_phases_trip_order ON phases (trip, `order`)'],
			// Permissive rules initially; tightened in 0008
			listRule: '@request.auth.id != ""',
			viewRule: '@request.auth.id != ""',
			createRule: '@request.auth.id != ""',
			updateRule: '@request.auth.id != ""',
			deleteRule: '@request.auth.id != ""',
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('phases');
		app.delete(collection);
	}
);
