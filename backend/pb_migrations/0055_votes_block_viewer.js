/// <reference path="../pb_data/types.d.ts" />
// #286 (AUTHZ-4) — block viewers from item votes; votes.createRule role
// consistency.
//
// THE GAP: votes.createRule (migration 0024) is bare MEMBER_VIA_TRIP — it lacks
// the `&& member.role != "viewer"` term that goal_votes (0042) and
// suggestion_votes (0049) both carry, and the votes.pb.js create hook checks
// self + cross-trip but not role. So a VIEWER could cast item votes via direct PB
// REST, even though SPEC.md:99 lists Viewer = denied for voting. Low severity
// (cosmetic on a read-only role) but a real role-matrix inconsistency.
//
// THE FIX: append the role term, mirroring goal_votes / suggestion_votes. This is
// a single-relation check that's safe to express in the rule: `member` is a single
// relation, so `member.role` is unambiguous (no multi-relation ?= aliasing). The
// votes.pb.js hook continues to enforce vote-as-yourself + same-trip.
//
// Append-only (migration 0055); a rule change only, no new fields → no autodate.
migrate(
	(app) => {
		const MEMBER_VIA_TRIP =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';
		const votes = app.findCollectionByNameOrId('votes');
		votes.createRule = MEMBER_VIA_TRIP + ' && member.role != "viewer"';
		app.save(votes);
	},
	(app) => {
		const MEMBER_VIA_TRIP =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';
		const votes = app.findCollectionByNameOrId('votes');
		votes.createRule = MEMBER_VIA_TRIP;
		app.save(votes);
	}
);
