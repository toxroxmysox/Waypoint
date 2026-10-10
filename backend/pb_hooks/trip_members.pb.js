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
//   - update: a `role` change is owner/co_owner only. #408 narrowed the rest to
//     a field allowlist (#450: enforced against the collection's live field list):
//     `display_name` and `digest_opt_out`, both own row only. Identity/lifecycle
//     fields — trip, user, placeholder_*, claimable_by, removed_at, soft_token, joined_at — are never
//     writable over REST; their legitimate flows (claim, remove, invite accept,
//     join) run as admin-context saves in members.pb.js / invites.pb.js / join.pb.js,
//     which don't fire request hooks. Before #408 any member could PATCH the
//     owner row's `user` to a second account (owner takeover) or move their own
//     row to another trip id.
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
// Before update: field allowlist (#408) + role gate (#279). Superusers pass.
// ---------------------------------------------------------------------------
onRecordUpdateRequest((e) => {
	if (e.hasSuperuserAuth()) {
		e.next();
		return;
	}
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	// Which fields actually change? getString on both sides — goja reads empty /
	// relation / date fields back as objects, so compare their string forms.
	const original = e.record.original();
	const changed = (f) => e.record.getString(f) !== original.getString(f);

	// ALLOWLIST (#450): only {role, display_name, digest_opt_out} may change over
	// REST. Every other field — present or added to the collection later — is
	// rejected. The identity/lifecycle fields (trip, user, placeholder_*,
	// claimable_by, removed_at, soft_token, joined_at) have legitimate flows, but
	// those run as admin-context saves (members/invites/join.pb.js) that don't
	// fire request hooks. Iterate the collection's CURRENT field list so a future
	// field is locked by default (a denylist would leave it writable by any member).
	const allowed = ['role', 'display_name', 'digest_opt_out'];
	const fieldNames = e.record.collection().fields.fieldNames();
	for (let i = 0; i < fieldNames.length; i++) {
		const f = '' + fieldNames[i];
		if (allowed.indexOf(f) !== -1) continue;
		if (changed(f)) {
			throw new ForbiddenError('`' + f + '` can’t be changed directly');
		}
	}

	const roleChanged = changed('role');
	const nameChanged = changed('display_name');
	const digestChanged = changed('digest_opt_out');
	if (!roleChanged && !nameChanged && !digestChanged) {
		e.next();
		return;
	}

	// Resolve the CALLER's membership on this member's (unchanged) trip.
	const tripId = original.getString('trip');
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

	const callerRole = callerMember.getString('role');
	const isPrivileged = callerRole === 'owner' || callerRole === 'co_owner';
	const isSelf = original.getString('user') === authId;

	// Role: owner/co_owner only — blocks a traveler/viewer self-escalating to
	// owner (their own role is traveler/viewer → denied) and any non-privileged
	// member changing anyone's role.
	if (roleChanged && !isPrivileged) {
		throw new ForbiddenError('Only an owner or co-owner can change a member’s role');
	}
	// Display name: your own row only (#450 — #415's owner/co_owner rename-any
	// path was removed; no screen used it).
	if (nameChanged && !isSelf) {
		throw new ForbiddenError('You can only change your own display name');
	}
	// Digest opt-out is a personal preference: own row only.
	if (digestChanged && !isSelf) {
		throw new ForbiddenError('You can only change your own digest preference');
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
		const callerRole = callerMember.getString('role');
		if (callerRole !== 'owner' && callerRole !== 'co_owner') {
			throw new ForbiddenError('Only an owner or co-owner can remove another member');
		}
	}

	// The sole ACTIVE owner can never be removed (incl. by themselves) — the trip
	// would be left ownerless. Mirrors the /api/members/remove sole-owner cap.
	if (e.record.getString('role') === 'owner') {
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
