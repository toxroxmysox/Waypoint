/// <reference path="../pb_data/types.d.ts" />
// M2c: placeholder members, auto-merge, promote, remove.
//
// PB 0.27 sandboxes each callback — helpers defined outside are invisible
// inside. Everything is inlined. Smoke-test any new callback with a
// console.log before adding logic.

// ---------------------------------------------------------------------------
// Auto-merge: when a new user is created, find placeholder memberships whose
// placeholder_email matches and mark them claimable for that user.
// ---------------------------------------------------------------------------
onRecordAfterCreateSuccess((e) => {
	const email = e.record.email();
	if (!email) return;

	let rows;
	try {
		rows = e.app.findRecordsByFilter(
			'trip_members',
			// #133 guard: a tombstone also has user="" — exclude removed rows so a
			// Departed Member never re-arms as a claimable placeholder.
			'placeholder_email = {:email} && user = "" && removed_at = ""',
			'',
			0,
			0,
			{ email: email }
		);
	} catch (_) {
		return;
	}

	for (const row of rows) {
		row.set('claimable_by', e.record.id);
		try {
			e.app.save(row);
		} catch (err) {
			console.log('members: failed to mark claimable for ' + row.id + ': ' + err);
		}
	}
}, 'users');

// ---------------------------------------------------------------------------
// GET /api/members/my-claims
// Returns pending placeholder claims for the authenticated user.
// Admin context so it can read trip_members + trip regardless of membership.
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/members/my-claims', (e) => {
	const authRecord = e.auth;
	if (!authRecord) {
		throw new UnauthorizedError('Authentication required');
	}

	let rows;
	try {
		rows = e.app.findRecordsByFilter(
			'trip_members',
			// #133 guard: never surface a tombstone as a pending claim.
			'claimable_by = {:uid} && removed_at = ""',
			'',
			0,
			0,
			{ uid: authRecord.id }
		);
	} catch (_) {
		return e.json(200, { claims: [] });
	}

	const claims = [];
	for (const row of rows) {
		let trip;
		try {
			trip = e.app.findRecordById('trips', row.get('trip'));
		} catch (_) {
			continue;
		}
		claims.push({
			member_id: row.id,
			trip_id: trip.id,
			trip_slug: trip.get('slug'),
			trip_title: trip.get('title'),
			placeholder_name: row.get('placeholder_name') || '',
			role: row.get('role')
		});
	}

	return e.json(200, { claims: claims });
});

// ---------------------------------------------------------------------------
// POST /api/members/claim
// Accept a placeholder claim: link user, set joined_at, clear placeholders.
// Body: { member_id, display_name? }
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/members/claim', (e) => {
	const authRecord = e.auth;
	if (!authRecord) {
		throw new UnauthorizedError('Authentication required');
	}

	const info = e.requestInfo();
	const memberId = (info.body && info.body['member_id']) || '';
	const displayName = (info.body && info.body['display_name']) || '';
	if (!memberId) {
		throw new BadRequestError('member_id is required');
	}

	let member;
	try {
		member = e.app.findRecordById('trip_members', memberId);
	} catch (_) {
		throw new NotFoundError('Member record not found');
	}

	// #133 guard: a tombstone (user="" && claimable_by="") would otherwise slip
	// past the claimable_by check below — a Departed Member is never claimable.
	// NB getString, not get: PB's JSVM returns a (truthy) DateTime object for an
	// empty date field, so get('removed_at') is never falsy.
	if (member.getString('removed_at')) {
		throw new BadRequestError('This membership has been removed and cannot be claimed');
	}

	if (member.get('user')) {
		if (member.get('user') === authRecord.id) {
			throw new BadRequestError('This membership has already been claimed');
		}
		throw new ForbiddenError('This membership is not claimable by you');
	}
	if (member.get('claimable_by') !== authRecord.id) {
		throw new ForbiddenError('This membership is not claimable by you');
	}

	const now = new Date().toISOString().replace('T', ' ').replace('Z', '') + 'Z';
	member.set('user', authRecord.id);
	member.set('joined_at', now);
	member.set('claimable_by', '');
	member.set('placeholder_email', '');
	// Keep placeholder_name but use displayName if provided; else fall back to placeholder_name
	const finalName = displayName.trim() || member.get('placeholder_name') || '';
	if (finalName) {
		member.set('display_name', finalName);
	}
	member.set('placeholder_name', '');

	try {
		e.app.save(member);
	} catch (err) {
		throw new BadRequestError('Failed to claim membership: ' + err);
	}

	return e.json(200, { ok: true, member_id: member.id, trip_id: member.get('trip') });
});

