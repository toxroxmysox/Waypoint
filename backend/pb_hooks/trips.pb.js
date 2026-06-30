/// <reference path="../pb_data/types.d.ts" />

// #280 (AUTHZ-2) — trips lifecycle/publishing role gate.
//
// THE GAP: trips.updateRule = MEMBER_VIA_TRIP (any member), and the only trips
// update hook (the day-reconcile below) just calls e.next() with no role check.
// So any member could PATCH the publishing/lifecycle flags via direct PB REST —
// flip archive_enabled + archive_publish_at to push the private itinerary public,
// set archived to lock the trip, or auto_approve_suggestions to auto-promote their
// own suggestions. requireOwner() is UI-only.
//
// This gate rejects changes to the protected fields unless the caller is
// owner/co_owner, comparing new vs original PER FIELD so ORDINARY member edits
// (title, dates, location_summary, timezone, ...) keep their MEMBER_VIA_TRIP
// allowance. It is registered FIRST (above the day-reconcile handler) so a denied
// write throws before any e.next() in the chain runs (PB runs onRecordUpdateRequest
// handlers in registration order; cerebrum [2026-06-14]).
//
// goja: all inlined, handler-first signature, string-coerced compares (empty /
// date fields read back as truthy objects — use getString for the date field).
onRecordUpdateRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const original = e.record.original();

	// Protected lifecycle/publishing fields. archive_publish_at is a DATE — compare
	// via getString (goja returns a truthy DateTime object for an empty date, so a
	// get()-based compare would misfire). The rest are bool/text — string-coerce.
	const boolTextFields = [
		'archived',
		'archive_enabled',
		'archive_show_budget',
		'public_share_token',
		'auto_approve_suggestions'
	];

	let protectedChanged = false;
	for (let i = 0; i < boolTextFields.length; i++) {
		const f = boolTextFields[i];
		if ('' + e.record.get(f) !== '' + original.get(f)) {
			protectedChanged = true;
			break;
		}
	}
	if (!protectedChanged) {
		if (e.record.getString('archive_publish_at') !== original.getString('archive_publish_at')) {
			protectedChanged = true;
		}
	}

	// No protected field touched → an ordinary member edit; let it proceed to the
	// reconcile handler at the MEMBER rule allowance.
	if (!protectedChanged) {
		e.next();
		return;
	}

	// A protected field changed → owner/co_owner only.
	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid} && removed_at = ""',
			{ tripId: e.record.id, uid: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	const callerRole = callerMember.get('role');
	if (callerRole !== 'owner' && callerRole !== 'co_owner') {
		throw new ForbiddenError(
			'Only an owner or co-owner can change a trip’s publishing or lifecycle settings'
		);
	}

	e.next();
}, 'trips');

// After trip creation: add creator as owner + generate day records.
// Callback in PocketBase's JS hook runtime doesn't see outer-file helpers
// (isolated sandbox). Logic is inlined here for that reason.
onRecordAfterCreateSuccess((e) => {
	// --- Auto-add creator as owner ---
	const createdBy = e.record.get('created_by');
	if (createdBy) {
		const members = e.app.findCollectionByNameOrId('trip_members');
		const membership = new Record(members);
		membership.set('trip', e.record.id);
		membership.set('user', createdBy);
		membership.set('role', 'owner');
		membership.set(
			'joined_at',
			new Date().toISOString().replace('T', ' ').replace('Z', '') + 'Z'
		);
		e.app.save(membership);
	}

	// --- Generate day records for every date in the trip's range ---
	const rawStart = e.record.getString('start_date');
	const rawEnd = e.record.getString('end_date');
	if (!rawStart || !rawEnd) {
		e.next();
		return;
	}

	// --- Auto-seed a default "Trip" phase spanning the whole trip (#217) ---
	// A trip must always have at least one phase (the delete hook in
	// phases.pb.js blocks removing the last one). Seeded BEFORE the day-seed
	// loop below so the phases query that loop runs (next block) picks it up
	// and buckets every generated day into it — no separate rebucket needed.
	// phases has NO `created_by` field (schema 0004): set trip + name +
	// start/end (the required/used fields) + order, mirroring trips/new.
	try {
		const phasesCollection = e.app.findCollectionByNameOrId('phases');
		const seedPhase = new Record(phasesCollection);
		seedPhase.set('trip', e.record.id);
		seedPhase.set('name', 'Phase 1');
		seedPhase.set('start_date', rawStart.substring(0, 10) + ' 00:00:00.000Z');
		seedPhase.set('end_date', rawEnd.substring(0, 10) + ' 00:00:00.000Z');
		seedPhase.set('order', 0);
		e.app.save(seedPhase);
	} catch (_) {
		// If phase seeding fails, still generate days (best-effort).
	}

	const daysCollection = e.app.findCollectionByNameOrId('days');

	let phases = [];
	try {
		phases = e.app.findRecordsByFilter(
			'phases',
			'trip = {:tripId}',
			'+order',
			0,
			0,
			{ tripId: e.record.id }
		);
	} catch (_) {
		phases = [];
	}

	const startDate = new Date(rawStart.substring(0, 10) + 'T00:00:00.000Z');
	const endDate = new Date(rawEnd.substring(0, 10) + 'T00:00:00.000Z');
	const current = new Date(startDate);
	while (current <= endDate) {
		const isoDay = current.toISOString().substring(0, 10);
		const dateStr = isoDay + ' 00:00:00.000Z';

		const day = new Record(daysCollection);
		day.set('trip', e.record.id);
		day.set('date', dateStr);

		const matched = [];
		for (const phase of phases) {
			const pStart = phase.getString('start_date');
			const pEnd = phase.getString('end_date');
			if (!pStart || !pEnd) continue;
			if (isoDay >= pStart.substring(0, 10) && isoDay <= pEnd.substring(0, 10)) {
				matched.push(phase.id);
			}
		}
		if (matched.length > 0) {
			day.set('phases', matched);
		}

		e.app.save(day);
		current.setUTCDate(current.getUTCDate() + 1);
	}

	e.next();
}, 'trips');

