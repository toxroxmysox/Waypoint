/// <reference path="../pb_data/types.d.ts" />

// Re-bucket days when phases are created, updated, or deleted.
// Each day gets ALL phases whose date range contains it (multi-relation).
//
// IMPORTANT: PocketBase's JS hook runtime executes each callback in a pooled
// goja runtime that does NOT have access to functions/variables defined at
// file scope. The rebucket logic must therefore be fully inlined into every
// callback body (same constraint trips.pb.js documents). A previous version
// called a file-scope `rebucketDays()` helper, which threw a silently-
// swallowed ReferenceError after e.next() — so days were never bucketed.

// ---------------------------------------------------------------------------
// #175 — role gate. Phases are trip-structure: SPEC §4 puts them at the same
// tier as "Create/edit trip metadata" — owner/co_owner only. Travelers and
// viewers are read-only. PB rules stay at MEMBER_VIA_TRIP (membership) because
// phases have no `created_by` field and the acting caller's role can't be
// correlated in a rule for update/delete (multi-relation `?=` aliasing) — so the
// owner/co_owner gate is enforced here, resolving the caller's actual membership.
//
// These role hooks are registered BEFORE the day-rebucket hooks below, so they
// run first in the request chain: a viewer/traveler write throws here (before
// any e.next()), aborting the request, and the rebucket hooks never fire. An
// owner/co_owner write calls e.next(), which cascades into the rebucket hook.
//
// PB 0.27 isolated-sandbox + handler-first signature: membership lookup inlined
// per callback (cerebrum Do-Not-Repeat [2026-06-05]).
onRecordCreateRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const tripId = e.record.get('trip');
	if (!tripId) throw new BadRequestError('trip is required');

	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid}',
			{ tripId: tripId, uid: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	const role = callerMember.get('role');
	if (role !== 'owner' && role !== 'co_owner') {
		throw new ForbiddenError('Only an owner or co-owner can create phases.');
	}

	e.next();
}, 'phases');

onRecordUpdateRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const tripId = e.record.get('trip');

	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid}',
			{ tripId: tripId, uid: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	const role = callerMember.get('role');
	if (role !== 'owner' && role !== 'co_owner') {
		throw new ForbiddenError('Only an owner or co-owner can edit phases.');
	}

	e.next();
}, 'phases');

onRecordDeleteRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const tripId = e.record.get('trip');

	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid}',
			{ tripId: tripId, uid: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	const role = callerMember.get('role');
	if (role !== 'owner' && role !== 'co_owner') {
		throw new ForbiddenError('Only an owner or co-owner can delete phases.');
	}

	e.next();
}, 'phases');

onRecordCreateRequest((e) => {
	e.next();

	const tripId = e.record.getString('trip');
	let days;
	try {
		days = e.app.findRecordsByFilter('days', 'trip = {:tripId}', '+date', 0, 0, { tripId: tripId });
	} catch (_) {
		return;
	}
	let phases;
	try {
		phases = e.app.findRecordsByFilter('phases', 'trip = {:tripId}', '+order', 0, 0, { tripId: tripId });
	} catch (_) {
		phases = [];
	}
	for (const day of days) {
		const dayDate = day.getString('date').substring(0, 10);
		const matched = [];
		for (const phase of phases) {
			const pStart = phase.getString('start_date');
			const pEnd = phase.getString('end_date');
			if (!pStart || !pEnd) continue;
			if (dayDate >= pStart.substring(0, 10) && dayDate <= pEnd.substring(0, 10)) matched.push(phase.id);
		}
		const current = day.get('phases') || [];
		if ([...current].sort().join(',') !== [...matched].sort().join(',')) {
			day.set('phases', matched);
			e.app.save(day);
		}
	}
}, 'phases');

