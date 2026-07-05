/// <reference path="../pb_data/types.d.ts" />
// #337 (Candidate Scenarios) — `scenario_votes`. Mirrors `votes` (0024/0029) and
// the parallel-collection precedent goal_votes (0042) / suggestion_votes (0049):
// a separate votable-target collection (ADR-0004), NOT polymorphic, so every rule
// is expressible via the single-parent path `scenario → trip` with no branching.
//
// The 4-option weighted `value` reuses the map in src/lib/collaboration/voting.ts
// (love/like/flexible/dislike; "dislike" renders as "Pass"). Score is never shown
// numerically — only avatar stacks (spec §Surface "The group").
//
// Fields (spec §Data model — "mirrors votes"):
//   scenario relation → scenarios     required, cascadeDelete
//   member   relation → trip_members  required (vote AS yourself)
//   value    select love|like|flexible|dislike
//   created/updated autodate          (explicit-field collections get none — bug-185)
// Unique (scenario, member) → a re-vote is an UPDATE, not an insert.
//
// Permissions (spec §Permissions):
//   list/view — ALL trip members incl. viewers (everyone reads the board).
//   create    — owner/co_owner/traveler voting AS THEMSELVES (member.user = auth,
//               member.role != "viewer"); viewers read-only. member is a single
//               relation so role/user correlate unambiguously (no can't-vote-own
//               rule — unlike goals/suggestions you MAY vote a scenario you champion).
//   update/delete — own vote only (SELF_ONLY: member.user = auth).
//
// IMPERATIVE field-add API (guardrail: the constructor-array form has dropped
// fields on this PB build — bugs 0018/0053).
migrate(
	(app) => {
		const scenarios = app.findCollectionByNameOrId('scenarios');
		const tripMembers = app.findCollectionByNameOrId('trip_members');

		// Membership resolved single-parent via the scenario's trip (no redundant
		// `trip` FK — reachable via scenario.trip, mirroring goal_votes 0042).
		const MEMBER_VIA_SCENARIO =
			'@request.auth.id != "" && scenario.trip.trip_members_via_trip.user ?= @request.auth.id';
		const SELF = ' && member.user = @request.auth.id';

		const collection = new Collection({ type: 'base', name: 'scenario_votes' });

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
			new SelectField({
				name: 'value',
				required: true,
				maxSelect: 1,
				values: ['love', 'like', 'flexible', 'dislike']
			})
		);
		collection.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }));
		collection.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }));

		collection.indexes = [
			'CREATE UNIQUE INDEX idx_scenario_votes_scenario_member ON scenario_votes (scenario, member)',
			'CREATE INDEX idx_scenario_votes_scenario ON scenario_votes (scenario)'
		];

		collection.listRule = MEMBER_VIA_SCENARIO;
		collection.viewRule = MEMBER_VIA_SCENARIO;
		collection.createRule = MEMBER_VIA_SCENARIO + SELF + ' && member.role != "viewer"';
		collection.updateRule = MEMBER_VIA_SCENARIO + SELF;
		collection.deleteRule = MEMBER_VIA_SCENARIO + SELF;

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('scenario_votes');
		app.delete(collection);
	}
);