// After trip update: reconcile days if dates changed.
onRecordUpdateRequest((e) => {
	const oldStartDate = e.record.original().getString('start_date');
	const oldEndDate = e.record.original().getString('end_date');

	e.next();

	const newStartDate = e.record.getString('start_date');
	const newEndDate = e.record.getString('end_date');

	if (oldStartDate === newStartDate && oldEndDate === newEndDate) return;

	// --- Reconcile days (inlined for same sandbox reasons) ---
	if (!newStartDate || !newEndDate) return;

	const daysCollection = e.app.findCollectionByNameOrId('days');

	const existingDays = e.app.findRecordsByFilter(
		'days',
		'trip = {:tripId}',
		'-date',
		0,
		0,
		{ tripId: e.record.id }
	);
	const existingByDate = {};
	for (const day of existingDays) {
		existingByDate[day.getString('date').substring(0, 10)] = day;
	}

	const neededDates = {};
	const start = new Date(newStartDate.substring(0, 10) + 'T00:00:00.000Z');
	const end = new Date(newEndDate.substring(0, 10) + 'T00:00:00.000Z');
	const current = new Date(start);
	while (current <= end) {
		neededDates[current.toISOString().substring(0, 10)] = true;
		current.setUTCDate(current.getUTCDate() + 1);
	}

	let phases = [];
	try {
		phases = e.app.findRecordsByFilter(
			'phases',
			'trip = {:tripId}',
			'+order',
			0,
			0,
			{ tripId: e.record.id }
		);
	} catch (_) {
		phases = [];
	}

	// Create missing days
	for (const dateStr of Object.keys(neededDates)) {
		if (existingByDate[dateStr]) continue;
		const day = new Record(daysCollection);
		day.set('trip', e.record.id);
		day.set('date', dateStr + ' 00:00:00.000Z');
		const matched = [];
		for (const phase of phases) {
			const pStart = phase.getString('start_date');
			const pEnd = phase.getString('end_date');
			if (!pStart || !pEnd) continue;
			if (dateStr >= pStart.substring(0, 10) && dateStr <= pEnd.substring(0, 10)) {
				matched.push(phase.id);
			}
		}
		if (matched.length > 0) day.set('phases', matched);
		e.app.save(day);
	}

	// Remove days outside the new range; unlink their items first so items
	// become unscheduled rather than deleted.
	for (const [dateStr, day] of Object.entries(existingByDate)) {
		if (neededDates[dateStr]) continue;
		try {
			const items = e.app.findRecordsByFilter(
				'items',
				'day = {:dayId}',
				'',
				0,
				0,
				{ dayId: day.id }
			);
			for (const item of items) {
				item.set('day', '');
				item.set('phase', '');
				e.app.save(item);
			}
		} catch (_) {
			// No items to unlink
		}
		e.app.delete(day);
	}
}, 'trips');
