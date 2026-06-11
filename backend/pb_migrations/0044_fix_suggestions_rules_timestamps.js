/// <reference path="../pb_data/types.d.ts" />
// #122: comments/suggestions were invisible to regular members. Two defects in
// the `suggestions` collection (0017/0018), fixed append-only here:
//
// 1. listRule/viewRule used `trip.members_via_trip.user` — an invalid
//    back-relation (the collection is `trip_members`, so the back-relation is
//    `trip_members_via_trip`, as every other migration uses). PB can't resolve
//    the path, the rule never grants, and reads were effectively superuser-only.
//    create/update/delete stay null on purpose: writes go through the
//    /api/suggestions/* + /api/comments/add hook endpoints (admin context).
//
// 2. The collection was created with an explicit `fields` array and never got
//    the `created`/`updated` autodate fields, so the item-detail loader's
//    `sort: 'created'` 400'd and its `.catch(() => [])` silently yielded zero
//    comments. Same class as bug-185/186 — see cerebrum Do-Not-Repeat
//    [2026-06-08]. Existing rows backfill `created` to the migration run time.
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('suggestions');

		const memberRead = '@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';
		collection.listRule = memberRead;
		collection.viewRule = memberRead;

		collection.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }));
		collection.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }));

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('suggestions');

		const brokenRead = '@request.auth.id != "" && trip.members_via_trip.user ?= @request.auth.id';
		collection.listRule = brokenRead;
		collection.viewRule = brokenRead;

		collection.fields.removeByName('created');
		collection.fields.removeByName('updated');

		app.save(collection);
	}
);
