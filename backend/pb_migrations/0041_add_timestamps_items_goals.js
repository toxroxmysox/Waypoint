/// <reference path="../pb_data/types.d.ts" />
// Backfill the system `created`/`updated` autodate fields onto `items` and
// `trip_goals`. Both collections were created with explicit `fields` arrays
// (0006, 0040) that omitted the autodate fields, so PocketBase rejects any
// `sort: 'created'` / `sort: '-created'` on them with HTTP 400 → page 500.
//
// The Swipe-Quiz harvest (#76) sorts `items` by 'created' (the oldest-first
// tiebreak, Resolution 8) and 500'd on the live deploy; the goal-capture deck
// (#79) will need the same field on `trip_goals`. Append-only — existing rows
// backfill to the migration run time (acceptable: only the oldest-first tiebreak
// on pre-existing dogfood data is affected; new records timestamp correctly).
// See cerebrum Do-Not-Repeat [2026-06-08] (explicit-field migrations drop autodate).
migrate(
	(app) => {
		for (const name of ['items', 'trip_goals']) {
			const c = app.findCollectionByNameOrId(name);
			c.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }));
			c.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }));
			app.save(c);
		}
	},
	(app) => {
		for (const name of ['items', 'trip_goals']) {
			const c = app.findCollectionByNameOrId(name);
			c.fields.removeByName('created');
			c.fields.removeByName('updated');
			app.save(c);
		}
	}
);
