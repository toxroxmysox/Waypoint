/// <reference path="../pb_data/types.d.ts" />
// M2b — invite endpoints + email send. Router endpoints + one after-create hook:
//   POST /api/invites/create  — auth, creates pending_invites (server fills
//                                code/expires_at/invited_by)
//   POST /api/invites/lookup  — anon, returns minimal invite metadata by code
//   POST /api/invites/accept  — auth, creates trip_member + deletes invite
//   GET  /api/invites/my-pending, POST /api/invites/decline — the invitee's
//                                side, listed on /trips (#397)
//   GET  /api/invites/co-travelers, POST /api/invites/create-for-user — #352
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
			'trip = {:tripId} && user = {:userId} && removed_at = ""', // #133 guard
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
			'trip = {:tripId} && placeholder_email = {:email} && removed_at = ""', // #133 guard
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
				'trip = {:tripId} && user = {:userId} && removed_at = ""', // #133 guard
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
	// #449 — the inviter typed this address, so the pending list may show it
	// back to them. Picker invites are 'picked' and never do.
	invite.set('origin', 'typed');

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
				// Name only (#409): lookup is reachable by anyone holding the code.
				inviterName = inviterUser.getString('name') || '';
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
			// #133 (highest-risk cross-issue guard): a Departed Member tombstone
			// ALSO matches user="" && placeholder_email="". Without removed_at=""
			// a removed member would reappear as a name-only claimable slot.
			'trip = {:tripId} && user = "" && placeholder_email = "" && removed_at = ""',
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
	// Returned with every outcome so callers can redirect without a second read.
	let tripSlug = '';
	try {
		tripSlug = e.app.findRecordById('trips', tripId).getString('slug');
	} catch (_) {}

	// Already-member short-circuit: delete the stale invite, return existing
	// member id. Keeps the accept link idempotent.
	let existingMember = null;
	try {
		existingMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:userId} && removed_at = ""', // #133 guard
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
			trip_slug: tripSlug,
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
		// #133: a Departed Member tombstone (user="" && placeholder_email="") would
		// otherwise pass the unclaimed checks below and be resurrected by a direct
		// claim_placeholder id. Reject it at the claim point.
		if (target.getString('removed_at')) {
			throw new BadRequestError('This member has been removed and cannot be claimed');
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
			trip_slug: tripSlug,
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
			'trip = {:tripId} && placeholder_email = {:email} && removed_at = ""', // #133 guard
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
		trip_slug: tripSlug,
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
			'trip = {:tripId} && user = {:userId} && removed_at = ""', // #133 guard
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
				inviterName = inviterUser.getString('name') || inviterName; // never the email (#409)
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
		'Already using Waypoint? Just open the app — the invite is waiting on your trips list.\n\n' +
		'This link expires in 7 days. If you did not expect this email, you can ignore it.\n\n' +
		'— Waypoint';

	// Trip titles and member names are user-controlled: escape them for the
	// HTML part, or any member could inject markup/links into a Waypoint-sent
	// email to an address of their choosing (#397 review).
	const esc = (v) =>
		String(v)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');

	// Plaintext-first per M2_STATUS.md; one-line HTML wrap so clients that
	// strip text/plain still render something readable.
	const html =
		'<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.5; color: #1a1a1a;">' +
		'<p>Hi,</p>' +
		'<p><strong>' +
		esc(inviterName) +
		'</strong> invited you to join &ldquo;' +
		esc(tripTitle) +
		'&rdquo; on Waypoint as a <strong>' +
		esc(role.replace('_', '-')) +
		'</strong>.</p>' +
		'<p><a href="' +
		acceptUrl +
		'" style="display: inline-block; padding: 10px 16px; background: #5a6e58; color: #fff; text-decoration: none; border-radius: 6px;">Accept invite</a></p>' +
		'<p style="color: #666; font-size: 14px;">Or paste this link into your browser:<br><code>' +
		acceptUrl +
		'</code></p>' +
		'<p style="color: #666; font-size: 14px;">Already using Waypoint? Just open the app &mdash; the invite is waiting on your trips list.</p>' +
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
// Pending, unexpired invites for the authenticated user's email. Feeds the
// Invitations section on /trips and its avatar badge (#397).
// Admin context so it can read pending_invites regardless of trip membership.
// Returns { invites: [{ code, trip_title, inviter_name, role, needs_choice }] }
// — needs_choice: the trip has unclaimed name-only
// placeholders, so accepting goes through /invite/<code> where the invitee
// can say "I'm Abby" instead of becoming a duplicate member. Names only,
// never an address (#352 rule).
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
			'email = {:email} && expires_at > @now',
			'-expires_at',
			0,
			0,
			{ email: email }
		);
	} catch (_) {
		return e.json(200, { invites: [] });
	}

	const invites = [];
	for (const row of rows) {
		const tripId = row.getString('trip');

		// Already on the trip (e.g. added another way): the invite is stale.
		try {
			e.app.findFirstRecordByFilter(
				'trip_members',
				'trip = {:t} && user = {:u} && removed_at = ""',
				{ t: tripId, u: auth.id }
			);
			continue;
		} catch (_) {}

		let tripTitle = '';
		try {
			tripTitle = e.app.findRecordById('trips', tripId).getString('title');
		} catch (_) {
			continue; // trip gone
		}

		let inviterName = '';
		try {
			const inviter = e.app.findRecordById('trip_members', row.getString('invited_by'));
			inviterName = inviter.getString('display_name');
			if (!inviterName && inviter.getString('user')) {
				inviterName = e.app.findRecordById('users', inviter.getString('user')).getString('name');
			}
		} catch (_) {}

		let needsChoice = false;
		try {
			needsChoice =
				e.app.findRecordsByFilter(
					'trip_members',
					'trip = {:t} && user = "" && placeholder_email = "" && removed_at = ""',
					'',
					1,
					0,
					{ t: tripId }
				).length > 0;
		} catch (_) {}

		invites.push({
			code: row.getString('code'),
			trip_title: tripTitle,
			inviter_name: inviterName || 'Someone',
			role: row.getString('role'),
			needs_choice: needsChoice
		});
	}

	return e.json(200, { invites: invites });
});

