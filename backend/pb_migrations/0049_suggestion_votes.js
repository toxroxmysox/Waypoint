/// <reference path="../pb_data/types.d.ts" />
// #248 / PRD #202 / ADR-0009 — Pending suggestions are votable Ghost Cards. New
// `suggestion_votes` collection that PARALLELS `votes` and `goal_votes` (NOT
// polymorphic) per ADR-0004/ADR-0009. A vote's trip-ownership path for a
// suggestion is single-parent `suggestion → trip`, so every rule is expressible
// without branching.
//
// Fields mirror `goal_votes` (the goal-vote template), minus a redundant `trip`
// FK (reachable via `suggestion`):
//   suggestion (rel→suggestions, req, cascadeDelete), member (rel→trip_members,
//   req, cascadeDelete), value (enum love/like/flexible/dislike).
//   Unique (suggestion, member).
//
// Rules (all rule-expressible — that is the whole point of the separate
// collection, ADR-0004/0009):
//   - list/view: any member of the suggestion's trip (ghosts are visible to ALL
//     members; the dotted/"pending" treatment is a render concern, not a data
//     gate).
//   - create: a non-viewer member of the suggestion's trip, voting AS THEMSELVES,
//     on a suggestion they did NOT author. `member` is a single relation so its
//     role/user correlate unambiguously; `suggestion.author != member` is the
//     can't-vote-your-own-suggestion rule (authorship is the implicit
//     endorsement — mirrors goal_votes' can't-vote-own-goal). `member.trip =
//     suggestion.trip` is the cross-trip guard.
//   - update/delete: own vote only (SELF_ONLY).
//
// Autodate `created`/`updated` are added explicitly — a Collection built from an
// explicit `fields` array drops the system autodate fields, which 500s any
// `sort: 'created'`. See cerebrum Do-Not-Repeat [2026-06-08] (bug-185); this bit
// us twice. The app sorts votes by time → 400 without them.
migrate(
	(app) => {
		const suggestions = app.findCollectionByNameOrId('suggestions');
		const tripMembers = app.findCollectionByNameOrId('trip_members');

		// Membership via the suggestion's single-parent trip path.
		const MEMBER_VIA_SUGGESTION =
			'@request.auth.id != "" && suggestion.trip.trip_members_via_trip.user ?= @request.auth.id';

		const collection = new Collection({
			type: 'base',
			name: 'suggestion_votes',
			fields: [
				{ type: 'relation', name: 'suggestion', required: true, collectionId: suggestions.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'relation', name: 'member', required: true, collectionId: tripMembers.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'select', name: 'value', required: true, maxSelect: 1, values: ['love', 'like', 'flexible', 'dislike'] }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_suggestion_votes_suggestion_member ON suggestion_votes (suggestion, member)',
				'CREATE INDEX idx_suggestion_votes_suggestion ON suggestion_votes (suggestion)'
			],
			listRule: MEMBER_VIA_SUGGESTION,
			viewRule: MEMBER_VIA_SUGGESTION,
			// create: non-viewer member, voting as self, on a suggestion they didn't author.
			createRule:
				MEMBER_VIA_SUGGESTION +
				' && member.user = @request.auth.id' +
				' && member.trip = suggestion.trip' +
				' && member.role != "viewer"' +
				' && suggestion.author != member',
			// update/delete: own vote only.
			updateRule: MEMBER_VIA_SUGGESTION + ' && member.user = @request.auth.id',
			deleteRule: MEMBER_VIA_SUGGESTION + ' && member.user = @request.auth.id'
		});

		// Explicit autodate — see header note.
		collection.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }));
		collection.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }));

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('suggestion_votes');
		app.delete(collection);
	}
);
