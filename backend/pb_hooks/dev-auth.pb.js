/// <reference path="../pb_data/types.d.ts" />
// Dev-only auth + fixture routes for E2E tests and the rules harness. Every
// route is gated on WAYPOINT_DEV_MODE=true; in any other environment they 400,
// so production deploys can't use them even if this file ships.
//
// PB 0.27 runs each callback in an isolated sandbox — top-of-file helpers are
// invisible inside the callback body, so anything reused gets inlined. Don't
// extract to functions outside the callback unless you're prepared to re-test.

// POST /api/dev/auth-bypass — issue a real PB auth token for a whitelisted
// email. Whitelist = (E2E_TEST_EMAIL ? [E2E_TEST_EMAIL] : []) ∪ E2E_TEST_EMAILS.
// E2E_TEST_EMAIL stays as the legacy single-email var the M1 Playwright spec
// uses; E2E_TEST_EMAILS is a comma-separated list for the rules harness.
routerAdd('POST', '/api/dev/auth-bypass', (e) => {
	if ($os.getenv('WAYPOINT_DEV_MODE') !== 'true') {
		throw new BadRequestError('Dev bypass is not enabled');
	}

	const single = $os.getenv('E2E_TEST_EMAIL') || '';
	const multi = $os.getenv('E2E_TEST_EMAILS') || '';
	const whitelist = new Set();
	if (single) whitelist.add(single);
	for (const raw of multi.split(',')) {
		const trimmed = raw.trim();
		if (trimmed) whitelist.add(trimmed);
	}
	if (whitelist.size === 0) {
		throw new BadRequestError('No test emails are configured');
	}

	const data = new DynamicModel({ email: '' });
	e.bindBody(data);

	if (!whitelist.has(data.email)) {
		throw new ForbiddenError('Email not whitelisted for bypass');
	}

	let user;
	try {
		user = e.app.findAuthRecordByEmail('users', data.email);
	} catch (_) {
		const users = e.app.findCollectionByNameOrId('users');
		user = new Record(users);
		user.setEmail(data.email);
		user.setPassword($security.randomString(40));
		user.set('name', 'E2E Test User');
		user.set('verified', true);
		e.app.save(user);
	}

	const token = user.newAuthToken();

	return e.json(200, {
		token: token,
		record: user
	});
});

