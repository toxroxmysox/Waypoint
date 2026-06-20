/// <reference path="../pb_data/types.d.ts" />
// #230 / ADR-0015 — Money Units. A self-declared, SHARED, trip-scoped grouping of members
// who pool money (a couple, or any ad-hoc pool). NOT a split or payer concept — it changes
// nothing about how expenses divide (always per-person). It does two things, both in the
// app/pure layer (src/lib/money/money-units.ts), never in a hook:
//   1. Settle-up collapses to unit-nodes (a member→unit pre-aggregation in front of
//      debt-simplify): intra-unit debts wash, inter-unit nets, any one member settles the
//      unit's net. This is why a joint-payer field is unnecessary.
//   2. The Trip-Mode glance auto-scopes to the viewer's own unit, with a unit budget that
//      defaults to the even share (group ÷ heads × unit size) OR an optional ABSOLUTE
//      override that does NOT redistribute / change the group total.
//
// Data is the ONLY thing the backend owns here: the grouping + an optional per-unit budget
// override. A solo member is a unit of one and needs NO row (the pure layer treats anyone
// in no unit as their own node) — rows exist only for declared multi-member pools.
//
// Fields:
//   trip       rel→trips        (req, cascadeDelete — units die with the trip)
//   members    rel→trip_members (req, multi; minSelect 1 — the pooled members)
//   budget_usd number           (optional; the absolute custom override. Empty/unset →
//                                the pure layer uses the even-share default. min 0.)
//   created_by rel→trip_members (req — who created the unit; ADR-0015: a member creates it)
//
// Rules — MEMBER_VIA_TRIP throughout (mirrors expenses / goal_votes). Any trip member may
// list/view/create a unit; update/delete is any member because "anyone can leave" (opt-out
// is the consent valve — leaving is a member updating the `members` list / deleting the
// pool). Finer gating (only-a-member-of-the-unit edits) is deferred; v1 ships the mechanics.
//
// Autodate created/updated are added EXPLICITLY — a Collection built from an explicit
// `fields` array drops the system autodate fields, which 500s any `sort: 'created'`
// (cerebrum Do-Not-Repeat [2026-06-08]; bit documents + goal_votes). Append-only: this is
// migration 0050, never edited/deleted.
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const tripMembers = app.findCollectionByNameOrId('trip_members');

		const MEMBER_VIA_TRIP =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';

		const collection = new Collection({
			type: 'base',
			name: 'money_units',
			fields: [
				{ type: 'relation', name: 'trip', required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'relation', name: 'members', required: true, collectionId: tripMembers.id, minSelect: 1, maxSelect: 999 },
				{ type: 'number', name: 'budget_usd', required: false, min: 0 },
				{ type: 'relation', name: 'created_by', required: true, collectionId: tripMembers.id, maxSelect: 1 }
			],
			indexes: ['CREATE INDEX idx_money_units_trip ON money_units (trip)'],
			listRule: MEMBER_VIA_TRIP,
			viewRule: MEMBER_VIA_TRIP,
			createRule: MEMBER_VIA_TRIP,
			// Any member may update/delete — leaving (opt-out) is editing `members`; the
			// consent valve is that anyone in the pool can remove themselves.
			updateRule: MEMBER_VIA_TRIP,
			deleteRule: MEMBER_VIA_TRIP
		});

		// Explicit autodate — see header note (explicit-field collections drop these).
		collection.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }));
		collection.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }));

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('money_units');
		app.delete(collection);
	}
);