// ---------------------------------------------------------------------------
// POST /api/invites/decline  { code }
// #397 — the invitee declines from the Invitations section on /trips. Decline
// DELETES the invite (Scott, 2026-10-02): no declined state, no notification.
// Only the invited address may decline it; the revoke gating hook
// (onRecordDeleteRequest) is for trip members and doesn't apply to e.app.delete.
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/invites/decline', (e) => {
	const auth = e.auth;
	if (!auth) throw new UnauthorizedError('Authentication required');

	const body = e.requestInfo().body || {};
	const code = String(body['code'] || '');
	if (!code) throw new BadRequestError('Missing code');

	let invite;
	try {
		invite = e.app.findFirstRecordByFilter('pending_invites', 'code = {:code}', { code: code });
	} catch (_) {
		throw new NotFoundError('Invite not found');
	}

	const inviteEmail = invite.getString('email').trim().toLowerCase();
	const authEmail = String(auth.email() || '').trim().toLowerCase();
	if (inviteEmail !== authEmail) throw new ForbiddenError('This invite is not yours to decline');

	e.app.delete(invite);
	return e.json(200, { declined: true });
});

// ---------------------------------------------------------------------------
// #352 — past co-traveler picker.
//
// Two endpoints that let you invite someone you've travelled with WITHOUT
// knowing (or ever seeing) their email address:
//   GET  /api/invites/co-travelers?trip_id=ID — the pool: name + avatar only.
//   POST /api/invites/create-for-user          — invite by USER ID; the server
//        derives the email and re-validates the co-traveler relationship.
//
// Why hooks and not a client/SSR PB query: `users.listRule` is self-only and
// `emailVisibility` is off (migration 0043 opened `viewRule` to co-travelers for
// name+avatar only), so neither the browser nor the SvelteKit load can resolve
// the pool or the address. Hook context reads with app privileges, which is also
// what keeps the address off the wire — nothing below ever returns an email.
//
// PB 0.27 isolates each callback: every helper is inlined verbatim, on purpose.
// ---------------------------------------------------------------------------

