/// <reference path="../pb_data/types.d.ts" />
// M2b — invite endpoints + email send. Three router endpoints + one
// after-create hook:
//   POST /api/invites/create  — auth, creates pending_invites (server fills
//                                code/expires_at/invited_by)
//   POST /api/invites/lookup  — anon, returns minimal invite metadata by code
//   POST /api/invites/accept  — auth, creates trip_member + deletes invite
//   onRecordAfterCreateSuccess('pending_invites') — sends Resend email
//
// PB 0.27 runs each callback in an isolated sandbox — outer-file helpers are
// invisible inside callbacks, so anything reused gets inlined verbatim. Don't
// extract to functions outside the callback unless you're prepared to re-test.

// --- POST /api/invites/create ----------------------------------------------
// Auth required. Body: { trip_id, email, role }. Validates:
//   - requester is a member of the trip
//   - requester role is allowed to invite the requested role per SPEC §3:
//       * owner/co_owner can invite any role (co_owner, traveler, viewer)
//       * traveler can invite traveler/viewer only
//       * viewer cannot invite
//   - invitee email is not already a member of the trip (placeholder OR real)
// On success: generates `code` (40 chars) + `expires_at` (7 days), sets
// `invited_by` to the requester's trip_members.id, saves the record.
// The after-create hook then sends the email.
routerAdd('POST', '/api/invites/create', (e) => {
	const auth = e.auth;
	if (!auth) throw new UnauthorizedError('Authentication required');

	const info = e.requestInfo();
	const tripId = (info.body && info.body['trip_id']) || '';
	const emailRaw = (info.body && info.body['email']) || '';
	const role = (info.body && info.body['role']) || '';

	if (!tripId) throw new BadRequestError('Missing trip_id');
	if (!emailRaw) throw new BadRequestError('Missing email');
	if (!role) throw new BadRequestError('Missing role');

	const email = String(emailRaw).trim().toLowerCase();
	if (!email.includes('@')) throw new BadRequestError('Invalid email');

	const allowedRoles = ['co_owner', 'traveler', 'viewer'];
	if (allowedRoles.indexOf(role) === -1) {
		throw new BadRequestError('Invalid role: must be co_owner | traveler | viewer');
	}

	// Look up requester's trip_members row.
	let requesterMember;
	try {
		requesterMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:userId}',
			{ tripId: tripId, userId: auth.id }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	const requesterRole = requesterMember.getString('role');

	// SPEC §3 inviter gating.
	if (requesterRole === 'viewer') {
		throw new ForbiddenError('Viewers cannot invite');
	}
	if (requesterRole === 'traveler' && role === 'co_owner') {
		throw new ForbiddenError('Travelers cannot invite co-owners');
	}
	// owner / co_owner pass for any role; traveler passes for traveler/viewer.

	// Reject if the invitee is already a member (real or placeholder).
	let existingByEmail = null;
	try {
		existingByEmail = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && placeholder_email = {:email}',
			{ tripId: tripId, email: email }
		);
	} catch (_) {
		// Not a placeholder; continue.
	}
	if (existingByEmail) {
		throw new BadRequestError('That email is already a placeholder member of this trip');
	}

	// Real-user check: look up users by email; if found and they're a member, reject.
	let existingUser = null;
	try {
		existingUser = e.app.findAuthRecordByEmail('users', email);
	} catch (_) {
		// No user with that email yet; fine.
	}
	if (existingUser) {
		let alreadyMember = null;
		try {
			alreadyMember = e.app.findFirstRecordByFilter(
				'trip_members',
				'trip = {:tripId} && user = {:userId}',
				{ tripId: tripId, userId: existingUser.id }
			);
		} catch (_) {
			// Not a member; fine.
		}
		if (alreadyMember) {
			throw new BadRequestError('That user is already a member of this trip');
		}
	}

	// Generate code + expiry. 40 chars of urlsafe entropy; 7-day TTL.
	const code = $security.randomString(40);
	const expiresMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
	const expiresAt =
		new Date(expiresMs).toISOString().replace('T', ' ').replace('Z', '') + 'Z';

	const collection = e.app.findCollectionByNameOrId('pending_invites');
	const invite = new Record(collection);
	invite.set('trip', tripId);
	invite.set('email', email);
	invite.set('role', role);
	invite.set('invited_by', requesterMember.id);
	invite.set('code', code);
	invite.set('expires_at', expiresAt);

	try {
		e.app.save(invite);
	} catch (err) {
		// Most likely the unique (trip, email) constraint — invite already exists.
		throw new BadRequestError(
			'An invite for that email already exists on this trip; revoke it first'
		);
	}

	return e.json(200, {
		id: invite.id,
		code: code,
		email: email,
		role: role,
		expires_at: expiresAt
	});
});

