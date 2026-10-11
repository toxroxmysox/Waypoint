/// <reference path="../pb_data/types.d.ts" />
// #502 / ADR-0024 §2 — AI Access: may a member's connected AI (e.g. the Claude
// connector) read this trip? Positive logic, default ON. A PB bool defaults to
// false, so this backfills every existing trip to true, and trips.pb.js sets it
// true on create when the request omits it. Owner/co_owner-only change (the
// trips.pb.js protected-field gate).
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		trips.fields.add(new BoolField({ name: 'ai_access', required: false }));
		app.save(trips);
		app.db().newQuery('UPDATE trips SET ai_access = TRUE').execute();
	},
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		trips.fields.removeByName('ai_access');
		app.save(trips);
	}
);