// GET /api/invites/co-travelers?trip_id=ID
// Auth + trip membership + non-viewer required (same authority as inviting).
// Returns:
//   { co_travelers: [{ user_id, name, avatar }] }
// (#450: `pending_names` was removed — its only consumer moved to
// GET /api/invites/pending in #409.)
routerAdd('GET', '/api/invites/co-travelers', (e) => {
	const auth = e.auth;
	if (!auth) throw new UnauthorizedError('Authentication required');

	const query = e.requestInfo().query || {};
	const tripId = Array.isArray(query['trip_id'])
		? query['trip_id'][0]
		: query['trip_id'] || '';
	if (!tripId) throw new BadRequestError('trip_id is required');

	// Requester must be an ACTIVE member of the target trip (#133 guard) and
	// allowed to invite at all.
	let requesterMember;
	try {
		requesterMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:userId} && removed_at = ""',
			{ tripId: tripId, userId: auth.id }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}
	if (requesterMember.getString('role') === 'viewer') {
		throw new ForbiddenError('Viewers cannot invite');
	}

	// 1. Every trip the requester is CURRENTLY on (their own tombstones are
	//    excluded by removed_at — a trip you were removed from is not "shared").
	let myMemberships = [];
	try {
		myMemberships = e.app.findRecordsByFilter(
			'trip_members',
			'user = {:userId} && removed_at = ""',
			'',
			0,
			0,
			{ userId: auth.id }
		);
	} catch (_) {
		myMemberships = [];
	}

	// 2. Active, real-user members of those trips = the raw pool. `user != ""`
	//    drops placeholders (no account to invite); removed_at = "" drops
	//    tombstones on the OTHER side (#133 — this is exactly the query where
	//    forgetting it resurrects ex-members).
	const seen = {};
	const pool = [];
	for (const mine of myMemberships) {
		const sharedTripId = mine.getString('trip');
		if (!sharedTripId) continue;
		let others = [];
		try {
			others = e.app.findRecordsByFilter(
				'trip_members',
				'trip = {:tripId} && user != "" && user != {:userId} && removed_at = ""',
				'',
				0,
				0,
				{ tripId: sharedTripId, userId: auth.id }
			);
		} catch (_) {
			others = [];
		}
		for (const other of others) {
			const otherUserId = other.getString('user');
			if (!otherUserId || seen[otherUserId]) continue;
			let otherUser;
			try {
				otherUser = e.app.findRecordById('users', otherUserId);
			} catch (_) {
				continue; // stale ref — skip rather than surface a nameless row
			}
			// Name only, never the address: the account name, else the per-trip
			// nickname from the shared trip, else a neutral label.
			const name =
				otherUser.getString('name') || other.getString('display_name') || 'Traveler';
			seen[otherUserId] = {
				user_id: otherUserId,
				name: name,
				avatar: otherUser.getString('avatar') || '',
				email: String(otherUser.email() || '').trim().toLowerCase()
			};
			pool.push(seen[otherUserId]);
		}
	}

	// 3. Exclude anyone already ACTIVE on this trip.
	let currentMembers = [];
	try {
		currentMembers = e.app.findRecordsByFilter(
			'trip_members',
			'trip = {:tripId} && user != "" && removed_at = ""',
			'',
			0,
			0,
			{ tripId: tripId }
		);
	} catch (_) {
		currentMembers = [];
	}
	const alreadyMember = {};
	for (const m of currentMembers) alreadyMember[m.getString('user')] = true;

	// 4. Exclude anyone with an open invite on this trip.
	let invites = [];
	try {
		invites = e.app.findRecordsByFilter(
			'pending_invites',
			'trip = {:tripId}',
			'',
			0,
			0,
			{ tripId: tripId }
		);
	} catch (_) {
		invites = [];
	}
	const invitedEmails = {};
	for (const inv of invites) {
		const invEmail = inv.getString('email').trim().toLowerCase();
		if (!invEmail) continue;
		invitedEmails[invEmail] = true;
	}

	const out = [];
	for (const c of pool) {
		if (alreadyMember[c.user_id]) continue;
		if (c.email && invitedEmails[c.email]) continue;
		// Deliberately drops `email` — the response never carries an address.
		out.push({ user_id: c.user_id, name: c.name, avatar: c.avatar });
	}
	out.sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));

	return e.json(200, { co_travelers: out.slice(0, 60) });
});