// POST /api/dev/rules-fixture — create a fresh test trip with one member per
// role (owner, co_owner, traveler, viewer) plus child records (phase, day,
// item, checklist_item). Tears down any prior fixture trip with the same slug
// first, so the harness can run repeatedly without stale state.
//
// Body: { emails: { owner, co_owner, traveler, viewer, non_member } } — every
// email must be in the whitelist (E2E_TEST_EMAIL / E2E_TEST_EMAILS).
//
// Returns: { tripId, phaseId, dayId, itemId, checklistItemId,
//            memberIds: { owner, co_owner, traveler, viewer },
//            userIds: { owner, co_owner, traveler, viewer, non_member } }
routerAdd('POST', '/api/dev/rules-fixture', (e) => {
	if ($os.getenv('WAYPOINT_DEV_MODE') !== 'true') {
		throw new BadRequestError('Dev fixtures are not enabled');
	}

	const single = $os.getenv('E2E_TEST_EMAIL') || '';
	const multi = $os.getenv('E2E_TEST_EMAILS') || '';
	const whitelist = new Set();
	if (single) whitelist.add(single);
	for (const raw of multi.split(',')) {
		const trimmed = raw.trim();
		if (trimmed) whitelist.add(trimmed);
	}

	// bindBody + nested DynamicModel doesn't populate inner fields in PB 0.27 —
	// the JS bridge marshals the schema as a flat map and silently drops the
	// nesting. requestInfo().body returns the parsed JSON dict directly, so we
	// can read body['emails']['owner'] without going through DynamicModel.
	const info = e.requestInfo();
	const emails = (info.body && info.body['emails']) || {};

	const required = ['owner', 'co_owner', 'traveler', 'viewer', 'non_member'];
	for (const role of required) {
		const email = emails[role];
		if (!email) throw new BadRequestError('Missing email for role: ' + role);
		if (!whitelist.has(email)) {
			throw new ForbiddenError('Email not whitelisted: ' + email);
		}
	}

	// Find or create each user.
	const usersCol = e.app.findCollectionByNameOrId('users');
	const userIds = {};
	for (const role of required) {
		const email = emails[role];
		let user;
		try {
			user = e.app.findAuthRecordByEmail('users', email);
		} catch (_) {
			user = new Record(usersCol);
			user.setEmail(email);
			user.setPassword($security.randomString(40));
			user.set('name', 'E2E ' + role);
			user.set('verified', true);
			e.app.save(user);
		}
		userIds[role] = user.id;
	}

	// Tear down any existing fixture trip (cascade-deletes phases, days,
	// items, checklist_items, trip_members via cascadeDelete=true on relations).
	const slug = 'e2e-rules-test';
	try {
		const existing = e.app.findFirstRecordByFilter('trips', 'slug = {:slug}', { slug: slug });
		if (existing) e.app.delete(existing);
	} catch (_) {
		// No existing fixture trip; nothing to clean up.
	}

	// Create the trip. The trips after-create hook adds the owner as a member
	// and auto-generates day records for the date range.
	const tripsCol = e.app.findCollectionByNameOrId('trips');
	const trip = new Record(tripsCol);
	trip.set('slug', slug);
	trip.set('title', 'E2E Rules Test Trip');
	trip.set('start_date', '2026-06-01 00:00:00.000Z');
	trip.set('end_date', '2026-06-03 00:00:00.000Z');
	trip.set('timezone', 'UTC');
	trip.set('created_by', userIds.owner);
	e.app.save(trip);

	// Add the other three members.
	const tripMembersCol = e.app.findCollectionByNameOrId('trip_members');
	const memberIds = {};
	const ownerMember = e.app.findFirstRecordByFilter(
		'trip_members',
		'trip = {:tripId} && user = {:userId}',
		{ tripId: trip.id, userId: userIds.owner }
	);
	memberIds.owner = ownerMember.id;

	for (const role of ['co_owner', 'traveler', 'viewer']) {
		const member = new Record(tripMembersCol);
		member.set('trip', trip.id);
		member.set('user', userIds[role]);
		member.set('role', role);
		member.set(
			'joined_at',
			new Date().toISOString().replace('T', ' ').replace('Z', '') + 'Z'
		);
		e.app.save(member);
		memberIds[role] = member.id;
	}

	// Create a phase covering the whole trip.
	const phasesCol = e.app.findCollectionByNameOrId('phases');
	const phase = new Record(phasesCol);
	phase.set('trip', trip.id);
	phase.set('name', 'Test Phase');
	phase.set('start_date', '2026-06-01 00:00:00.000Z');
	phase.set('end_date', '2026-06-03 00:00:00.000Z');
	phase.set('order', 0);
	e.app.save(phase);

	// Pick the first auto-generated day for fixture references.
	const days = e.app.findRecordsByFilter('days', 'trip = {:tripId}', '+date', 1, 0, {
		tripId: trip.id
	});
	if (days.length === 0) {
		throw new Error('Fixture: trip after-create hook did not generate days');
	}
	const day = days[0];

	// Create an item.
	const itemsCol = e.app.findCollectionByNameOrId('items');
	const item = new Record(itemsCol);
	item.set('trip', trip.id);
	item.set('phase', phase.id);
	item.set('day', day.id);
	item.set('type', 'activity');
	item.set('title', 'Test Activity');
	item.set('created_by', memberIds.owner);
	e.app.save(item);

	// Second item — vote-create tests target this one so they don't collide with
	// the seeded fixture vote on `item` (unique index on votes(item, member)).
	const item2 = new Record(itemsCol);
	item2.set('trip', trip.id);
	item2.set('phase', phase.id);
	item2.set('day', day.id);
	item2.set('type', 'activity');
	item2.set('title', 'Test Activity 2');
	item2.set('created_by', memberIds.owner);
	e.app.save(item2);

	// Seed a vote owned by the owner on `item`, so the harness has a fixture
	// record for list/view/update/delete. update/delete are owner-only by rule
	// (member.user = @request.auth.id). Direct save bypasses the create hook.
	const votesCol = e.app.findCollectionByNameOrId('votes');
	const vote = new Record(votesCol);
	vote.set('trip', trip.id);
	vote.set('item', item.id);
	vote.set('member', memberIds.owner);
	vote.set('value', 'like');
	e.app.save(vote);

	// Create a checklist item under it.
	const checklistCol = e.app.findCollectionByNameOrId('checklist_items');
	const checklistItem = new Record(checklistCol);
	checklistItem.set('item', item.id);
	checklistItem.set('text', 'Test checklist row');
	checklistItem.set('order', 0);
	e.app.save(checklistItem);

	// Create a pending_invites row owned by the owner so the harness has a
	// fixture record to exercise list/view/delete against. Code is fixed (per
	// fixture) to keep the harness output deterministic; the create path
	// generates random codes.
	const invitesCol = e.app.findCollectionByNameOrId('pending_invites');
	const inviteCode = 'fixture-invite-code-' + Date.now();
	const expiresAt =
		new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
			.toISOString()
			.replace('T', ' ')
			.replace('Z', '') + 'Z';
	const invite = new Record(invitesCol);
	invite.set('trip', trip.id);
	invite.set('email', 'fixture-invitee@e2e.test');
	invite.set('role', 'viewer');
	invite.set('invited_by', memberIds.owner);
	invite.set('code', inviteCode);
	invite.set('expires_at', expiresAt);
	e.app.save(invite);

	// Seed a trip-scoped document owned by the owner so the harness has a fixture
	// record for list/view/delete (#70). The file field requires a real file
	// matching its mimeTypes (PDF + images), so attach a valid 1x1 PNG. Direct
	// save bypasses the documents create hook (which only pins uploaded_by).
	const documentsCol = e.app.findCollectionByNameOrId('documents');
	const png1x1 = new Uint8Array([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
		0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
		0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
		0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
		0x42, 0x60, 0x82
	]);
	const docFile = $filesystem.fileFromBytes(png1x1, 'fixture.png');
	const document = new Record(documentsCol);
	document.set('trip', trip.id);
	document.set('uploaded_by', memberIds.owner);
	document.set('file', docFile);
	e.app.save(document);

	return e.json(200, {
		tripId: trip.id,
		phaseId: phase.id,
		dayId: day.id,
		itemId: item.id,
		itemId2: item2.id,
		voteId: vote.id,
		checklistItemId: checklistItem.id,
		pendingInviteId: invite.id,
		pendingInviteCode: inviteCode,
		documentId: document.id,
		memberIds: memberIds,
		userIds: userIds
	});
});

