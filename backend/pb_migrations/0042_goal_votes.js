/// <reference path="../pb_data/types.d.ts" />
// #77 — Trip Goal voting. New `goal_votes` collection that PARALLELS `votes`
// (NOT polymorphic) per ADR-0004. A vote's trip-ownership path for a goal is
// single-parent `goal → trip`, so every rule is expressible without branching.
//
// Fields mirror `votes` minus the redundant `trip` FK (reachable via `goal`):
//   goal (rel→trip_goals, req), member (rel→trip_members, req),
//   value (enum love/like/flexible/dislike). Unique (goal, member).
//
// Rules (all rule-expressible — that is the whole point of the separate
// collection, ADR-0004):
//   - list/view: any member of the goal's trip.
//   - create: a non-viewer member of the goal's trip, voting AS THEMSELVES, on a
//     goal they did NOT create. `member` is a single relation so its role/user
//     correlate unambiguously; `goal.created_by != member` is the novel
//     can't-vote-your-own-goal rule (scoped to goals only — item votes unchanged).
//     `member.trip = goal.trip` is the cross-trip guard (mirrors the votes.pb.js
//     hook's member↔trip consistency check, here pushed into the rule).
//   - update/delete: own vote only (SELF_ONLY).
//
// Autodate `created`/`updated` are added explicitly — a Collection built from an
// explicit `fields` array drops the system autodate fields, which 500s any
// `sort: 'created'`. See cerebrum Do-Not-Repeat [2026-06-08]; this bit us twice.
// The Goals tab tiebreak sorts goals oldest-first but the autodate here also
// future-proofs any sort on the votes themselves.
migrate(
	(app) => {
		const tripGoals = app.findCollectionByNameOrId('trip_goals');
		const tripMembers = app.findCollectionByNameOrId('trip_members');

		// Membership via the goal's single-parent trip path.
		const MEMBER_VIA_GOAL =
			'@request.auth.id != "" && goal.trip.trip_members_via_trip.user ?= @request.auth.id';

		const collection = new Collection({
			type: 'base',
			name: 'goal_votes',
			fields: [
				{ type: 'relation', name: 'goal', required: true, collectionId: tripGoals.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'relation', name: 'member', required: true, collectionId: tripMembers.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'select', name: 'value', required: true, maxSelect: 1, values: ['love', 'like', 'flexible', 'dislike'] }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_goal_votes_goal_member ON goal_votes (goal, member)',
				'CREATE INDEX idx_goal_votes_goal ON goal_votes (goal)'
			],
			listRule: MEMBER_VIA_GOAL,
			viewRule: MEMBER_VIA_GOAL,
			// create: non-viewer member, voting as self, on a goal they didn't create.
			createRule:
				MEMBER_VIA_GOAL +
				' && member.user = @request.auth.id' +
				' && member.trip = goal.trip' +
				' && member.role != "viewer"' +
				' && goal.created_by != member',
			// update/delete: own vote only.
			updateRule: MEMBER_VIA_GOAL + ' && member.user = @request.auth.id',
			deleteRule: MEMBER_VIA_GOAL + ' && member.user = @request.auth.id'
		});

		// Explicit autodate — see header note.
		collection.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }));
		collection.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }));

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('goal_votes');
		app.delete(collection);
	}
);