// ---------------------------------------------------------------------------
// POST /api/members/add-placeholder
// Add a non-user (offline) member to a trip.
// Body: { trip_id, display_name, placeholder_email?, role }
// Role gating mirrors invite gating (SPEC §3):
//   owner/co_owner → co_owner/traveler/viewer
//   traveler → traveler/viewer only
//   viewer → denied
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/members/add-placeholder', (e) => {
	const authRecord = e.auth;
	if (!authRecord) {
		throw new UnauthorizedError('Authentication required');
	}

	const info = e.requestInfo();
	const tripId = (info.body && info.body['trip_id']) || '';
	const displayName = ((info.body && info.body['display_name']) || '').trim();
	const placeholderEmail = ((info.body && info.body['placeholder_email']) || '').trim().toLowerCase();
	const role = (info.body && info.body['role']) || '';

	if (!tripId) throw new BadRequestError('trip_id is required');
	if (!displayName) throw new BadRequestError('display_name is required');
	if (!role) throw new BadRequestError('role is required');

	const validRoles = ['co_owner', 'traveler', 'viewer'];
	if (!validRoles.includes(role)) {
		throw new BadRequestError('role must be one of: co_owner, traveler, viewer');
	}

	// Resolve caller's membership.
	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid} && removed_at = ""',
			{ tripId: tripId, uid: authRecord.id }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	const callerRole = callerMember.get('role');

	// Viewer cannot add members.
	if (callerRole === 'viewer') {
		throw new ForbiddenError('Viewers cannot add members');
	}
	// Traveler can only add traveler/viewer.
	if (callerRole === 'traveler' && role === 'co_owner') {
		throw new ForbiddenError('Travelers cannot add co-owners');
	}

	// If placeholder_email provided, check for existing user or member.
	let claimableBy = '';
	if (placeholderEmail) {
		// Check not already a member.
		let existingMember;
		try {
			// Find by email via user relation — need to look up user first.
			const existingUser = e.app.findAuthRecordByEmail('users', placeholderEmail);
			if (existingUser) {
				try {
					existingMember = e.app.findFirstRecordByFilter(
						'trip_members',
						// #133: a departed member (user="") is not an active duplicate —
						// they may be re-added as a fresh placeholder.
						'trip = {:tripId} && user = {:uid} && removed_at = ""',
						{ tripId: tripId, uid: existingUser.id }
					);
				} catch (_) {
					// No member yet — that's fine.
				}
				if (existingMember) {
					throw new BadRequestError('A member with that email already exists');
				}
				// User exists but is not yet a member — mark claimable immediately.
				claimableBy = existingUser.id;
			}
		} catch (err) {
			// Re-throw our own errors.
			if (err && err.code && err.code !== 404) throw err;
			// 404 = user not found; claimableBy stays empty.
		}

		// Also check pending placeholder with same email in this trip.
		let existingPlaceholder;
		try {
			existingPlaceholder = e.app.findFirstRecordByFilter(
				'trip_members',
				// #133: a tombstone's placeholder_email is cleared, but guard anyway —
				// only an active placeholder counts as a duplicate.
				'trip = {:tripId} && placeholder_email = {:email} && removed_at = ""',
				{ tripId: tripId, email: placeholderEmail }
			);
		} catch (_) {
			// No existing placeholder.
		}
		if (existingPlaceholder) {
			throw new BadRequestError('A placeholder with that email already exists');
		}
	}

	const tripMembersCol = e.app.findCollectionByNameOrId('trip_members');
	const member = new Record(tripMembersCol);
	member.set('trip', tripId);
	member.set('display_name', displayName);
	member.set('role', role);
	if (placeholderEmail) {
		member.set('placeholder_name', displayName);
		member.set('placeholder_email', placeholderEmail);
	}
	if (claimableBy) {
		member.set('claimable_by', claimableBy);
	}

	try {
		e.app.save(member);
	} catch (err) {
		throw new BadRequestError('Failed to create placeholder: ' + err);
	}

	return e.json(200, { ok: true, member_id: member.id });
});

// ---------------------------------------------------------------------------
// POST /api/members/promote
// Promote a traveler to co_owner. Caller must be owner or co_owner.
// Body: { member_id }
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/members/promote', (e) => {
	const authRecord = e.auth;
	if (!authRecord) {
		throw new UnauthorizedError('Authentication required');
	}

	const info = e.requestInfo();
	const memberId = (info.body && info.body['member_id']) || '';
	if (!memberId) throw new BadRequestError('member_id is required');

	let target;
	try {
		target = e.app.findRecordById('trip_members', memberId);
	} catch (_) {
		throw new NotFoundError('Member not found');
	}

	const tripId = target.get('trip');

	// Verify caller is owner/co_owner of the same trip.
	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid} && removed_at = ""',
			{ tripId: tripId, uid: authRecord.id }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	const callerRole = callerMember.get('role');
	if (callerRole !== 'owner' && callerRole !== 'co_owner') {
		throw new ForbiddenError('Only owners and co-owners can promote members');
	}

	if (target.get('role') !== 'traveler') {
		throw new BadRequestError('Only travelers can be promoted to co-owner');
	}

	target.set('role', 'co_owner');
	try {
		e.app.save(target);
	} catch (err) {
		throw new BadRequestError('Failed to promote member: ' + err);
	}

	return e.json(200, { ok: true, member_id: target.id });
});