onRecordUpdateRequest((e) => {
	e.next();

	const tripId = e.record.getString('trip');
	let days;
	try {
		days = e.app.findRecordsByFilter('days', 'trip = {:tripId}', '+date', 0, 0, { tripId: tripId });
	} catch (_) {
		return;
	}
	let phases;
	try {
		phases = e.app.findRecordsByFilter('phases', 'trip = {:tripId}', '+order', 0, 0, { tripId: tripId });
	} catch (_) {
		phases = [];
	}
	for (const day of days) {
		const dayDate = day.getString('date').substring(0, 10);
		const matched = [];
		for (const phase of phases) {
			const pStart = phase.getString('start_date');
			const pEnd = phase.getString('end_date');
			if (!pStart || !pEnd) continue;
			if (dayDate >= pStart.substring(0, 10) && dayDate <= pEnd.substring(0, 10)) matched.push(phase.id);
		}
		const current = day.get('phases') || [];
		if ([...current].sort().join(',') !== [...matched].sort().join(',')) {
			day.set('phases', matched);
			e.app.save(day);
		}
	}
}, 'phases');

onRecordDeleteRequest((e) => {
	const tripId = e.record.getString('trip');

	// #217 — a trip must always have at least one phase. Block deleting the
	// LAST remaining phase of its trip. Counted BEFORE e.next() so the throw
	// aborts the delete (a throw after e.next() is too late — bug-114). Inlined
	// per the goja isolated-sandbox constraint documented above.
	let phaseCount = 0;
	try {
		const tripPhases = e.app.findRecordsByFilter(
			'phases',
			'trip = {:tripId}',
			'',
			0,
			0,
			{ tripId: tripId }
		);
		phaseCount = tripPhases.length;
	} catch (_) {
		phaseCount = 0;
	}
	if (phaseCount <= 1) {
		throw new BadRequestError(
			'A trip must have at least one phase. Add another phase before deleting this one.'
		);
	}

	// #196 — block-until-moved: a phase still holding unplanned ("idea") items
	// cannot be deleted. items.phase has no cascadeDelete, so PB would clear
	// item.phase and strand those ideas in phase-less limbo (renderable on no
	// surface). Force the owner to re-home them first. Counted BEFORE e.next()
	// so the throw aborts the delete (a throw after e.next() is too late —
	// bug-114 / cerebrum). Planned items keep their day and survive a phase
	// delete fine, so only status=unplanned blocks.
	let orphanCount = 0;
	try {
		const stranded = e.app.findRecordsByFilter(
			'items',
			'phase = {:phaseId} && status = "unplanned"',
			'',
			0,
			0,
			{ phaseId: e.record.id }
		);
		orphanCount = stranded.length;
	} catch (_) {
		orphanCount = 0;
	}
	if (orphanCount > 0) {
		throw new BadRequestError(
			'Move ' +
				orphanCount +
				' idea' +
				(orphanCount === 1 ? '' : 's') +
				' out of this phase before deleting it.'
		);
	}

	e.next();

	let days;
	try {
		days = e.app.findRecordsByFilter('days', 'trip = {:tripId}', '+date', 0, 0, { tripId: tripId });
	} catch (_) {
		return;
	}
	let phases;
	try {
		phases = e.app.findRecordsByFilter('phases', 'trip = {:tripId}', '+order', 0, 0, { tripId: tripId });
	} catch (_) {
		phases = [];
	}
	for (const day of days) {
		const dayDate = day.getString('date').substring(0, 10);
		const matched = [];
		for (const phase of phases) {
			const pStart = phase.getString('start_date');
			const pEnd = phase.getString('end_date');
			if (!pStart || !pEnd) continue;
			if (dayDate >= pStart.substring(0, 10) && dayDate <= pEnd.substring(0, 10)) matched.push(phase.id);
		}
		const current = day.get('phases') || [];
		if ([...current].sort().join(',') !== [...matched].sort().join(',')) {
			day.set('phases', matched);
			e.app.save(day);
		}
	}
}, 'phases');
