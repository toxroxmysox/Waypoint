/// <reference path="../pb_data/types.d.ts" />
// #175 — enforce the SPEC §4 / RULES.md role matrix on `items` and `phases`.
//
// THE GAP this closes
// -------------------
// Since 0008/0014 the `items` and `phases` create/update/delete rules have been
// plain `MEMBER_VIA_TRIP` (any member of the trip). That let VIEWERS write and
// let TRAVELERS edit/move/delete items + mutate phases directly — even though
// SPEC §4 says items are owner/co_owner only (travelers *suggest*, viewers are
// read-only) and phases are trip-structure (owner/co_owner only, same tier as
// "Create/edit trip metadata"). The suggestion queue only ever gated item
// *creation*; update/delete and all of phases were wide open. RULES.md
// documented the intended matrix ("items.update/delete: traveler —, viewer —")
// but the tightening never landed. This is findings WP-B-005 + WP-B-006.
//
// WHY THIS MIGRATION ONLY REASSERTS THE RULES (role lives in hooks)
// ----------------------------------------------------------------
// Role enforcement here cannot be expressed as a PB rule expression:
//   * update / delete — the acting caller is not necessarily the record's
//     author, so the caller's role has to be looked up against trip_members.
//     Correlating it in a rule means `trip.trip_members_via_trip.role ?= "owner"`
//     alongside `...user ?= @request.auth.id`, but the two `?=` terms can match
//     DIFFERENT member rows (the multi-relation aliasing gotcha RULES.md flags
//     for trip_goals) — so the rule can't safely say "the CALLER is an owner".
//   * items.create — `created_by` is a single relation, so `created_by.role`
//     would be unambiguous IF every caller set it to their own membership. But
//     the import and closeout flows create items WITHOUT setting `created_by`
//     (verified: trips/import + trips/[slug]/closeout). A `created_by.role`
//     create rule would 403 those owner-only flows. Rejected.
//   * phases — the collection has NO `created_by` field at all, so even create
//     cannot be correlated to the caller's role in a rule.
//
// So the rules stay `MEMBER_VIA_TRIP` (membership is still the rule-layer gate —
// non-members are denied here, defense in depth) and the OWNER/CO_OWNER role
// gate is enforced in the hooks `items.pb.js` (update + delete) and the extended
// `phases.pb.js` (create + update + delete), resolving the caller's actual
// membership and rejecting viewers + travelers. This mirrors the established
// contrast pattern: documents.pb.js / expenses.pb.js keep the rule at membership
// and put role logic in the hook; trip_goals.pb.js does the same for edit/delete.
// This migration is the explicit, documented record of that rule⇄hook split and
// keeps RULES.md ↔ migration ↔ code in lockstep (same spirit as 0014's audit).
//
// Owner / co_owner item + phase flows are UNCHANGED — they pass the hook role
// check. Traveler item creation routes through /api/suggestions/create (admin
// context), which bypasses these rules entirely, so the suggestion path is
// unaffected.
migrate(
	(app) => {
		const MEMBER_VIA_TRIP =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';

		// items — membership at the rule layer; owner/co_owner enforced in
		// items.pb.js (update + delete) and via the suggestion queue / hook for
		// create. Viewers + travelers are rejected by the hook, not the rule.
		const items = app.findCollectionByNameOrId('items');
		items.listRule = MEMBER_VIA_TRIP;
		items.viewRule = MEMBER_VIA_TRIP;
		// reason (#175): role gate is in items.pb.js onRecordCreate/Update/Delete
		// (owner/co_owner only). Rule stays membership because the caller's role
		// can't be correlated in a rule for update/delete, and import/closeout
		// create items without created_by (so a created_by.role rule would break
		// those owner flows).
		items.createRule = MEMBER_VIA_TRIP;
		items.updateRule = MEMBER_VIA_TRIP;
		items.deleteRule = MEMBER_VIA_TRIP;
		app.save(items);

		// phases — membership at the rule layer; owner/co_owner enforced in
		// phases.pb.js onRecordCreate/Update/Delete. Phases are trip-structure
		// (SPEC §4: owner/co_owner only). No created_by field, so create cannot be
		// rule-correlated to the caller's role either.
		const phases = app.findCollectionByNameOrId('phases');
		phases.listRule = MEMBER_VIA_TRIP;
		phases.viewRule = MEMBER_VIA_TRIP;
		phases.createRule = MEMBER_VIA_TRIP;
		phases.updateRule = MEMBER_VIA_TRIP;
		phases.deleteRule = MEMBER_VIA_TRIP;
		app.save(phases);
	},
	(app) => {
		// Down: rules are unchanged from their prior (0014) values, so there is
		// nothing to revert on the collections. The role gate is carried entirely
		// by the hooks; removing the hooks reverts the behavior. This down-leg
		// just reasserts the membership rules for symmetry.
		const MEMBER_VIA_TRIP =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';
		const items = app.findCollectionByNameOrId('items');
		items.createRule = MEMBER_VIA_TRIP;
		items.updateRule = MEMBER_VIA_TRIP;
		items.deleteRule = MEMBER_VIA_TRIP;
		app.save(items);
		const phases = app.findCollectionByNameOrId('phases');
		phases.createRule = MEMBER_VIA_TRIP;
		phases.updateRule = MEMBER_VIA_TRIP;
		phases.deleteRule = MEMBER_VIA_TRIP;
		app.save(phases);
	}
);