// ---------------------------------------------------------------------------
// GET /api/members/can-purge?member_id=ID — UX-only zero-ref probe (ADR-0013).
//
// The Remove dialog calls this lazily on open to decide which confirm to show:
//   zero_ref true  → "Delete permanently" confirm (the removal will hard-delete).
//   zero_ref false → keep the disposition picker (the removal will tombstone).
// The /api/members/remove hook RE-CHECKS server-side as the source of truth — this
// is purely to pick the dialog copy, so a benign race (a ref appears between the
// probe and the POST) just means the hook tombstones and reports deleted:false.
//
// Runs the SAME block-reference scan as the remove hook (votes excluded — they're
// always dropped, so a vote-only member probes zero_ref:true). Self-leave is never
// purgeable, so this returns zero_ref:false for the caller's own row regardless.
// The reference-field list is inlined (goja can't see file-scope consts) and is
// kept in lock-step with the remove hook's MEMBER_RELATION_FIELDS; the test:rules
// drift test introspects the live schema and fails if either copy is incomplete.
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/members/can-purge', (e) => {
	const authRecord = e.auth;
	if (!authRecord) {
		throw new UnauthorizedError('Authentication required');
	}

	// requestInfo().query — e.request.url is not valid in the PB 0.27 sandbox
	// (see suggestions.pb.js). Values may be a string or string array; normalize.
	const query = e.requestInfo().query || {};
	const memberId = Array.isArray(query['member_id']) ? query['member_id'][0] : (query['member_id'] || '');
	if (!memberId) throw new BadRequestError('member_id is required');

	let target;
	try {
		target = e.app.findRecordById('trip_members', memberId);
	} catch (_) {
		throw new NotFoundError('Member not found');
	}
	const tripId = target.get('trip');

	// Authority: only a member of the trip may probe (owner/co_owner do the actual
	// removing, but any member reading the roster can see the affordance). A
	// tombstoned caller has user="" so never matches.
	try {
		e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid} && removed_at = ""',
			{ tripId: tripId, uid: authRecord.id }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	// Self-leave can never purge — short-circuit.
	const isSelfLeave = !!target.get('user') && target.get('user') === authRecord.id;
	// An existing tombstone is never re-purged here (backfill is out of scope, #238).
	const alreadyRemoved = target.getString('removed_at') !== '';
	if (isSelfLeave || alreadyRemoved) {
		return e.json(200, { ok: true, member_id: memberId, zero_ref: false });
	}

	// Same 'block' set as MEMBER_RELATION_FIELDS in the remove hook (votes excluded —
	// they always drop; cascade relations excluded — PB cleans them + no identity).
	const BLOCK_FIELDS = [
		['expenses', 'paid_by'],
		['expenses', 'created_by'],
		['settlements', 'from_member'],
		['settlements', 'to_member'],
		['settlements', 'created_by'],
		['suggestions', 'author'],
		['suggestions', 'reviewed_by'],
		['trip_goals', 'created_by'],
		['documents', 'uploaded_by'],
		['memories', 'author'],
		['items', 'created_by'],
		['items', 'paid_by'],
		['items', 'booked_by'],
		['tasks', 'assignee'],
		['checklist_items', 'checked_by'],
		['notifications', 'recipient'],
		['money_units', 'created_by']
	];
	for (const rel of BLOCK_FIELDS) {
		try {
			e.app.findFirstRecordByFilter(rel[0], rel[1] + ' = {:mid}', { mid: memberId });
			return e.json(200, { ok: true, member_id: memberId, zero_ref: false });
		} catch (_) {}
	}
	// items.assigned_to is multi (~).
	try {
		e.app.findFirstRecordByFilter('items', 'assigned_to ~ {:mid}', { mid: memberId });
		return e.json(200, { ok: true, member_id: memberId, zero_ref: false });
	} catch (_) {}

	// expenses.split_data (JSON, no FK) — a member present only in a split is
	// referenced. Decode the byte-array JSON exactly as the remove hook does.
	let expenses = [];
	try {
		expenses = e.app.findRecordsByFilter('expenses', 'trip = {:tripId}', '', 0, 0, { tripId: tripId });
	} catch (_) {
		expenses = [];
	}
	for (const exp of expenses) {
		let split = exp.get('split_data');
		if (Array.isArray(split) && split.length > 0 && typeof split[0] === 'number') {
			try { split = JSON.parse(String.fromCharCode.apply(null, split)); } catch (_) { split = null; }
		} else if (typeof split === 'string') {
			try { split = JSON.parse(split); } catch (_) { split = null; }
		}
		if (!split || typeof split !== 'object') continue;
		const mem = split.members;
		if (mem && mem.length) {
			for (let i = 0; i < mem.length; i++) {
				if (mem[i] === memberId) return e.json(200, { ok: true, member_id: memberId, zero_ref: false });
			}
		}
		const amounts = split.amounts;
		if (amounts && typeof amounts === 'object') {
			for (const k in amounts) {
				if (k === memberId) return e.json(200, { ok: true, member_id: memberId, zero_ref: false });
			}
		}
	}

	return e.json(200, { ok: true, member_id: memberId, zero_ref: true });
});

