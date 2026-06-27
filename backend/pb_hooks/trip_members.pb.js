/// <reference path="../pb_data/types.d.ts" />
// #279 (AUTHZ-1) — trip_members role + deletion gate.
//
// THE GAP this closes
// -------------------
// trip_members.updateRule / deleteRule are bare MEMBER_VIA_TRIP (any member of
// the trip — migration 0014), and NO onRecord*Request hook gated the `role`
// field. So any member could PATCH their own row {"role":"owner"} and self-
// escalate, or DELETE another member's row, straight through the PB REST API —
// the SvelteKit `requireOwner()` / promote-endpoint gates are UI-only. members.pb.js
// holds the legitimate role flows (promote, remove) as admin-context router
// endpoints, but bound NO request hook to the collection itself.
//
// This file adds the request-hook gate (mirrors items.pb.js / budgets.pb.js):
//   - update: a `role` change is owner/co_owner only. Everything else (the self
//     `display_name` edit the roster UI does, joined_at, placeholders) stays at
//     the MEMBER_VIA_TRIP rule allowance — so ordinary member edits are unaffected,
//     and only role escalation is blocked.
//   - delete: a member may delete only THEIR OWN row (self-leave); deleting
//     someone else's row is owner/co_owner only; the sole active owner can never
//     be deleted. (The product's real removal path is /api/members/remove, which
//     tombstones; this hook is the defense-in-depth gate on the raw collection
//     DELETE.)
// The PB membership rule stays as defense-in-depth (non-members denied at the rule
// layer); the role correlation can't be expressed safely in a rule (the multi-
// relation `?=` aliasing gotcha — see migration 0047), so it lives here.
//
// PB 0.27 runs each callback in an isolated pooled goja runtime — file-scope
// helpers are invisible inside the body, so the membership lookup is inlined per
// handler. Handler-first signature ALWAYS (cerebrum Do-Not-Repeat [2026-06-05]).
// String-coerce field compares (goja reads empty/relation fields back as objects).

// ---------------------------------------------------------------------------
// Before update: a `role` change requires owner/co_owner. Other field edits
// (display_name, etc.) pass through to the MEMBER_VIA_TRIP rule unchanged.
// ---------------------------------------------------------------------------
onRecordUpdateRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	// Is the role actually changing? Compare new vs the persisted original
	// (string-coerced — goja). If role is untouched, this hook does not restrict
	// the edit (display_name self-edits etc. stay at the rule's MEMBER allowance).
	const original = e.record.original();
	const newRole = '' + e.record.get('role');
	const oldRole = '' + original.get('role');
	if (newRole === oldRole) {
		e.next();
		return;
	}

	// A role change: resolve the CALLER's membership on this member's trip and
	// require owner/co_owner. This blocks a traveler/viewer self-escalating to
	// owner (their own role is traveler/viewer → denied) and any non-privileged
	// member changing anyone's role.
	const tripId = e.record.get('trip');
	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid} && removed_at = ""',
			{ tripId: tripId, uid: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	const callerRole = callerMember.get('role');
	if (callerRole !== 'owner' && callerRole !== 'co_owner') {
		throw new ForbiddenError('Only an owner or co-owner can change a member’s role');
	}

	e.next();
}, 'trip_members');

// ---------------------------------------------------------------------------
// Before delete: self-leave is open to any member; deleting someone else is
// owner/co_owner only; the sole active owner can never be deleted.
// ---------------------------------------------------------------------------
onRecordDeleteRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const tripId = e.record.get('trip');

	// The target's owning user (a trip_members.user is a users.id, or '' for a
	// placeholder/tombstone). Self-leave = the caller deleting their OWN row.
	const targetUser = '' + e.record.get('user');
	const isSelfLeave = targetUser !== '' && targetUser === authId;

	// Resolve the caller's own active membership for authority.
	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid} && removed_at = ""',
			{ tripId: tripId, uid: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	if (!isSelfLeave) {
		const callerRole = callerMember.get('role');
		if (callerRole !== 'owner' && callerRole !== 'co_owner') {
			throw new ForbiddenError('Only an owner or co-owner can remove another member');
		}
	}

	// The sole ACTIVE owner can never be removed (incl. by themselves) — the trip
	// would be left ownerless. Mirrors the /api/members/remove sole-owner cap.
	if (e.record.get('role') === 'owner') {
		let ownerCount = 0;
		try {
			const owners = e.app.findRecordsByFilter(
				'trip_members',
				'trip = {:tripId} && role = "owner" && removed_at = ""',
				'',
				0,
				0,
				{ tripId: tripId }
			);
			ownerCount = owners.length;
		} catch (_) {
			ownerCount = 1;
		}
		if (ownerCount <= 1) {
			throw new BadRequestError('Cannot remove the sole owner of a trip');
		}
	}

	e.next();
}, 'trip_members');
