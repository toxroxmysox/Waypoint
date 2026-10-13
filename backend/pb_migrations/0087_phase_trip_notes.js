/// <reference path="../pb_data/types.d.ts" />
// #401 — Phase Notes and Trip Notes: free text on the phase and the trip, edited
// like day notes (any non-viewer member; gates in phases.pb.js / trips.pb.js).
migrate(
	(app) => {
		for (const name of ['phases', 'trips']) {
			const c = app.findCollectionByNameOrId(name);
			c.fields.add(new TextField({ name: 'notes', required: false, max: 5000 }));
			app.save(c);
		}
	},
	(app) => {
		for (const name of ['phases', 'trips']) {
			const c = app.findCollectionByNameOrId(name);
			c.fields.removeByName('notes');
			app.save(c);
		}
	}
);
