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
			'placeholder_email = {:email} && user = ""',
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
			'claimable_by = {:uid}',
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
			'trip = {:tripId} && user = {:uid}',
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
						'trip = {:tripId} && user = {:uid}',
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
				'trip = {:tripId} && placeholder_email = {:email}',
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
			'trip = {:tripId} && user = {:uid}',
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
// POST /api/members/remove
// Remove a member from the trip. Caller must be owner or co_owner.
// Cannot remove the sole owner.
// Body: { member_id }
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

	const tripId = target.get('trip');

	// Verify caller is owner/co_owner of the same trip.
	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid}',
			{ tripId: tripId, uid: authRecord.id }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	const callerRole = callerMember.get('role');
	if (callerRole !== 'owner' && callerRole !== 'co_owner') {
		throw new ForbiddenError('Only owners and co-owners can remove members');
	}

	// Cannot remove the sole owner.
	if (target.get('role') === 'owner') {
		let ownerCount = 0;
		try {
			const owners = e.app.findRecordsByFilter(
				'trip_members',
				'trip = {:tripId} && role = "owner"',
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

	try {
		e.app.delete(target);
	} catch (err) {
		throw new BadRequestError('Failed to remove member: ' + err);
	}

	return e.json(200, { ok: true });
});
