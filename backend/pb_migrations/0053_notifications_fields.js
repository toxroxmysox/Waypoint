/// <reference path="../pb_data/types.d.ts" />
// #260 — 0020 created the `notifications` collection but its fields were NOT
// persisted: on a fresh `scripts/e2e-clean-pb.sh` migrate the collection
// materializes with ONLY `id` (no error logged), so every `notif.set(...)` in
// the hooks is a silent no-op and notifications save EMPTY → the whole feature
// is broken on fresh installs.
//
// Root cause (NOT the `type` field name): the declarative `new Collection({
// fields: [...] })` constructor-array form silently drops the listed fields for
// these collections on the current PB build. The PROVEN precedent is
// 0018_fix_suggestions_fields.js — `suggestions` (0017) hit the identical
// failure and `suggestions` has NO `type` field, ruling out the reserved-word
// hypothesis. The fix, both times, is the IMPERATIVE `collection.fields.add(new
// XxxField(...))` API (which 0049, 0045, 0030, 0006, 0001 all use successfully
// on this same build).
//
// This forward-only migration ADDS the missing fields to the EXISTING
// `notifications` collection (append-only rule — 0020 is never edited) and
// re-applies 0020's intended rules. It is idempotent-safe: each field is added
// only if absent, so it is harmless on a long-lived PB (:8090) where 0020's
// fields DID materialize back when it first ran on an older build.
//
// No autodate added — 0020 defined none, and the list endpoint sorts by `id`,
// not `created` (so cerebrum Do-Not-Repeat [2026-06-08] / bug-185 does not bite
// here; there is no `sort: 'created'` against notifications).
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const tripMembers = app.findCollectionByNameOrId('trip_members');
		const collection = app.findCollectionByNameOrId('notifications');

		const existing = collection.fields.fieldNames();
		const has = (name) => existing.indexOf(name) !== -1;

		// Mirror 0020's intent exactly.
		if (!has('trip')) {
			collection.fields.add(
				new RelationField({ name: 'trip', required: true, collectionId: trips.id, maxSelect: 1 })
			);
		}
		// recipient is a trip_member record.
		if (!has('recipient')) {
			collection.fields.add(
				new RelationField({
					name: 'recipient',
					required: true,
					collectionId: tripMembers.id,
					maxSelect: 1
				})
			);
		}
		// type discriminator: suggestion_added | comment_added | member_joined |
		// suggestion_approved | suggestion_rejected.
		if (!has('type')) {
			collection.fields.add(new TextField({ name: 'type', required: true }));
		}
		// human-readable label, e.g. "Jake suggested: Hotel check-in".
		if (!has('body')) {
			collection.fields.add(new TextField({ name: 'body', max: 500 }));
		}
		// deep link within the app.
		if (!has('link')) {
			collection.fields.add(new TextField({ name: 'link', max: 500 }));
		}
		// recipient marks read by setting read_at.
		if (!has('read_at')) {
			collection.fields.add(new DateField({ name: 'read_at' }));
		}

		// Re-apply 0020's rules (idempotent — assigns the same values 0020 intended).
		// recipient reads their own via trip_members.user = auth.id.
		const OWN = '@request.auth.id != "" && recipient.user = @request.auth.id';
		collection.listRule = OWN;
		collection.viewRule = OWN;
		collection.createRule = null;
		collection.updateRule = OWN;
		collection.deleteRule = null;

		app.save(collection);
	},
	(app) => {
		// Down: remove the fields this migration added. Rules are left as-is (they
		// match 0020's, which owns the collection's lifecycle).
		const collection = app.findCollectionByNameOrId('notifications');
		['trip', 'recipient', 'type', 'body', 'link', 'read_at'].forEach((name) => {
			try {
				collection.fields.removeByName(name);
			} catch (_) {}
		});
		app.save(collection);
	}
);
