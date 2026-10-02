/// <reference path="../pb_data/types.d.ts" />
// #390 — add the system `created`/`updated` autodate fields to every collection
// that still lacks them. All 13 were built with explicit `fields` arrays that
// omitted the autodates (same scar as 0041 for items/trip_goals; cerebrum
// Do-Not-Repeat: explicit-field migrations drop autodate).
//
// Two visible symptoms on main: `pending_invites` sorted by `-created` 400'd
// into a swallowed empty list (#352 worked around it with `-expires_at`), and
// the notification bell rendered no timestamps (`created` was always null) and
// ordered "newest first" by `-id`, which is random in PB.
//
// Append-only; guarded so a collection that somehow already has the field is
// left alone. Existing rows keep EMPTY created/updated — measured on PB 0.27.2
// by upgrading a seeded 0068 database (NOT the migration run time, despite what
// 0041's comment says). `-created` therefore sorts pre-0069 rows last, which is
// the right end for "newest first"; new rows timestamp normally.
const COLLECTIONS = [
	'trips',
	'trip_members',
	'phases',
	'days',
	'checklist_items',
	'pending_invites',
	'notifications',
	'expenses',
	'settlements',
	'trip_budgets',
	'votes',
	'checklists',
	'tasks'
];

migrate(
	(app) => {
		for (const name of COLLECTIONS) {
			const c = app.findCollectionByNameOrId(name);
			if (!c.fields.getByName('created')) {
				c.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }));
			}
			if (!c.fields.getByName('updated')) {
				c.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }));
			}
			app.save(c);
		}
	},
	(app) => {
		for (const name of COLLECTIONS) {
			const c = app.findCollectionByNameOrId(name);
			c.fields.removeByName('created');
			c.fields.removeByName('updated');
			app.save(c);
		}
	}
);
