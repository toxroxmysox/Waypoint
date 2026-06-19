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
// Before update: only owner/co_owner may edit/move/book items (SPEC §4 —
// travelers edit = suggest-only; viewers read-only).
//
// CREATOR EXCEPTION (#219): a member may edit ALL fields of an item THEY created
// (created_by == the caller's own trip_members.id) DIRECTLY — no suggestion
// queue, including booking/money fields. "Suggest-only" is about contributing to
// OTHERS' plans; your own item is yours to edit. Delete stays owner/co_owner only
// (enforced in the delete hook below). created_by is a relation to trip_members
// (migration 0006), so it holds the AUTHOR'S MEMBER id — compare it to
// callerMember.id, NOT authId (a user id). Import/closeout items have no
// created_by, so this only ever matches items a member actually authored.
//
// NARROW EXCEPTION (#226, ADR-0011): a non-owner MEMBER (traveler/co_owner —
// never a viewer) may update an item IFF the ONLY delta is adding or removing
// their OWN trip_members.id in `assigned_to`. This is "I'm doing this" — a note
// about the caller's own participation, never something an owner approves — so
// it takes effect immediately and bypasses the suggest-only gate. Self-assign
// only ever toggles the CALLER's id; any change to another member's id or to any
// other field is rejected. The diff is computed SERVER-SIDE from the original
// record, so the client can't sneak in extra changes.
//
// goja scars (cerebrum): all logic inlined in the body (no file-scope helpers);
// explicit string comparisons (empty fields read back as truthy objects).
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
	if (role === 'owner' || role === 'co_owner') {
		e.next();
		return;
	}

	// Creator exception (#219): the caller created this item → full direct edit.
	// created_by holds a trip_members.id; compare to the caller's member id.
	// String-coerce both sides (empty/relation fields read back as objects in
	// goja — cerebrum scar); the createdBy guard skips items with no author
	// (import/closeout), where '' === callerMember.id must never pass.
	const createdBy = '' + e.record.get('created_by');
	if (createdBy && createdBy === '' + callerMember.id) {
		e.next();
		return;
	}

	// Viewers are read-only — never a self-assign.
	if (role === 'viewer') {
		throw new ForbiddenError('Only an owner or co-owner can edit items.');
	}

	// --- Self-assign exception (traveler) --------------------------------------
	const original = e.record.original();

	// (1) Reject any OTHER field delta. Every item field except assigned_to must
	// be byte-for-byte unchanged. Explicit, stable field list (no goja schema
	// introspection) + string-coercion compares (empty/JSON fields read back as
	// objects; '' + x normalizes them — cerebrum goja scar).
	const lockedFields = [
		'trip', 'phase', 'day', 'type', 'subtype', 'title', 'description',
		'location_name', 'location_address', 'location_coords', 'google_place_id',
		'start_time', 'end_time', 'start_tz', 'end_tz', 'end_date', 'status',
		'booked', 'booked_by', 'paid_by', 'confirmation_codes', 'reservation_url',
		'free_cancellation', 'cost_estimate_usd', 'cost_actual_usd', 'sort_order',
		'parent_item', 'requires_booking', 'created_by'
	];
	for (let i = 0; i < lockedFields.length; i++) {
		const f = lockedFields[i];
		if ('' + e.record.get(f) !== '' + original.get(f)) {
			throw new ForbiddenError(
				'Only an owner or co-owner can edit items; a member may only add or remove themselves.'
			);
		}
	}

	// (2) The assigned_to delta must be EXACTLY the caller's own id (added XOR
	// removed). Normalize both sides to plain string-id arrays first.
	const rawOld = original.get('assigned_to');
	const rawNew = e.record.get('assigned_to');
	const oldIds = [];
	if (rawOld) for (let i = 0; i < rawOld.length; i++) oldIds.push('' + rawOld[i]);
	const newIds = [];
	if (rawNew) for (let i = 0; i < rawNew.length; i++) newIds.push('' + rawNew[i]);

	const me = '' + callerMember.id;

	// Symmetric difference of old vs new ids — the ids that were added or removed.
	const changed = [];
	for (let i = 0; i < oldIds.length; i++) {
		if (newIds.indexOf(oldIds[i]) === -1 && changed.indexOf(oldIds[i]) === -1) changed.push(oldIds[i]);
	}
	for (let i = 0; i < newIds.length; i++) {
		if (oldIds.indexOf(newIds[i]) === -1 && changed.indexOf(newIds[i]) === -1) changed.push(newIds[i]);
	}

	if (changed.length !== 1 || changed[0] !== me) {
		throw new ForbiddenError(
			'Only an owner or co-owner can edit items; a member may only add or remove themselves.'
		);
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
