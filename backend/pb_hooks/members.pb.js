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
	if (member.get('removed_at')) {
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
// POST /api/members/remove — soft-remove tombstone (#133, ADR-0008).
//
// Removal does NOT delete the trip_members row. It snapshots the resolved
// display name into display_name (so "Bob paid $40" still renders), clears
// `user` (severing access — no membership rule matches a cleared user id, so
// zero collection rules change), clears the claim hooks, and stamps removed_at.
// The row is RETAINED as a Departed Member tombstone.
//
// Body: { member_id, disposition?, reassign_to? }
//   disposition: 'keep' (default) | 'reassign' | 'cascade'
//     keep     — children stay pointing at the tombstone (default; only path for money).
//     reassign — rewrite the departed member's authored records to reassign_to.
//     cascade  — delete the departed member's NON-MONEY authored content.
//   reassign_to: target member id (required when disposition = 'reassign').
//
// Invariants (PRD Resolutions 10/12/13/14):
//   - Money (expenses, settlements) is NEVER cascade-deleted — keep or reassign.
//   - Votes (votes, goal_votes) ALWAYS drop. The retained row means their
//     member-relation cascadeDelete won't fire on its own, so we drop explicitly.
//   - Self-leave is tombstone-only (forced keep).
//   - Frozen on a closed (archived) trip.
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

	const alreadyRemoved = !!target.get('removed_at');
	const tripId = target.get('trip');

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
		if (reassignMember.get('removed_at')) {
			throw new BadRequestError('Cannot reassign to a removed member');
		}
	}

	// --- Always drop the departed member's votes (Resolution 12). The row is
	// retained, so votes.member / goal_votes.member cascadeDelete won't fire —
	// drop them explicitly.
	for (const col of ['votes', 'goal_votes']) {
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

	if (disposition === 'reassign') {
		// Money — never deleted; identity transfers to the reassignment target.
		rewriteSingle('expenses', 'paid_by', reassignTo);
		rewriteSingle('expenses', 'created_by', reassignTo);
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
	} else if (disposition === 'cascade') {
		// Money is NEVER cascaded (Resolution 10) — expenses/settlements stay,
		// pointing at the retained tombstone. Only non-money authored content drops.
		deleteWhere('suggestions', 'author'); // includes comments (target_type='comment')
		deleteWhere('trip_goals', 'created_by'); // cascadeDelete drops their goal_votes
		deleteWhere('documents', 'uploaded_by');
		// Optional authorship on records that stay — null it out.
		rewriteSingle('suggestions', 'reviewed_by', '');
		rewriteSingle('items', 'created_by', '');
		rewriteSingle('items', 'paid_by', '');
		rewriteSingle('items', 'booked_by', '');
		rewriteMulti('items', 'assigned_to', '');
		rewriteSingle('tasks', 'assignee', '');
	}
	// disposition === 'keep': children keep pointing at the tombstone — nothing to do.

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
		removed_at: target.get('removed_at'),
		disposition: disposition
	});
});
