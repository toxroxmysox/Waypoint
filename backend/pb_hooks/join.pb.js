/// <reference path="../pb_data/types.d.ts" />
// #118 — shared Join Link endpoints (MEMBERSHIP_LIFECYCLE_PRD §#118).
// Five router endpoints, no record hooks:
//   POST /api/join/create  — auth, owner/co_owner: mint a (trip, role) link
//   POST /api/join/rotate  — auth, owner/co_owner: new token on the link (old 404s)
//   POST /api/join/revoke  — auth, owner/co_owner: soft-disable the link
//   POST /api/join/lookup  — anon: minimal pre-auth context (title + dates + role)
//   POST /api/join/accept  — auth: join at the link role (claim + clamp invariant)
//
// PB 0.27 runs each callback in an isolated goja sandbox — file-scope helpers are
// invisible inside callbacks, so every shared bit (role cap, expiry clamp, date
// formatting) is inlined verbatim per endpoint. Don't extract.
//
// Cap invariant (Resolution 8): no join-link path yields a role above the link's
// role, EXCEPT an owner-targeted email-match placeholder (which inherits its own
// role, even co_owner). The schema enum already blocks minting owner/co_owner
// links; the accept clamp below blocks privilege escalation on claim.
//
// #133 guard: EVERY trip_members lookup adds `&& removed_at = ""` so a Departed
// Member tombstone (user="" && placeholder_email="") is never matched.

// --- POST /api/join/create -------------------------------------------------
// Auth, owner/co_owner. Body: { trip_id, role, expires_days? }.
//   - role capped at traveler (traveler | viewer only — never co_owner).
//   - one live link per (trip, role): a non-revoked existing link 400s ("rotate
//     or revoke first"); a revoked one is reused (re-armed) to respect the unique
//     (trip, role) index.
//   - expiry = now + expires_days (default 30), capped at trip end.
//   - dead on a closed (archived) trip.
routerAdd('POST', '/api/join/create', (e) => {
	const auth = e.auth;
	if (!auth) throw new UnauthorizedError('Authentication required');

	const info = e.requestInfo();
	const tripId = (info.body && info.body['trip_id']) || '';
	const role = (info.body && info.body['role']) || '';
	let expiresDays = info.body && info.body['expires_days'];

	if (!tripId) throw new BadRequestError('Missing trip_id');
	if (!role) throw new BadRequestError('Missing role');
	if (role !== 'traveler' && role !== 'viewer') {
		throw new BadRequestError('Join links can only be traveler or viewer — co-owner stays on the email invite path');
	}

	// Caller must be an active owner/co_owner of the trip.
	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid} && removed_at = ""', // #133 guard
			{ tripId: tripId, uid: auth.id }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}
	const callerRole = callerMember.getString('role');
	if (callerRole !== 'owner' && callerRole !== 'co_owner') {
		throw new ForbiddenError('Only owners and co-owners can manage join links');
	}

	// Trip must exist and not be closed (archived). Live only in planning/active.
	let trip;
	try {
		trip = e.app.findRecordById('trips', tripId);
	} catch (_) {
		throw new NotFoundError('Trip not found');
	}
	if (trip.get('archived')) {
		throw new ForbiddenError('This trip is closed; join links are disabled');
	}

	// Expiry: default 30 days, capped at trip end. Owner-set days clamps to [1, 365].
	let days = 30;
	if (expiresDays !== undefined && expiresDays !== null && expiresDays !== '') {
		const parsed = parseInt(expiresDays, 10);
		if (!isNaN(parsed) && parsed > 0) days = parsed;
	}
	if (days > 365) days = 365;
	let expiresMs = Date.now() + days * 24 * 60 * 60 * 1000;
	// Cap at trip end (end_date is the last day; allow through end-of-that-day).
	const endStr = trip.getString('end_date');
	if (endStr) {
		const endMs = new Date(endStr).getTime() + 24 * 60 * 60 * 1000; // end of the end day
		if (!isNaN(endMs) && endMs < expiresMs) expiresMs = endMs;
	}
	const expiresAt = new Date(expiresMs).toISOString().replace('T', ' ').replace('Z', '') + 'Z';

	const token = $security.randomString(40);

	// Reuse a revoked (trip, role) row if present (unique index), else insert.
	let existing = null;
	try {
		existing = e.app.findFirstRecordByFilter(
			'join_tokens',
			'trip = {:tripId} && role = {:role}',
			{ tripId: tripId, role: role }
		);
	} catch (_) {
		// No existing link for this (trip, role) — fine.
	}

	let link;
	if (existing) {
		if (!existing.get('revoked')) {
			throw new BadRequestError('A ' + role + ' link already exists for this trip — rotate or revoke it first');
		}
		existing.set('token', token);
		existing.set('expires_at', expiresAt);
		existing.set('revoked', false);
		existing.set('created_by', callerMember.id);
		link = existing;
	} else {
		const col = e.app.findCollectionByNameOrId('join_tokens');
		link = new Record(col);
		link.set('trip', tripId);
		link.set('role', role);
		link.set('token', token);
		link.set('expires_at', expiresAt);
		link.set('revoked', false);
		link.set('created_by', callerMember.id);
	}

	try {
		e.app.save(link);
	} catch (err) {
		throw new BadRequestError('Failed to create join link: ' + err);
	}

	return e.json(200, {
		id: link.id,
		token: token,
		role: role,
		expires_at: expiresAt
	});
});

