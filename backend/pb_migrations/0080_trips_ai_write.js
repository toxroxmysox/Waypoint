/// <reference path="../pb_data/types.d.ts" />
// #503 / ADR-0025 §6 — "AI can make changes": may a member's connected AI write
// to this trip? Needs ai_access (read). Positive logic, default ON: backfill every
// existing trip to true; trips.pb.js sets it true on create. Owner/co_owner-only
// change (the trips.pb.js protected-field gate).
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		trips.fields.add(new BoolField({ name: 'ai_write', required: false }));
		app.save(trips);
		app.db().newQuery('UPDATE trips SET ai_write = TRUE').execute();
	},
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		trips.fields.removeByName('ai_write');
		app.save(trips);
	}
);
