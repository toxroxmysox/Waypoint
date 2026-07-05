/// <reference path="../pb_data/types.d.ts" />
// #337 (Candidate Scenarios) — `scenario_points`. Pros/cons as comment-like
// entries on a scenario (spec §Data model): scenario / member / kind pro|con /
// text ≤200. Author-deletable only. Single-parent ownership via scenario → trip.
//
// Fields:
//   scenario relation → scenarios     required, cascadeDelete
//   member   relation → trip_members  required (author, pinned as self)
//   kind     select pro|con
//   text     text ≤200
//   created/updated autodate          (explicit-field collections get none — bug-185)
//
// Permissions (spec §Permissions):
//   list/view — ALL trip members incl. viewers.
//   create    — owner/co_owner/traveler as THEMSELVES (member.user = auth,
//               member.role != "viewer"); viewers read-only.
//   update    — none (updateRule null). A point is immutable; delete + re-add to
//               change (mirrors the pending_invites/documents immutability
//               posture — nothing needs to edit a one-line pro/con).
//   delete    — author only (SELF_ONLY: member.user = auth). No moderation override.
//
// IMPERATIVE field-add API (guardrail: constructor-array form has dropped fields —
// bugs 0018/0053).
migrate(
	(app) => {
		const scenarios = app.findCollectionByNameOrId('scenarios');
		const tripMembers = app.findCollectionByNameOrId('trip_members');

		const MEMBER_VIA_SCENARIO =
			'@request.auth.id != "" && scenario.trip.trip_members_via_trip.user ?= @request.auth.id';
		const SELF = ' && member.user = @request.auth.id';

		const collection = new Collection({ type: 'base', name: 'scenario_points' });

		collection.fields.add(
			new RelationField({
				name: 'scenario',
				required: true,
				collectionId: scenarios.id,
				maxSelect: 1,
				cascadeDelete: true
			})
		);
		collection.fields.add(
			new RelationField({
				name: 'member',
				required: true,
				collectionId: tripMembers.id,
				maxSelect: 1,
				cascadeDelete: true
			})
		);
		collection.fields.add(
			new SelectField({ name: 'kind', required: true, maxSelect: 1, values: ['pro', 'con'] })
		);
		collection.fields.add(new TextField({ name: 'text', required: true, min: 1, max: 200 }));
		collection.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }));
		collection.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }));

		collection.indexes = [
			'CREATE INDEX idx_scenario_points_scenario ON scenario_points (scenario)'
		];

		collection.listRule = MEMBER_VIA_SCENARIO;
		collection.viewRule = MEMBER_VIA_SCENARIO;
		collection.createRule = MEMBER_VIA_SCENARIO + SELF + ' && member.role != "viewer"';
		// Immutable — no update path.
		collection.updateRule = null;
		collection.deleteRule = MEMBER_VIA_SCENARIO + SELF;

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('scenario_points');
		app.delete(collection);
	}
);