// --- POST /api/join/rotate -------------------------------------------------
// Auth, owner/co_owner. Body: { trip_id, role }. Generates a new token on the
// existing (trip, role) link (the old token value no longer matches → 404),
// un-revokes it, and re-clamps expiry to trip end if needed. Keeps the existing
// expiry window otherwise.
routerAdd('POST', '/api/join/rotate', (e) => {
	const auth = e.auth;
	if (!auth) throw new UnauthorizedError('Authentication required');

	const info = e.requestInfo();
	const tripId = (info.body && info.body['trip_id']) || '';
	const role = (info.body && info.body['role']) || '';
	if (!tripId) throw new BadRequestError('Missing trip_id');
	if (!role) throw new BadRequestError('Missing role');

	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid} && removed_at = ""', // #133 guard
			{ tripId: tripId, uid: auth.id }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}
	const callerRole = callerMember.getString('role');
	if (callerRole !== 'owner' && callerRole !== 'co_owner') {
		throw new ForbiddenError('Only owners and co-owners can manage join links');
	}

	let trip;
	try {
		trip = e.app.findRecordById('trips', tripId);
	} catch (_) {
		throw new NotFoundError('Trip not found');
	}
	if (trip.get('archived')) {
		throw new ForbiddenError('This trip is closed; join links are disabled');
	}

	let link;
	try {
		link = e.app.findFirstRecordByFilter(
			'join_tokens',
			'trip = {:tripId} && role = {:role}',
			{ tripId: tripId, role: role }
		);
	} catch (_) {
		throw new NotFoundError('No join link to rotate — create one first');
	}

	const token = $security.randomString(40);
	link.set('token', token);
	link.set('revoked', false);
	link.set('created_by', callerMember.id);
	// Re-clamp expiry to trip end if the stored window now overshoots it.
	const endStr = trip.getString('end_date');
	const curExp = link.getString('expires_at');
	if (endStr && curExp) {
		const endMs = new Date(endStr).getTime() + 24 * 60 * 60 * 1000;
		const curMs = new Date(curExp).getTime();
		if (!isNaN(endMs) && !isNaN(curMs) && endMs < curMs) {
			link.set('expires_at', new Date(endMs).toISOString().replace('T', ' ').replace('Z', '') + 'Z');
		}
	}

	try {
		e.app.save(link);
	} catch (err) {
		throw new BadRequestError('Failed to rotate join link: ' + err);
	}

	return e.json(200, { id: link.id, token: token, role: role, expires_at: link.getString('expires_at') });
});