// ---------------------------------------------------------------------------
// #409 — GET /api/invites/pending?trip_id=ID
// The members page's Pending invites list. pending_invites is superuser-read
// only (migration 0070), so this is the one member-facing read. Any ACTIVE member
// may call it (the list was always visible to the whole roster); what changes is
// the label, which never carries an address the caller didn't already know:
//   1. invitee is a co-traveler of the caller → their NAME (the #352 rule —
//      a picker-created invite must not round-trip the address);
//   2. else the caller is the inviter AND typed the address (origin 'typed',
//      #449) → that address;
//   3. else the caller is the inviter of a PICKER invite (origin 'picked') →
//      the name captured when they picked (picked_name). A picked invitee who
//      has since left every shared trip used to fall into 2 and leak (#449);
//   4. else → masked (`j•••@gmail.com`). Pre-0072 rows (origin '') land here
//      for everyone: how they were created is unknown, so never the address.
// Never returns `email` or `code`.
// Returns { invites: [{ id, role, invited_by, expires_at, label }] }, newest first.
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/invites/pending', (e) => {
	const auth = e.auth;
	if (!auth) throw new UnauthorizedError('Authentication required');

	const query = e.requestInfo().query || {};
	const tripId = Array.isArray(query['trip_id']) ? query['trip_id'][0] : query['trip_id'] || '';
	if (!tripId) throw new BadRequestError('trip_id is required');

	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:userId} && removed_at = ""',
			{ tripId: tripId, userId: auth.id }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	let invites = [];
	try {
		invites = e.app.findRecordsByFilter(
			'pending_invites',
			'trip = {:tripId}',
			'-expires_at',
			0,
			0,
			{ tripId: tripId }
		);
	} catch (_) {
		invites = [];
	}
	if (invites.length === 0) return e.json(200, { invites: [] });

	// The caller's co-travelers: active real users on any trip the caller is
	// currently on (same pool definition as /api/invites/co-travelers).
	const coTravelerName = {}; // lowercased email → name
	let myMemberships = [];
	try {
		myMemberships = e.app.findRecordsByFilter(
			'trip_members',
			'user = {:userId} && removed_at = ""',
			'',
			0,
			0,
			{ userId: auth.id }
		);
	} catch (_) {
		myMemberships = [];
	}
	const seenUser = {};
	for (const mine of myMemberships) {
		let others = [];
		try {
			others = e.app.findRecordsByFilter(
				'trip_members',
				'trip = {:tripId} && user != "" && user != {:userId} && removed_at = ""',
				'',
				0,
				0,
				{ tripId: mine.getString('trip'), userId: auth.id }
			);
		} catch (_) {
			others = [];
		}
		for (const other of others) {
			const uid = other.getString('user');
			if (!uid || seenUser[uid]) continue;
			seenUser[uid] = true;
			let u;
			try {
				u = e.app.findRecordById('users', uid);
			} catch (_) {
				continue;
			}
			const addr = String(u.email() || '').trim().toLowerCase();
			if (!addr) continue;
			coTravelerName[addr] = u.getString('name') || other.getString('display_name') || 'Traveler';
		}
	}

	const out = [];
	for (const inv of invites) {
		const addr = inv.getString('email').trim().toLowerCase();
		const origin = inv.getString('origin'); // #449: 'typed' | 'picked' | '' (pre-0072)
		const isInviter = inv.getString('invited_by') === callerMember.id;
		const pickedName = inv.getString('picked_name').trim();
		let label;
		if (addr && coTravelerName[addr]) {
			label = coTravelerName[addr];
		} else if (isInviter && origin === 'typed') {
			label = addr;
		} else if (isInviter && origin === 'picked' && pickedName) {
			label = pickedName;
		} else {
			const at = addr.indexOf('@');
			label = at > 0 ? addr.charAt(0) + '•••' + addr.substring(at) : 'Invited guest';
		}
		out.push({
			id: inv.id,
			role: inv.getString('role'),
			invited_by: inv.getString('invited_by'),
			expires_at: inv.getString('expires_at'),
			label: label
		});
	}

	return e.json(200, { invites: out });
});