// POST /api/dev/resend-smoke — sanity-check that PB can reach Resend with the
// configured API key + verified domain. Sends one email to a hardcoded
// whitelist of recipients (Scott's gmail) and returns Resend's response.
//
// Requires env: WAYPOINT_DEV_MODE=true, RESEND_API_KEY, RESEND_FROM.
//
// Body: { to: 'scottvh519@gmail.com' }
//
// This is the M2 pre-flight gate: green here unblocks M2b (invites). Once the
// real invite path is wired in M2b, this endpoint stays as a diagnostic — keep
// it around for "is Resend up and configured?" checks.
routerAdd('POST', '/api/dev/resend-smoke', (e) => {
	if ($os.getenv('WAYPOINT_DEV_MODE') !== 'true') {
		throw new BadRequestError('Dev smoke is not enabled');
	}

	const apiKey = $os.getenv('RESEND_API_KEY');
	const from = $os.getenv('RESEND_FROM');
	if (!apiKey) throw new BadRequestError('RESEND_API_KEY is not set');
	if (!from) throw new BadRequestError('RESEND_FROM is not set');

	const info = e.requestInfo();
	const to = (info.body && info.body['to']) || '';
	if (!to) throw new BadRequestError('Missing "to" in request body');

	// Hardcoded recipient whitelist — defense against accidental email blasts
	// if this endpoint somehow makes it into a non-dev env. Add to this list
	// when a new known-good test address is needed.
	const recipientWhitelist = new Set(['scottvh519@gmail.com']);
	if (!recipientWhitelist.has(to)) {
		throw new ForbiddenError('Recipient not in smoke-test whitelist: ' + to);
	}

	const stamp = new Date().toISOString();
	const res = $http.send({
		method: 'POST',
		url: 'https://api.resend.com/emails',
		headers: {
			'Content-Type': 'application/json',
			Authorization: 'Bearer ' + apiKey
		},
		body: JSON.stringify({
			from: from,
			to: [to],
			subject: 'Waypoint Resend smoke test',
			text:
				'This is the Waypoint pre-flight smoke test for Resend.\n\n' +
				'If you are reading this, the PB hook → Resend → inbox path is working.\n\n' +
				'Sent at: ' +
				stamp +
				'\nFrom: ' +
				from +
				'\nTo: ' +
				to
		})
	});

	console.log('resend-smoke status=' + res.statusCode + ' body=' + JSON.stringify(res.json));

	return e.json(200, {
		ok: res.statusCode >= 200 && res.statusCode < 300,
		resend_status: res.statusCode,
		resend_response: res.json,
		from: from,
		to: to,
		sent_at: stamp
	});
});
