/// <reference path="../pb_data/types.d.ts" />
// #75 — Trip Goals (capture & list). V4_GROUP_INPUT_PRD "Domain model — Trip Goal".
//
// A trip-scoped, phase-less / time-less / location-less aspiration. Sibling to
// `phases` — NOT an item and NOT a container. The `items` relation is the
// cross-cutting item↔goal link (stored goal-side, deliberately); it exists here
// but is only exercised in the later status-derivation slice (#78).
//
// Permissions (PRD "Permissions — Trip Goal", minus the goal_votes clause which
// lands in #77):
//   - create/edit: owner·co_owner·traveler — NO suggestion queue; viewers read-only
//   - delete: creator OR owner/co_owner   (the "AND zero goal_votes" clause is #77)
//
// What's a PB rule vs a hook (per backend/RULES.md strategy):
//   - create is fully rule-expressible: `created_by` is a single relation, so
//     `created_by.role != "viewer"` correlates the author's role per-record with
//     no multi-relation `?=` ambiguity, and `created_by.user = auth` forces
//     self-authorship.
//   - edit/delete act on an existing record by a (possibly) different member, so
//     the acting user's own role can't be correlated in one rule — that gating
//     lives in trip_goals.pb.js (mirrors the invites delete-hook pattern).
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const items = app.findCollectionByNameOrId('items');
		const tripMembers = app.findCollectionByNameOrId('trip_members');

		const MEMBER_VIA_TRIP =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';

		const collection = new Collection({
			type: 'base',
			name: 'trip_goals',
			fields: [
				{ type: 'relation', name: 'trip', required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'text', name: 'title', required: true, min: 1, max: 200 },
				{ type: 'text', name: 'description', max: 2000 },
				{ type: 'relation', name: 'created_by', required: true, collectionId: tripMembers.id, maxSelect: 1, cascadeDelete: false },
				{ type: 'select', name: 'manual_status', required: true, maxSelect: 1, values: ['unplanned', 'planned', 'done', 'considered'] },
				{ type: 'number', name: 'sort_order', min: 0 },
				{ type: 'relation', name: 'items', collectionId: items.id, maxSelect: 999, cascadeDelete: false },
			],
			indexes: [
				'CREATE INDEX idx_trip_goals_trip ON trip_goals (trip)',
				'CREATE INDEX idx_trip_goals_trip_sort ON trip_goals (trip, sort_order)',
			],
			listRule: MEMBER_VIA_TRIP,
			viewRule: MEMBER_VIA_TRIP,
			// create: member, authoring as themselves, and not a viewer.
			createRule:
				MEMBER_VIA_TRIP +
				' && created_by.user = @request.auth.id && created_by.role != "viewer"',
			// edit/delete: rule stays at membership; role gating is in trip_goals.pb.js.
			updateRule: MEMBER_VIA_TRIP,
			deleteRule: MEMBER_VIA_TRIP,
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('trip_goals');
		app.delete(collection);
	}
);