// --- POST /api/join/revoke -------------------------------------------------
// Auth, owner/co_owner. Body: { trip_id, role }. Soft-disables the link (the
// row stays so the (trip, role) slot can be re-armed by create/rotate).
routerAdd('POST', '/api/join/revoke', (e) => {
	const auth = e.auth;
	if (!auth) throw new UnauthorizedError('Authentication required');

	const info = e.requestInfo();
	const tripId = (info.body && info.body['trip_id']) || '';
	const role = (info.body && info.body['role']) || '';
	if (!tripId) throw new BadRequestError('Missing trip_id');
	if (!role) throw new BadRequestError('Missing role');

	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid} && removed_at = ""', // #133 guard
			{ tripId: tripId, uid: auth.id }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}
	const callerRole = callerMember.getString('role');
	if (callerRole !== 'owner' && callerRole !== 'co_owner') {
		throw new ForbiddenError('Only owners and co-owners can manage join links');
	}

	let link;
	try {
		link = e.app.findFirstRecordByFilter(
			'join_tokens',
			'trip = {:tripId} && role = {:role}',
			{ tripId: tripId, role: role }
		);
	} catch (_) {
		throw new NotFoundError('No join link to revoke');
	}

	link.set('revoked', true);
	try {
		e.app.save(link);
	} catch (err) {
		throw new BadRequestError('Failed to revoke join link: ' + err);
	}

	return e.json(200, { ok: true, role: role });
});

// --- POST /api/join/lookup -------------------------------------------------
// Anon-OK. Body: { token }. Returns ONLY trip title + dates + join role so the
// pre-auth context card can render (Resolution 6 — no roster/itinerary/money/
// documents). Unknown/revoked token → 404. Expired or closed-trip → 200 with a
// flag so the page can explain. For an AUTHENTICATED caller, also returns the
// trip's name-only placeholders for the browse-and-claim picker (Resolution 8).
routerAdd('POST', '/api/join/lookup', (e) => {
	const info = e.requestInfo();
	const token = (info.body && info.body['token']) || '';
	if (!token) throw new BadRequestError('Missing token');

	let link;
	try {
		link = e.app.findFirstRecordByFilter('join_tokens', 'token = {:token}', { token: token });
	} catch (_) {
		return e.json(404, { error: 'Join link not found' });
	}

	// A revoked link reads as not-found (the secret is dead).
	if (link.get('revoked')) {
		return e.json(404, { error: 'Join link not found' });
	}

	const tripId = link.getString('trip');
	let trip;
	try {
		trip = e.app.findRecordById('trips', tripId);
	} catch (_) {
		return e.json(404, { error: 'Join link not found' });
	}

	const expStr = link.getString('expires_at');
	const expired = expStr ? new Date(expStr) < new Date() : false;
	const closed = !!trip.get('archived');

	const baseResponse = {
		role: link.getString('role'),
		trip_title: trip.getString('title'),
		start_date: trip.getString('start_date'),
		end_date: trip.getString('end_date'),
		expired: expired,
		closed: closed,
		unclaimed_placeholders: []
	};

	const auth = e.auth;
	if (!auth || expired || closed) {
		return e.json(200, baseResponse);
	}

	// Name-only placeholders for the claim picker. #133 guard keeps tombstones out.
	let placeholders = [];
	try {
		placeholders = e.app.findRecordsByFilter(
			'trip_members',
			'trip = {:tripId} && user = "" && placeholder_email = "" && removed_at = ""',
			'',
			0,
			0,
			{ tripId: tripId }
		);
	} catch (_) {
		// None; fine.
	}
	const unclaimed = [];
	for (const p of placeholders) {
		const name = p.getString('display_name') || p.getString('placeholder_name') || '';
		if (!name) continue;
		unclaimed.push({ member_id: p.id, display_name: name, role: p.getString('role') });
	}
	baseResponse.unclaimed_placeholders = unclaimed;
	return e.json(200, baseResponse);
});