// --- POST /api/invites/lookup ----------------------------------------------
// Anon-OK. Body: { code }. Returns minimal metadata so the accept page can
// render context before the user authenticates. Never returns the trip id or
// invited_by — only what's needed to render "You've been invited to [Trip] as
// [role] (sent to [email])".
routerAdd('POST', '/api/invites/lookup', (e) => {
	const info = e.requestInfo();
	const code = (info.body && info.body['code']) || '';
	if (!code) throw new BadRequestError('Missing code');

	let invite;
	try {
		invite = e.app.findFirstRecordByFilter('pending_invites', 'code = {:code}', {
			code: code
		});
	} catch (_) {
		// Treat unknown code as not-found, not as 500.
		return e.json(404, { error: 'Invite not found' });
	}

	const expiresAt = invite.getString('expires_at');
	const expired = expiresAt ? new Date(expiresAt) < new Date() : false;

	// Resolve trip title for display.
	let tripTitle = '';
	let inviterName = '';
	try {
		const trip = e.app.findRecordById('trips', invite.getString('trip'));
		tripTitle = trip.getString('title');
	} catch (_) {
		// Shouldn't happen — cascade-delete keeps invites tied to live trips.
	}
	try {
		const inviter = e.app.findRecordById('trip_members', invite.getString('invited_by'));
		inviterName = inviter.getString('display_name') || '';
		if (!inviterName) {
			const inviterUserId = inviter.getString('user');
			if (inviterUserId) {
				const inviterUser = e.app.findRecordById('users', inviterUserId);
				inviterName = inviterUser.getString('name') || inviterUser.email() || '';
			}
		}
	} catch (_) {
		// Ignore; just leave inviterName empty.
	}

	// Return base metadata for anon callers or email-mismatch.
	const baseResponse = {
		email: invite.getString('email'),
		role: invite.getString('role'),
		trip_title: tripTitle,
		inviter_name: inviterName,
		expired: expired,
		unclaimed_placeholders: []
	};

	// Only fetch placeholders for authenticated users whose email matches.
	const auth = e.auth;
	if (!auth || expired) {
		return e.json(200, baseResponse);
	}

	const authEmail = (auth.email() || '').trim().toLowerCase();
	const lookupEmail = invite.getString('email').trim().toLowerCase();
	if (authEmail !== lookupEmail) {
		return e.json(200, baseResponse);
	}

	// Find name-only placeholders: no user, no email, just a display name.
	const tripId = invite.getString('trip');
	let placeholders = [];
	try {
		placeholders = e.app.findRecordsByFilter(
			'trip_members',
			'trip = {:tripId} && user = "" && placeholder_email = ""',
			'',
			0,
			0,
			{ tripId: tripId }
		);
	} catch (_) {
		// No placeholders; fine.
	}

	const unclaimedPlaceholders = [];
	for (const p of placeholders) {
		const name = p.getString('display_name') || p.getString('placeholder_name') || '';
		if (!name) continue;
		unclaimedPlaceholders.push({
			member_id: p.id,
			display_name: name,
			role: p.getString('role')
		});
	}

	baseResponse.unclaimed_placeholders = unclaimedPlaceholders;
	return e.json(200, baseResponse);
});

