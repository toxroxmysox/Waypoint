/// <reference path="../pb_data/types.d.ts" />
// #175 — items role gate. SPEC §4: items are owner/co_owner only. Travelers
// *suggest* (route through /api/suggestions/create, which creates the item in
// admin context and bypasses these hooks); viewers are read-only. The PB rules
// stay at MEMBER_VIA_TRIP (membership) because the acting caller's role can't be
// correlated in a rule for update/delete, and import/closeout create items
// without `created_by` — so the owner/co_owner gate is enforced here, resolving
// the caller's ACTUAL membership rather than trusting a relation field. Mirrors
// documents.pb.js / expenses.pb.js (viewer-block + privileged-gate in the hook).
//
// PB 0.27 runs each callback in an isolated pooled goja runtime — top-of-file
// helpers are invisible inside the body, so the membership lookup is inlined per
// handler. Handler-first signature (cerebrum Do-Not-Repeat [2026-06-05]).

// ---------------------------------------------------------------------------
// Before create: only owner/co_owner may create items directly. Travelers and
// viewers are denied (travelers go through the suggestion endpoint instead).
// ---------------------------------------------------------------------------
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
		throw new ForbiddenError('Only an owner or co-owner can add items directly; travelers suggest items.');
	}

	e.next();
}, 'items');

// ---------------------------------------------------------------------------
// Before update: only owner/co_owner may edit/move/book items. (Travelers edit
// = suggest-only per SPEC §4; viewers read-only.)
// ---------------------------------------------------------------------------
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
		throw new ForbiddenError('Only an owner or co-owner can edit items.');
	}

	e.next();
}, 'items');

// ---------------------------------------------------------------------------
// Before delete: only owner/co_owner may delete items.
// ---------------------------------------------------------------------------
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
		throw new ForbiddenError('Only an owner or co-owner can delete items.');
	}

	e.next();
}, 'items');