// --- POST /api/join/accept -------------------------------------------------
// Auth required. Body: { token, claim_placeholder? }. Joins the authed user at
// the link role, honouring the claim machinery + clamp invariant:
//   1. already a member → idempotent no-op, returns the existing member.
//   2. email-match placeholder (placeholder_email == auth email) → auto-claim,
//      inherits ITS OWN role (owner targeted this email; cap-exempt).
//   3. claim_placeholder (name-only) → claim identity, role CLAMPED to the lower
//      privilege of (placeholder role, link role) — never above the link cap.
//   4. no match → fresh member at the link role.
// Dead on a closed (archived) trip; rejects expired/revoked tokens.
routerAdd('POST', '/api/join/accept', (e) => {
	const auth = e.auth;
	if (!auth) throw new UnauthorizedError('Authentication required');

	const info = e.requestInfo();
	const token = (info.body && info.body['token']) || '';
	if (!token) throw new BadRequestError('Missing token');

	let link;
	try {
		link = e.app.findFirstRecordByFilter('join_tokens', 'token = {:token}', { token: token });
	} catch (_) {
		throw new BadRequestError('Join link not found');
	}
	if (link.get('revoked')) throw new BadRequestError('This join link has been revoked');

	const expStr = link.getString('expires_at');
	if (expStr && new Date(expStr) < new Date()) {
		throw new BadRequestError('This join link has expired');
	}

	const tripId = link.getString('trip');
	const linkRole = link.getString('role'); // traveler | viewer

	let trip;
	try {
		trip = e.app.findRecordById('trips', tripId);
	} catch (_) {
		throw new NotFoundError('Trip not found');
	}
	if (trip.get('archived')) {
		throw new ForbiddenError('This trip is closed; it is not taking new members');
	}

	const authEmail = (auth.email() || '').trim().toLowerCase();
	const nowStr = new Date().toISOString().replace('T', ' ').replace('Z', '') + 'Z';

	// Role privilege rank for the clamp (higher = more privilege).
	const rank = { viewer: 1, traveler: 2, co_owner: 3, owner: 4 };

	// 1. Already a member (idempotent).
	let existing = null;
	try {
		existing = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid} && removed_at = ""', // #133 guard
			{ tripId: tripId, uid: auth.id }
		);
	} catch (_) {
		// Not a member; continue.
	}
	if (existing) {
		return e.json(200, { trip_id: tripId, member_id: existing.id, already_member: true });
	}

	// 2. Email-match placeholder → auto-claim, inherits its own role (cap-exempt).
	if (authEmail) {
		let emailMatch = null;
		try {
			emailMatch = e.app.findFirstRecordByFilter(
				'trip_members',
				'trip = {:tripId} && placeholder_email = {:email} && removed_at = ""', // #133 guard
				{ tripId: tripId, email: authEmail }
			);
		} catch (_) {
			// No email-match; fall through.
		}
		if (emailMatch) {
			emailMatch.set('user', auth.id);
			emailMatch.set('placeholder_email', '');
			emailMatch.set('claimable_by', '');
			emailMatch.set('joined_at', nowStr);
			// Role unchanged — inherits its own (owner-targeted) role.
			try {
				e.app.save(emailMatch);
			} catch (err) {
				throw new BadRequestError('Failed to claim membership: ' + err);
			}
			return e.json(200, { trip_id: tripId, member_id: emailMatch.id, already_member: false });
		}
	}

	// 3. Name-only claim → identity inherited, role clamped to link cap.
	const claimId = (info.body && info.body['claim_placeholder']) || '';
	if (claimId) {
		let target;
		try {
			target = e.app.findRecordById('trip_members', claimId);
		} catch (_) {
			throw new BadRequestError('Placeholder not found');
		}
		if (target.getString('trip') !== tripId) {
			throw new BadRequestError('Placeholder does not belong to this trip');
		}
		// #133: reject a tombstone reached directly by id.
		if (target.getString('removed_at')) {
			throw new BadRequestError('This member has been removed and cannot be claimed');
		}
		if (target.getString('user')) {
			throw new BadRequestError('This placeholder has already been claimed');
		}
		if (target.getString('placeholder_email')) {
			throw new BadRequestError('This placeholder is managed by email matching');
		}

		// Clamp: result role = lower privilege of (placeholder role, link role).
		// Guarantees a name-only claim never lands above the link's cap.
		const phRole = target.getString('role');
		const clampedRole = (rank[phRole] || 1) <= (rank[linkRole] || 1) ? phRole : linkRole;

		target.set('user', auth.id);
		target.set('role', clampedRole);
		target.set('joined_at', nowStr);
		target.set('placeholder_name', '');
		try {
			e.app.save(target);
		} catch (err) {
			throw new BadRequestError('Failed to claim membership: ' + err);
		}
		return e.json(200, { trip_id: tripId, member_id: target.id, already_member: false });
	}

	// 4. Fresh member at the link role.
	const col = e.app.findCollectionByNameOrId('trip_members');
	const member = new Record(col);
	member.set('trip', tripId);
	member.set('user', auth.id);
	member.set('role', linkRole);
	member.set('joined_at', nowStr);
	try {
		e.app.save(member);
	} catch (err) {
		throw new BadRequestError('Failed to join trip: ' + err);
	}

	return e.json(200, { trip_id: tripId, member_id: member.id, already_member: false });
});
