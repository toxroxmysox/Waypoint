/// <reference path="../pb_data/types.d.ts" />
// #337 (Candidate Scenarios) — `decisions`. A small append-only collection minted
// by the promotion cascade (scenarios.pb.js, 0067) when an owner/co_owner picks a
// scenario. The immutable snapshot ("How we decided") stays readable forever:
// every scenario incl. sketch + keystone labels, vote tallies, pros/cons, chooser,
// date (spec §Data model).
//
// Fields:
//   trip     relation → trips   required, cascadeDelete
//   payload  json               the immutable decision snapshot
//   created/updated autodate    (explicit-field collections get none — bug-185)
//
// Permissions (spec §Permissions — "decisions created by hook at promotion, never
// client-written"):
//   list/view — ALL trip members incl. viewers (the record is readable forever).
//   create/update/delete — NONE (all rules null → DENY_ALL for every client role,
//               incl. owner). The promotion cascade writes via e.app.save in an
//               admin context, which bypasses collection rules — so hook-only
//               writes need no create rule.
//
// IMPERATIVE field-add API (guardrail: constructor-array form has dropped fields —
// bugs 0018/0053). payload can be large (snapshots every sibling scenario) → a
// generous maxSize.
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');

		const MEMBER_VIA_TRIP =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';

		const collection = new Collection({ type: 'base', name: 'decisions' });

		collection.fields.add(
			new RelationField({
				name: 'trip',
				required: true,
				collectionId: trips.id,
				maxSelect: 1,
				cascadeDelete: true
			})
		);
		collection.fields.add(new JSONField({ name: 'payload', required: false, maxSize: 200000 }));
		collection.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }));
		collection.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }));

		collection.indexes = ['CREATE INDEX idx_decisions_trip ON decisions (trip)'];

		collection.listRule = MEMBER_VIA_TRIP;
		collection.viewRule = MEMBER_VIA_TRIP;
		// Hook-only writes: no client create/update/delete. The admin-context cascade
		// (scenarios.pb.js) bypasses these rules.
		collection.createRule = null;
		collection.updateRule = null;
		collection.deleteRule = null;

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('decisions');
		app.delete(collection);
	}
);