// POST /api/invites/create-for-user
// Body: { trip_id, user_id, role }. Same gating as /api/invites/create, plus a
// server-side re-check that the picked user really is a co-traveler — the id
// comes from the client and is never trusted. On success the address is read
// here, written to pending_invites, and the existing after-create hook mails
// the invite. The response carries the NAME only.
routerAdd('POST', '/api/invites/create-for-user', (e) => {
	const auth = e.auth;
	if (!auth) throw new UnauthorizedError('Authentication required');

	const info = e.requestInfo();
	const tripId = (info.body && info.body['trip_id']) || '';
	const userId = (info.body && info.body['user_id']) || '';
	const role = (info.body && info.body['role']) || '';

	if (!tripId) throw new BadRequestError('Missing trip_id');
	if (!userId) throw new BadRequestError('Missing user_id');
	if (!role) throw new BadRequestError('Missing role');

	const allowedRoles = ['co_owner', 'traveler', 'viewer'];
	if (allowedRoles.indexOf(role) === -1) {
		throw new BadRequestError('Invalid role: must be co_owner | traveler | viewer');
	}

	if (userId === auth.id) throw new BadRequestError('You are already on this trip');

	let requesterMember;
	try {
		requesterMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:userId} && removed_at = ""', // #133 guard
			{ tripId: tripId, userId: auth.id }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	// SPEC §3 inviter gating — identical to /api/invites/create.
	const requesterRole = requesterMember.getString('role');
	if (requesterRole === 'viewer') throw new ForbiddenError('Viewers cannot invite');
	if (requesterRole === 'traveler' && role === 'co_owner') {
		throw new ForbiddenError('Travelers cannot invite co-owners');
	}

	let target;
	try {
		target = e.app.findRecordById('users', userId);
	} catch (_) {
		throw new NotFoundError('That traveller could not be found');
	}

	// Re-validate the co-traveler relationship server-side: some trip on which
	// BOTH of us hold an active (non-tombstoned) membership. Without this, a
	// crafted user id would invite a stranger — and reveal, by success/failure,
	// that their account exists.
	let shared = false;
	let sharedNickname = ''; // #449 — the target's display_name on that shared trip
	let myMemberships = [];
	try {
		myMemberships = e.app.findRecordsByFilter(
			'trip_members',
			'user = {:userId} && removed_at = ""',
			'',
			0,
			0,
			{ userId: auth.id }
		);
	} catch (_) {
		myMemberships = [];
	}
	for (const mine of myMemberships) {
		const sharedTripId = mine.getString('trip');
		if (!sharedTripId) continue;
		try {
			const theirs = e.app.findFirstRecordByFilter(
				'trip_members',
				'trip = {:tripId} && user = {:userId} && removed_at = ""',
				{ tripId: sharedTripId, userId: userId }
			);
			shared = true;
			sharedNickname = theirs.getString('display_name').trim();
			break;
		} catch (_) {
			// not on that trip; keep looking
		}
	}
	if (!shared) {
		throw new ForbiddenError("You haven't travelled with that person");
	}

	// Already on this trip?
	let existingMember = null;
	try {
		existingMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:userId} && removed_at = ""', // #133 guard
			{ tripId: tripId, userId: userId }
		);
	} catch (_) {
		// not a member; fine
	}
	if (existingMember) throw new BadRequestError('They are already a member of this trip');

	const email = String(target.email() || '').trim().toLowerCase();
	if (!email) throw new BadRequestError('That traveller has no email on file');

	// Mirror the by-email path's placeholder collision check.
	let placeholder = null;
	try {
		placeholder = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && placeholder_email = {:email} && removed_at = ""', // #133 guard
			{ tripId: tripId, email: email }
		);
	} catch (_) {
		// no placeholder; fine
	}
	if (placeholder) {
		throw new BadRequestError('They are already a placeholder member of this trip');
	}

	const code = $security.randomString(40);
	const expiresMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
	const expiresAt = new Date(expiresMs).toISOString().replace('T', ' ').replace('Z', '') + 'Z';

	const collection = e.app.findCollectionByNameOrId('pending_invites');
	const invite = new Record(collection);
	invite.set('trip', tripId);
	invite.set('email', email);
	invite.set('role', role);
	invite.set('invited_by', requesterMember.id);
	invite.set('code', code);
	invite.set('expires_at', expiresAt);
	// #449 — picked by name: the pending list must never show this address, not
	// even to the inviter. Capture the name they picked (same chain as the
	// co-travelers pool, minus its 'Traveler' filler) so the label outlives the
	// pair sharing a trip; empty → the list masks it.
	invite.set('origin', 'picked');
	invite.set('picked_name', (target.getString('name').trim() || sharedNickname).substring(0, 200));

	try {
		e.app.save(invite);
	} catch (err) {
		throw new BadRequestError('They already have an open invite to this trip');
	}

	const name = target.getString('name') || 'Traveler';
	// No email, no code: the inviter never learns the address they just used.
	return e.json(200, { id: invite.id, role: role, name: name });
});