// --- POST /api/invites/accept ----------------------------------------------
// Auth required. Body: { code }. Validates:
//   - code exists and is not expired
//   - authenticated user's email matches the invite email (case-insensitive)
//   - user is not already a member (idempotent: if already a member, just
//     deletes the stale invite and returns ok)
// On success: creates trip_members row with the invited role, sets joined_at,
// deletes the pending_invites row. Returns { trip_id, member_id }.
routerAdd('POST', '/api/invites/accept', (e) => {
	const auth = e.auth;
	if (!auth) throw new UnauthorizedError('Authentication required');

	const info = e.requestInfo();
	const code = (info.body && info.body['code']) || '';
	if (!code) throw new BadRequestError('Missing code');

	let invite;
	try {
		invite = e.app.findFirstRecordByFilter('pending_invites', 'code = {:code}', {
			code: code
		});
	} catch (_) {
		throw new BadRequestError('Invite not found');
	}

	const expiresAt = invite.getString('expires_at');
	if (expiresAt && new Date(expiresAt) < new Date()) {
		throw new BadRequestError('Invite expired');
	}

	const inviteEmail = invite.getString('email').trim().toLowerCase();
	const authEmail = (auth.email() || '').trim().toLowerCase();
	if (inviteEmail !== authEmail) {
		throw new ForbiddenError(
			'This invite was sent to ' + inviteEmail + ' — log in as that address to accept'
		);
	}

	const tripId = invite.getString('trip');

	// Already-member short-circuit: delete the stale invite, return existing
	// member id. Keeps the accept link idempotent.
	let existingMember = null;
	try {
		existingMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:userId}',
			{ tripId: tripId, userId: auth.id }
		);
	} catch (_) {
		// Not a member yet; fine.
	}
	if (existingMember) {
		try {
			e.app.delete(invite);
		} catch (_) {
			// Best effort.
		}
		return e.json(200, {
			trip_id: tripId,
			member_id: existingMember.id,
			already_member: true
		});
	}

	// Name-only placeholder claim path: user explicitly selected a placeholder
	// from the browse-and-claim UI during invite acceptance.
	const claimPlaceholderId = (info.body && info.body['claim_placeholder']) || '';
	if (claimPlaceholderId) {
		let target;
		try {
			target = e.app.findRecordById('trip_members', claimPlaceholderId);
		} catch (_) {
			throw new BadRequestError('Placeholder not found');
		}

		// Validate: belongs to the same trip.
		if (target.getString('trip') !== tripId) {
			throw new BadRequestError('Placeholder does not belong to this trip');
		}
		// Validate: actually unclaimed (no user, no placeholder_email).
		if (target.getString('user')) {
			throw new BadRequestError('This placeholder has already been claimed');
		}
		if (target.getString('placeholder_email')) {
			throw new BadRequestError('This placeholder is managed by email matching');
		}

		const joinedAt =
			new Date().toISOString().replace('T', ' ').replace('Z', '') + 'Z';
		target.set('user', auth.id);
		target.set('joined_at', joinedAt);
		target.set('placeholder_name', '');
		e.app.save(target);

		e.app.delete(invite);
		return e.json(200, {
			trip_id: tripId,
			member_id: target.id,
			already_member: false
		});
	}

	// Placeholder-claim path: if there's a placeholder row matching this email,
	// claim it (set user, clear placeholder fields, set joined_at). Otherwise
	// create a fresh trip_members row with the invited role.
	let placeholder = null;
	try {
		placeholder = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && placeholder_email = {:email}',
			{ tripId: tripId, email: inviteEmail }
		);
	} catch (_) {
		// No placeholder; fine.
	}

	const joinedAt =
		new Date().toISOString().replace('T', ' ').replace('Z', '') + 'Z';

	let member;
	if (placeholder) {
		// Claim the placeholder. Keep the role from the placeholder (an owner
		// who pre-staged Jake as a co-owner shouldn't have that downgraded by
		// a later invite that was created at a lower role — though the
		// placeholder + invite combo shouldn't really happen in the M2c flow).
		placeholder.set('user', auth.id);
		placeholder.set('placeholder_email', '');
		placeholder.set('joined_at', joinedAt);
		e.app.save(placeholder);
		member = placeholder;
	} else {
		const tripMembersCol = e.app.findCollectionByNameOrId('trip_members');
		member = new Record(tripMembersCol);
		member.set('trip', tripId);
		member.set('user', auth.id);
		member.set('role', invite.getString('role'));
		member.set('joined_at', joinedAt);
		e.app.save(member);
	}

	// Remove the consumed invite.
	e.app.delete(invite);

	return e.json(200, {
		trip_id: tripId,
		member_id: member.id,
		already_member: false
	});
});

// --- onRecordDeleteRequest('pending_invites') (revoke gating) --------------
// Rule already restricts to trip members; this hook layers SPEC §3 role
// gating on top:
//   - owner / co_owner: can revoke any invite for the trip
//   - traveler: can revoke only invites they sent themselves
//   - viewer: cannot revoke (also can't invite, so this is belt-and-suspenders)
onRecordDeleteRequest((e) => {
	const auth = e.auth;
	if (!auth) {
		// Shouldn't happen given the rule, but defense-in-depth.
		throw new ForbiddenError('Authentication required');
	}

	const tripId = e.record.getString('trip');

	let requesterMember;
	try {
		requesterMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:userId}',
			{ tripId: tripId, userId: auth.id }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	const requesterRole = requesterMember.getString('role');
	if (requesterRole === 'owner' || requesterRole === 'co_owner') {
		e.next();
		return;
	}
	if (requesterRole === 'traveler') {
		if (e.record.getString('invited_by') === requesterMember.id) {
			e.next();
			return;
		}
		throw new ForbiddenError('Travelers can only revoke invites they sent');
	}
	throw new ForbiddenError('Viewers cannot revoke invites');
}, 'pending_invites');

