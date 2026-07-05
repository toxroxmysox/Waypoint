/// <reference path="../pb_data/types.d.ts" />
// #337 (Candidate Scenarios / Ideation) — the `scenarios` collection.
//
// A scenario is a pitch for what a FORMING trip could be ("going here, doing
// this"), weighed by the group; the winner promotes the trip out of forming
// (docs/superpowers/specs/2026-07-03-scenario-building-design.md). Champion-
// authored, forkable, compared on a vertical board of rich cards.
//
// Fields (spec §Data model):
//   trip               relation → trips        required, cascadeDelete
//   title              text                    required — the pitch name
//   pitch              text ≤200               optional one-liner
//   champion           relation → trip_members required; author-owned (only the
//                                              champion edits/deletes; others fork)
//   date_start/date_end date                   OPTIONAL at create; BOTH required
//                                              to promote (app-layer gate)
//   budget_per_person  number                  OPTIONAL (USD, rough). ⚠ PB numbers
//                                              can't be null — unset stores as 0;
//                                              ALL reads treat 0/falsy as "no
//                                              budget" (the #332/#335 scar), never
//                                              render "$0".
//   phase_sketch       json                    ordered [{name, days}] — durations,
//                                              NOT real phase records (forming
//                                              trips have no days yet).
//   keystones          relation → items, multi anchor ideas (one idea pool — the
//                                              composer quick-create makes an
//                                              unplanned item + attaches).
//   fork_of            relation → scenarios    optional; lineage badge "⑂ fork of X"
//   status             select candidate|won|archived  (archived = lost at promotion)
//   created/updated    autodate                explicit-field collections get NO
//                                              implicit timestamps (bug-185).
//
// Permissions (spec §Permissions; PB rules first):
//   list/view — ALL trip members incl. viewers (everyone reads the board).
//   create    — owner/co_owner/traveler authoring as THEMSELVES (champion.user =
//               auth && champion.role != "viewer"); viewers read-only. Mirrors
//               trip_goals 0040 / memories 0058.
//   update    — CHAMPION only. The rule stays at membership (an edit acts on an
//               existing record whose champion may differ from the caller); the
//               champion-only gate lives in scenarios.pb.js (0067), mirroring the
//               trip_goals edit/delete pattern (the acting user's role/identity
//               can't be correlated in a single rule).
//   delete    — CHAMPION only (same hook gate).
//   promotion — status flips to won/archived are HOOK-written server-side at
//               promotion; the champion-only update gate covers a champion's own
//               edits, promotion runs in the admin-context cascade (0067).
//
// IMPERATIVE field-add API on purpose: the declarative new Collection({fields:[...]})
// constructor-array form has silently dropped fields on this PB build before
// (bugs 0018/0053) — the imperative collection.fields.add(new XxxField()) form is
// the proven-safe path (guardrail). fork_of is a SELF relation, so the collection
// must exist before that field is added (two-step save).
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const tripMembers = app.findCollectionByNameOrId('trip_members');
		const items = app.findCollectionByNameOrId('items');

		const MEMBER_VIA_TRIP =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';
		const CHAMPION_SELF = ' && champion.user = @request.auth.id';

		const collection = new Collection({ type: 'base', name: 'scenarios' });

		collection.fields.add(
			new RelationField({
				name: 'trip',
				required: true,
				collectionId: trips.id,
				maxSelect: 1,
				cascadeDelete: true
			})
		);
		collection.fields.add(new TextField({ name: 'title', required: true, min: 1, max: 120 }));
		collection.fields.add(new TextField({ name: 'pitch', required: false, max: 200 }));
		collection.fields.add(
			new RelationField({
				name: 'champion',
				required: true,
				collectionId: tripMembers.id,
				maxSelect: 1,
				cascadeDelete: false
			})
		);
		collection.fields.add(new DateField({ name: 'date_start', required: false }));
		collection.fields.add(new DateField({ name: 'date_end', required: false }));
		collection.fields.add(new NumberField({ name: 'budget_per_person', required: false, min: 0 }));
		collection.fields.add(new JSONField({ name: 'phase_sketch', required: false, maxSize: 20000 }));
		collection.fields.add(
			new RelationField({
				name: 'keystones',
				required: false,
				collectionId: items.id,
				maxSelect: 999,
				cascadeDelete: false
			})
		);
		collection.fields.add(
			new SelectField({
				name: 'status',
				required: true,
				maxSelect: 1,
				values: ['candidate', 'won', 'archived']
			})
		);
		collection.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }));
		collection.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }));

		collection.indexes = [
			'CREATE INDEX idx_scenarios_trip ON scenarios (trip)',
			'CREATE INDEX idx_scenarios_trip_status ON scenarios (trip, status)'
		];

		collection.listRule = MEMBER_VIA_TRIP;
		collection.viewRule = MEMBER_VIA_TRIP;
		// create: member authoring as self, non-viewer (champion is a single relation
		// so the role check is unambiguous — mirrors trip_goals / memories).
		collection.createRule =
			MEMBER_VIA_TRIP + CHAMPION_SELF + ' && champion.role != "viewer"';
		// edit/delete: rule stays at membership; scenarios.pb.js (0067) enforces
		// champion-only (the acting user can't be correlated in a single rule).
		collection.updateRule = MEMBER_VIA_TRIP;
		collection.deleteRule = MEMBER_VIA_TRIP;

		app.save(collection);

		// fork_of is a SELF relation → add it after the first save so the collection
		// id exists to target.
		const scenarios = app.findCollectionByNameOrId('scenarios');
		scenarios.fields.add(
			new RelationField({
				name: 'fork_of',
				required: false,
				collectionId: scenarios.id,
				maxSelect: 1,
				cascadeDelete: false
			})
		);
		app.save(scenarios);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('scenarios');
		app.delete(collection);
	}
);
