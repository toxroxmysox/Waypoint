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

	// Create a checklist item under it.
	const checklistCol = e.app.findCollectionByNameOrId('checklist_items');
	const checklistItem = new Record(checklistCol);
	checklistItem.set('item', item.id);
	checklistItem.set('text', 'Test checklist row');
	checklistItem.set('order', 0);
	e.app.save(checklistItem);

	return e.json(200, {
		tripId: trip.id,
		phaseId: phase.id,
		dayId: day.id,
		itemId: item.id,
		checklistItemId: checklistItem.id,
		memberIds: memberIds,
		userIds: userIds
	});
});
