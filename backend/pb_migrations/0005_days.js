/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const phases = app.findCollectionByNameOrId('phases');

		const collection = new Collection({
			type: 'base',
			name: 'days',
			fields: [
				{ type: 'relation', name: 'trip', required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'relation', name: 'phase', collectionId: phases.id, maxSelect: 1 },
				{ type: 'date', name: 'date', required: true },
				{ type: 'text', name: 'notes', max: 5000 },
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_days_trip_date ON days (trip, date)',
				'CREATE INDEX idx_days_trip_phase ON days (trip, phase)',
			],
			// Permissive rules initially; tightened in 0008
			listRule: '@request.auth.id != ""',
			viewRule: '@request.auth.id != ""',
			createRule: null,
			updateRule: '@request.auth.id != ""',
			deleteRule: null,
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('days');
		app.delete(collection);
	}
);