// --- onRecordAfterCreateSuccess('pending_invites') -------------------------
// Sends the invite email via Resend. Fails soft (logs but doesn't throw) so a
// transient Resend outage doesn't roll back the invite — owner can resend by
// revoking + re-creating, and the lookup link still works regardless.
//
// Per the PB 0.27 isolation gotcha: every helper inlined; smoke-test by
// reading the console.log line at the start of the callback before debugging
// the email payload.
onRecordAfterCreateSuccess((e) => {
	console.log(
		'invites.pb.js: pending_invites after-create fired id=' + e.record.id
	);

	if ($os.getenv('WAYPOINT_DEV_MODE') === 'true') {
		console.log('invites.pb.js: WAYPOINT_DEV_MODE=true; skipping invite email');
		e.next();
		return;
	}

	const apiKey = $os.getenv('RESEND_API_KEY');
	const from = $os.getenv('RESEND_FROM');
	const publicUrl = $os.getenv('PUBLIC_APP_URL') || 'http://localhost:5173';

	if (!apiKey || !from) {
		console.log(
			'invites.pb.js: RESEND_API_KEY or RESEND_FROM not set; skipping email send'
		);
		e.next();
		return;
	}

	const code = e.record.getString('code');
	const email = e.record.getString('email');
	const role = e.record.getString('role');

	// Resolve trip + inviter for the email body.
	let tripTitle = 'a trip';
	try {
		const trip = e.app.findRecordById('trips', e.record.getString('trip'));
		tripTitle = trip.getString('title') || 'a trip';
	} catch (_) {
		// Fallback to default tripTitle.
	}

	let inviterName = 'A Waypoint user';
	try {
		const inviter = e.app.findRecordById(
			'trip_members',
			e.record.getString('invited_by')
		);
		const dn = inviter.getString('display_name');
		if (dn) {
			inviterName = dn;
		} else {
			const inviterUserId = inviter.getString('user');
			if (inviterUserId) {
				const inviterUser = e.app.findRecordById('users', inviterUserId);
				inviterName = inviterUser.getString('name') || inviterUser.email() || inviterName;
			}
		}
	} catch (_) {
		// Fallback to default inviterName.
	}

	const acceptUrl = publicUrl.replace(/\/$/, '') + '/invite/' + code;

	const subject = inviterName + ' invited you to plan ' + tripTitle;
	const text =
		'Hi,\n\n' +
		inviterName +
		' invited you to join "' +
		tripTitle +
		'" on Waypoint as a ' +
		role.replace('_', '-') +
		'.\n\n' +
		'Accept the invite:\n' +
		acceptUrl +
		'\n\n' +
		'This link expires in 7 days. If you did not expect this email, you can ignore it.\n\n' +
		'— Waypoint';

	// Plaintext-first per M2_STATUS.md; one-line HTML wrap so clients that
	// strip text/plain still render something readable.
	const html =
		'<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.5; color: #1a1a1a;">' +
		'<p>Hi,</p>' +
		'<p><strong>' +
		inviterName +
		'</strong> invited you to join &ldquo;' +
		tripTitle +
		'&rdquo; on Waypoint as a <strong>' +
		role.replace('_', '-') +
		'</strong>.</p>' +
		'<p><a href="' +
		acceptUrl +
		'" style="display: inline-block; padding: 10px 16px; background: #5a6e58; color: #fff; text-decoration: none; border-radius: 6px;">Accept invite</a></p>' +
		'<p style="color: #666; font-size: 14px;">Or paste this link into your browser:<br><code>' +
		acceptUrl +
		'</code></p>' +
		'<p style="color: #666; font-size: 14px;">This link expires in 7 days. If you did not expect this email, you can ignore it.</p>' +
		'<p style="color: #666; font-size: 14px;">&mdash; Waypoint</p>' +
		'</div>';

	try {
		const res = $http.send({
			method: 'POST',
			url: 'https://api.resend.com/emails',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer ' + apiKey
			},
			body: JSON.stringify({
				from: from,
				to: [email],
				subject: subject,
				text: text,
				html: html
			})
		});
		console.log(
			'invites.pb.js: resend status=' +
				res.statusCode +
				' to=' +
				email +
				' invite=' +
				e.record.id
		);
	} catch (err) {
		console.log('invites.pb.js: resend send failed: ' + err);
	}

	e.next();
}, 'pending_invites');

// ---------------------------------------------------------------------------
// GET /api/invites/my-pending
// Returns pending invites for the authenticated user's email so the post-login
// /claim interstitial can redirect them back to the invite page.
// Admin context so it can read pending_invites regardless of trip membership.
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/invites/my-pending', (e) => {
	const auth = e.auth;
	if (!auth) throw new UnauthorizedError('Authentication required');

	const email = String(auth.email() || '').trim().toLowerCase();
	if (!email) return e.json(200, { invites: [] });

	let rows;
	try {
		rows = e.app.findRecordsByFilter(
			'pending_invites',
			'email = {:email}',
			'',
			0,
			0,
			{ email: email }
		);
	} catch (_) {
		return e.json(200, { invites: [] });
	}

	const now = new Date();
	const invites = [];
	for (const row of rows) {
		const expiresAt = row.get('expires_at');
		if (expiresAt && new Date(expiresAt) < now) continue;
		invites.push({ code: row.get('code') });
	}

	return e.json(200, { invites: invites });
});