// ---------------------------------------------------------------------------
// POST /api/members/remove — remove a member (#133, ADR-0008 + ADR-0013).
//
// After the chosen disposition runs and votes are dropped, the hook checks the
// full reference set. ADR-0013 (auto-purge a zero-reference member):
//   - If NOTHING references the member, the row is HARD-DELETED (purged) and the
//     response is { deleted: true }. A typo'd placeholder / vote-only member that
//     authored no records has no identity to preserve, so the tombstone is pure
//     clutter — ADR-0008 always intended "hard-delete only if nothing references
//     it", this makes that true in code.
//   - If ANY record references the member, the row is RETAINED as a Departed
//     Member tombstone exactly as before: the resolved display name is snapshotted
//     into display_name (so "Bob paid $40" still renders), `user` is cleared
//     (severing access — no membership rule matches a cleared user id, so zero
//     collection rules change), the claim hooks are cleared, and removed_at is
//     stamped. The response is { deleted: false }.
// There is NO force-delete: any reference → tombstone. Reassign stays the only
// escape hatch. Money integrity is absolute.
//
// Body: { member_id, disposition?, reassign_to? }
//   disposition: 'keep' (default) | 'reassign' | 'cascade'
//     keep     — children stay pointing at the tombstone (default; only path for money).
//     reassign — rewrite the departed member's authored records to reassign_to.
//     cascade  — delete the departed member's NON-MONEY authored content.
//   reassign_to: target member id (required when disposition = 'reassign').
//
// Response: { ok, member_id, deleted, removed_at, disposition }
//   deleted: true  → row hard-deleted (zero-ref purge); removed_at = "".
//   deleted: false → row tombstoned (had references); removed_at stamped.
//
// Invariants (PRD Resolutions 10/12/13/14 + ADR-0013):
//   - Money (expenses, settlements) is NEVER cascade-deleted — keep or reassign.
//   - Votes (votes, goal_votes, suggestion_votes) ALWAYS drop. The retained row
//     means their member-relation cascadeDelete won't fire on its own, so we drop
//     them explicitly — which also makes a vote-only member zero-ref (→ purged).
//   - Self-leave is tombstone-only (forced keep) AND never purges: a leaver can't
//     delete themselves out of the trip, only tombstone.
//   - Frozen on a closed (archived) trip.
//
// REFERENCE SET — single source of truth: MEMBER_RELATION_FIELDS (declared at the
// top of the remove callback, goja-safe). Every relation field that targets
// trip_members is enumerated there, each tagged with how removal handles it:
//   'drop'    — deleted before the reference check (votes / goal_votes /
//               suggestion_votes); never blocks purge.
//   'cascade' — PB cascadeDelete cleans it up automatically on member delete AND
//               it carries no display identity (pending_invites.invited_by,
//               join_tokens.created_by); does not block purge.
//   'block'   — its presence means the member is referenced → tombstone, never
//               purge. The 14 money/authored FKs PLUS the two the old #238 body
//               missed: checklist_items.checked_by (orphans the id; no cascade)
//               and notifications.recipient (required + no cascade → a hard-delete
//               would throw the very prod-400 the tombstone model prevents).
//   PLUS expenses.split_data (JSON, no FK): a member present only in an expense
//   split (someone else paid; they owe a share) IS referenced → 'block'.
// The test:rules drift test introspects the live schema and FAILS if a relation
// field targeting trip_members isn't categorised here — so a future member-
// relation migration goes RED until this list is updated.
//
// Caller must be owner/co_owner to remove someone else; any member may self-leave
// (except the sole owner). All helpers are inlined inside the callback — PB's
// goja sandbox can't see file-scope functions.
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/members/remove', (e) => {
	const authRecord = e.auth;
	if (!authRecord) {
		throw new UnauthorizedError('Authentication required');
	}

	const info = e.requestInfo();
	const memberId = (info.body && info.body['member_id']) || '';
	if (!memberId) throw new BadRequestError('member_id is required');

	let target;
	try {
		target = e.app.findRecordById('trip_members', memberId);
	} catch (_) {
		throw new NotFoundError('Member not found');
	}

	// getString, not get: PB's JSVM returns a truthy DateTime object for an empty
	// date field, so !!get('removed_at') would always be true and skip the stamp.
	const alreadyRemoved = target.getString('removed_at') !== '';
	const tripId = target.get('trip');

	// SINGLE SOURCE OF TRUTH for every relation field targeting trip_members
	// (ADR-0013). Inlined here because goja can't see file-scope constants. Each
	// entry: [collection, field, category]. Categories:
	//   'drop'    — deleted before the reference scan (votes); never blocks purge.
	//   'cascade' — PB cascadeDelete handles it on member delete + no identity to
	//               preserve; does not block purge.
	//   'block'   — presence → tombstone (referenced). 'multi' = multi-relation
	//               (filter with ~). 'split' = expenses.split_data JSON (no FK).
	// The test:rules drift test introspects the live schema and fails if a
	// trip_members relation field is missing here, so a future member-relation
	// migration goes RED until this list is updated.
	const MEMBER_RELATION_FIELDS = [
		// Money — never purged-around; identity must survive (block).
		['expenses', 'paid_by', 'block'],
		['expenses', 'created_by', 'block'],
		['expenses', 'split_data', 'split'],
		['settlements', 'from_member', 'block'],
		['settlements', 'to_member', 'block'],
		['settlements', 'created_by', 'block'],
		// Non-money authored / referencing records (block).
		['suggestions', 'author', 'block'],
		['suggestions', 'reviewed_by', 'block'],
		['trip_goals', 'created_by', 'block'],
		['documents', 'uploaded_by', 'block'],
		['items', 'created_by', 'block'],
		['items', 'paid_by', 'block'],
		['items', 'booked_by', 'block'],
		['items', 'assigned_to', 'block_multi'],
		['tasks', 'assignee', 'block'],
		// memories (#269, migration 0058) — required + no cascade (block). A
		// departed member's memories survive on the tombstone; they are NEVER
		// reassigned (personal expression + the unique (day, author) index would
		// collide with the target's own memory).
		['memories', 'author', 'block'],
		// The two the old #238 body MISSED — no cascade, so a hard-delete would
		// orphan the id / throw a required-FK 400 (block).
		['checklist_items', 'checked_by', 'block'],
		['notifications', 'recipient', 'block'],
		// money_units (#230, migration 0050) landed concurrently in wave M — both
		// relations are required + no cascade, so a member in a unit (or its creator)
		// blocks the purge. The #238 drift test (test-rules) caught this at integration.
		['money_units', 'members', 'block_multi'],
		['money_units', 'created_by', 'block'],
		// Votes — dropped above the disposition switch (drop).
		['votes', 'member', 'drop'],
		['goal_votes', 'member', 'drop'],
		['suggestion_votes', 'member', 'drop'],
		// cascadeDelete + no identity — PB cleans these on delete (cascade).
		['pending_invites', 'invited_by', 'cascade'],
		['join_tokens', 'created_by', 'cascade']
	];

	// Frozen on a closed trip (Resolution 14) — symmetric with the join window.
	let trip;
	try {
		trip = e.app.findRecordById('trips', tripId);
	} catch (_) {
		throw new NotFoundError('Trip not found');
	}
	if (trip.get('archived')) {
		throw new ForbiddenError('This trip is closed; its roster is frozen');
	}

	const isSelfLeave = !!target.get('user') && target.get('user') === authRecord.id;

	// Authority: self-leave is open to any member; removing someone else is
	// owner/co_owner only. (A tombstoned caller has user="" so never matches.)
	if (!isSelfLeave) {
		let callerMember;
		try {
			callerMember = e.app.findFirstRecordByFilter(
				'trip_members',
				'trip = {:tripId} && user = {:uid} && removed_at = ""',
				{ tripId: tripId, uid: authRecord.id }
			);
		} catch (_) {
			throw new ForbiddenError('You are not a member of this trip');
		}
		const callerRole = callerMember.get('role');
		if (callerRole !== 'owner' && callerRole !== 'co_owner') {
			throw new ForbiddenError('Only owners and co-owners can remove members');
		}
	}

	// Cannot remove the sole (active) owner.
	if (target.get('role') === 'owner') {
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

	// Disposition. Self-leave is forced to keep (Resolution 13): a leaver can't
	// dump their debts on others or delete records the group shares.
	let disposition = ((info.body && info.body['disposition']) || 'keep').toString();
	const reassignTo = ((info.body && info.body['reassign_to']) || '').toString();
	if (isSelfLeave) disposition = 'keep';
	if (disposition !== 'keep' && disposition !== 'reassign' && disposition !== 'cascade') {
		throw new BadRequestError('disposition must be keep, reassign, or cascade');
	}

	if (disposition === 'reassign') {
		if (!reassignTo) throw new BadRequestError('reassign_to is required for reassign');
		if (reassignTo === target.id) {
			throw new BadRequestError('Cannot reassign to the member being removed');
		}
		let reassignMember;
		try {
			reassignMember = e.app.findRecordById('trip_members', reassignTo);
		} catch (_) {
			throw new NotFoundError('Reassignment target not found');
		}
		if (reassignMember.get('trip') !== tripId) {
			throw new BadRequestError('Reassignment target is not in this trip');
		}
		if (reassignMember.getString('removed_at')) {
			throw new BadRequestError('Cannot reassign to a removed member');
		}
	}

	// --- Always drop the departed member's votes (Resolution 12). The row is
	// retained (or about to be purged), so votes.member / goal_votes.member /
	// suggestion_votes.member cascadeDelete won't fire on its own — drop them
	// explicitly. This also makes a vote-only member zero-ref (→ purged, ADR-0013):
	// suggestion_votes was missing from this loop pre-#238, so a member whose only
	// reference was a suggestion vote would have wrongly blocked the purge.
	for (const col of ['votes', 'goal_votes', 'suggestion_votes']) {
		let rows = [];
		try {
			rows = e.app.findRecordsByFilter(col, 'member = {:mid}', '', 0, 0, { mid: target.id });
		} catch (_) {}
		for (const r of rows) {
			try {
				e.app.delete(r);
			} catch (_) {}
		}
	}

	// Inlined relation helpers (goja: must live inside the callback).
	// Rewrite a single-relation field from the departed member to `toId`
	// ('' clears it).
	const rewriteSingle = (col, field, toId) => {
		let rows = [];
		try {
			rows = e.app.findRecordsByFilter(col, field + ' = {:mid}', '', 0, 0, { mid: target.id });
		} catch (_) {
			return;
		}
		for (const r of rows) {
			r.set(field, toId);
			try {
				e.app.save(r);
			} catch (err) {
				console.log('members.remove: ' + col + '.' + field + ' rewrite failed for ' + r.id + ': ' + err);
			}
		}
	};
	// Rewrite a multi-relation field (items.assigned_to): drop the departed id,
	// add `toId` when non-empty (deduped).
	const rewriteMulti = (col, field, toId) => {
		let rows = [];
		try {
			rows = e.app.findRecordsByFilter(col, field + ' ~ {:mid}', '', 0, 0, { mid: target.id });
		} catch (_) {
			return;
		}
		for (const r of rows) {
			const cur = r.get(field) || [];
			const next = [];
			for (const id of cur) {
				if (id !== target.id) next.push(id);
			}
			if (toId && next.indexOf(toId) === -1) next.push(toId);
			r.set(field, next);
			try {
				e.app.save(r);
			} catch (err) {
				console.log('members.remove: ' + col + '.' + field + ' multi-rewrite failed for ' + r.id + ': ' + err);
			}
		}
	};
	// Delete every row of `col` whose `field` points at the departed member.
	const deleteWhere = (col, field) => {
		let rows = [];
		try {
			rows = e.app.findRecordsByFilter(col, field + ' = {:mid}', '', 0, 0, { mid: target.id });
		} catch (_) {
			return;
		}
		for (const r of rows) {
			try {
				e.app.delete(r);
			} catch (err) {
				console.log('members.remove: ' + col + ' delete failed for ' + r.id + ': ' + err);
			}
		}
	};
	// #259 — transfer split PARTICIPATION (move-to-target, MERGE). The authored-
	// record rewrites move what the departed member PAID/owns; this moves what they
	// OWE — every expense whose split_data names the departed id is rewritten
	// departed→target so computeBalances/debt-simplify attribute the share to
	// `reassignTo`, not the tombstone. FAITHFUL JS PORT of the Vitest-proven
	// src/lib/money/transfer-split.ts (transferSplitParticipation) — keep the two in
	// lock-step. goja can't import the TS, so it is inlined here. Semantics: equal
	// {members:[…]} replace+dedupe; by_amount {amounts:{…}} move, SUM if the target
	// already owes, drop the departed key. Reads split_data via the same byte-array
	// decode as existsBlockRef / expenses.pb.js; writes the rewritten plain object
	// back via .set (PB serializes a JS object into the JSON field).
	const transferSplitParticipation = (fromId, toId) => {
		if (!fromId || !toId || fromId === toId) return;
		let expenses = [];
		try {
			expenses = e.app.findRecordsByFilter('expenses', 'trip = {:tripId}', '', 0, 0, { tripId: tripId });
		} catch (_) {
			return;
		}
		for (const exp of expenses) {
			let split = exp.get('split_data');
			if (Array.isArray(split) && split.length > 0 && typeof split[0] === 'number') {
				try { split = JSON.parse(String.fromCharCode.apply(null, split)); } catch (_) { split = null; }
			} else if (typeof split === 'string') {
				try { split = JSON.parse(split); } catch (_) { split = null; }
			}
			if (!split || typeof split !== 'object') continue;

			let changed = false;
			let nextSplit = null;
			const mem = split.members;
			if (Array.isArray(mem)) {
				if (mem.indexOf(fromId) === -1) continue; // departed not a participant
				const next = [];
				for (let i = 0; i < mem.length; i++) {
					const id = mem[i];
					if (id === fromId || id === toId) {
						if (next.indexOf(toId) === -1) next.push(toId); // replace/keep target once (dedupe)
					} else {
						next.push(id);
					}
				}
				nextSplit = { members: next };
				changed = true;
			} else {
				const amounts = split.amounts;
				if (amounts && typeof amounts === 'object') {
					if (!Object.prototype.hasOwnProperty.call(amounts, fromId)) continue; // not a participant
					const next = {};
					for (const k in amounts) {
						if (k === fromId) continue; // drop departed key; folded into target below
						if (Object.prototype.hasOwnProperty.call(amounts, k)) next[k] = amounts[k];
					}
					const moved = amounts[fromId];
					const existing = Object.prototype.hasOwnProperty.call(next, toId) ? next[toId] : 0;
					next[toId] = existing + moved; // SUM if the target already owed a share
					nextSplit = { amounts: next };
					changed = true;
				}
			}

			if (changed && nextSplit) {
				exp.set('split_data', nextSplit);
				try {
					e.app.save(exp);
				} catch (err) {
					console.log('members.remove: split_data transfer failed for expense ' + exp.id + ': ' + err);
				}
			}
		}
	};

	if (disposition === 'reassign') {
		// Money — never deleted; identity transfers to the reassignment target.
		rewriteSingle('expenses', 'paid_by', reassignTo);
		rewriteSingle('expenses', 'created_by', reassignTo);
		// #259 — also transfer who each expense splits ACROSS (the departed's owed
		// share), not just who paid; without this the share lands on the tombstone.
		transferSplitParticipation(target.id, reassignTo);
		rewriteSingle('settlements', 'from_member', reassignTo);
		rewriteSingle('settlements', 'to_member', reassignTo);
		rewriteSingle('settlements', 'created_by', reassignTo);
		// Non-money authored records.
		rewriteSingle('suggestions', 'author', reassignTo);
		rewriteSingle('suggestions', 'reviewed_by', reassignTo);
		rewriteSingle('trip_goals', 'created_by', reassignTo);
		rewriteSingle('documents', 'uploaded_by', reassignTo);
		rewriteSingle('items', 'created_by', reassignTo);
		rewriteSingle('items', 'paid_by', reassignTo);
		rewriteSingle('items', 'booked_by', reassignTo);
		rewriteMulti('items', 'assigned_to', reassignTo);
		rewriteSingle('tasks', 'assignee', reassignTo);
		// memories are NOT reassigned (#269): a memory is personal expression, and
		// rewriting author would collide with the target's own (day, author) row
		// under the unique cap. They stay attributed to the tombstone.
	} else if (disposition === 'cascade') {
		// Money is NEVER cascaded (Resolution 10) — expenses/settlements stay,
		// pointing at the retained tombstone. Only non-money authored content drops.
		deleteWhere('suggestions', 'author'); // includes comments (target_type='comment')
		deleteWhere('trip_goals', 'created_by'); // cascadeDelete drops their goal_votes
		deleteWhere('documents', 'uploaded_by');
		deleteWhere('memories', 'author'); // #269 — cascade drops their memories too
		// Optional authorship on records that stay — null it out.
		rewriteSingle('suggestions', 'reviewed_by', '');
		rewriteSingle('items', 'created_by', '');
		rewriteSingle('items', 'paid_by', '');
		rewriteSingle('items', 'booked_by', '');
		rewriteMulti('items', 'assigned_to', '');
		rewriteSingle('tasks', 'assignee', '');
	}
	// disposition === 'keep': children keep pointing at the tombstone — nothing to do.

	// --- ADR-0013: zero-reference auto-purge. Votes are already dropped and the
	// disposition has run, so the live reference set is whatever 'block' fields
	// still point at this member. `existsRef` is a cheap existence probe (perPage=1
	// equivalent — findFirstRecordByFilter throws when none match). split_data has
	// no FK, so scan every trip expense's JSON for the id in members[] (equal split)
	// or the keys of amounts{} (by_amount).
	const targetId = target.id;
	const existsBlockRef = () => {
		for (const rel of MEMBER_RELATION_FIELDS) {
			const col = rel[0];
			const field = rel[1];
			const kind = rel[2];
			if (kind === 'block') {
				try {
					e.app.findFirstRecordByFilter(col, field + ' = {:mid}', { mid: targetId });
					return true; // a match exists
				} catch (_) {
					// none — keep scanning
				}
			} else if (kind === 'block_multi') {
				try {
					e.app.findFirstRecordByFilter(col, field + ' ~ {:mid}', { mid: targetId });
					return true;
				} catch (_) {}
			} else if (kind === 'split') {
				// expenses.split_data — JSON, no FK. Pull this trip's expenses and
				// inspect the parsed split. Scoped to the trip (split ids are members
				// of the same trip), so the scan stays small.
				let expenses = [];
				try {
					expenses = e.app.findRecordsByFilter('expenses', 'trip = {:tripId}', '', 0, 0, { tripId: tripId });
				} catch (_) {
					expenses = [];
				}
				for (const exp of expenses) {
					// PB JSON fields surface as a BYTE ARRAY in goja hooks (not a parsed
					// object) — decode via String.fromCharCode then JSON.parse, exactly as
					// expenses.pb.js does. Missing this would silently skip every split, so
					// a member who only owes a share would wrongly purge (money-integrity bug).
					let split = exp.get('split_data');
					if (Array.isArray(split) && split.length > 0 && typeof split[0] === 'number') {
						try { split = JSON.parse(String.fromCharCode.apply(null, split)); } catch (_) { split = null; }
					} else if (typeof split === 'string') {
						try { split = JSON.parse(split); } catch (_) { split = null; }
					}
					if (!split || typeof split !== 'object') continue;
					// equal split: members: [ids]
					const mem = split.members;
					if (mem && mem.length) {
						for (let i = 0; i < mem.length; i++) {
							if (mem[i] === targetId) return true;
						}
					}
					// by_amount: amounts: { memberId: n } — check the KEYS
					const amounts = split.amounts;
					if (amounts && typeof amounts === 'object') {
						for (const k in amounts) {
							if (k === targetId) return true;
						}
					}
				}
			}
			// 'drop' / 'cascade' never block a purge.
		}
		return false;
	};

	// Self-leave NEVER purges (a leaver can't delete themselves out — ADR-0013) and
	// a re-removal of an existing tombstone stays a tombstone (forward-only; backfill
	// of existing tombstones is out of scope, #238). Otherwise: zero refs → purge.
	if (!isSelfLeave && !alreadyRemoved && !existsBlockRef()) {
		try {
			e.app.delete(target);
		} catch (err) {
			// A reference appeared between the scan and the delete (concurrency), or
			// PB's required-FK constraint backstopped us. Fall through to tombstone
			// and report the real outcome rather than 500ing.
			console.log('members.remove: purge of ' + targetId + ' failed, tombstoning instead: ' + err);
			// fall through to the tombstone block below
		}
		// Re-fetch to confirm the row is actually gone (delete may have thrown).
		let stillExists = true;
		try {
			e.app.findRecordById('trip_members', targetId);
		} catch (_) {
			stillExists = false;
		}
		if (!stillExists) {
			return e.json(200, {
				ok: true,
				member_id: targetId,
				deleted: true,
				removed_at: '',
				disposition: disposition
			});
		}
		// else: delete failed → continue to tombstone.
	}

	// --- Tombstone the membership row. Snapshot the resolved display name into
	// display_name (ADR-0008 snapshot target), then sever access + clear claim
	// hooks and stamp removed_at. The row is RETAINED.
	const now = new Date().toISOString().replace('T', ' ').replace('Z', '') + 'Z';
	let snapName = (target.get('display_name') || '').trim();
	if (!snapName) {
		const uid = target.get('user');
		if (uid) {
			try {
				const u = e.app.findRecordById('users', uid);
				snapName = (u.get('name') || u.email() || '').trim();
			} catch (_) {}
		}
	}
	if (!snapName) snapName = (target.get('placeholder_name') || '').trim();
	if (!snapName) snapName = 'Former member';

	target.set('display_name', snapName);
	target.set('user', '');
	target.set('claimable_by', '');
	target.set('placeholder_email', '');
	target.set('placeholder_name', '');
	if (!alreadyRemoved) target.set('removed_at', now);

	try {
		e.app.save(target);
	} catch (err) {
		throw new BadRequestError('Failed to remove member: ' + err);
	}

	return e.json(200, {
		ok: true,
		member_id: target.id,
		deleted: false,
		removed_at: target.get('removed_at'),
		disposition: disposition
	});
});
