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

	const role = callerMember.getString('role');
	if (role !== 'owner' && role !== 'co_owner') {
		throw new ForbiddenError('Only an owner or co-owner can add items directly; travelers suggest items.');
	}

	// #402 — Not going is self-only: a new item may carry the caller's own "not
	// going", never another member's answer.
	const rawNotGoing = e.record.get('not_going');
	if (rawNotGoing) {
		for (let i = 0; i < rawNotGoing.length; i++) {
			if ('' + rawNotGoing[i] !== '' + callerMember.id) {
				throw new ForbiddenError("Only you can say you're not going.");
			}
		}
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
// NOT GOING (#402): the same exception covers the caller's own id in
// `not_going` (going ↔ not going ↔ no answer). Separately, and for EVERY role,
// a change to `not_going` may only ever touch the caller's own id, and viewers
// can't answer at all. Exclusivity of the two lists is the model hooks at the
// bottom of this file.
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

	const role = callerMember.getString('role');
	const original = e.record.original();
	const me = '' + callerMember.id;

	// --- #402 Not going: self-only for EVERY role, viewers can't answer --------
	// Checked BEFORE the owner and creator bypasses: nothing was agreed about
	// anyone setting or clearing another member's "not going". (An owner assigning
	// someone GOING still clears that member's not going — that is the
	// exclusivity model hook below, not a not_going write in this request.)
	const rawNgOld = original.get('not_going');
	const rawNgNew = e.record.get('not_going');
	const ngOld = [];
	if (rawNgOld) for (let i = 0; i < rawNgOld.length; i++) ngOld.push('' + rawNgOld[i]);
	const ngNew = [];
	if (rawNgNew) for (let i = 0; i < rawNgNew.length; i++) ngNew.push('' + rawNgNew[i]);
	const ngChanged = [];
	for (let i = 0; i < ngOld.length; i++) {
		if (ngNew.indexOf(ngOld[i]) === -1 && ngChanged.indexOf(ngOld[i]) === -1) ngChanged.push(ngOld[i]);
	}
	for (let i = 0; i < ngNew.length; i++) {
		if (ngOld.indexOf(ngNew[i]) === -1 && ngChanged.indexOf(ngNew[i]) === -1) ngChanged.push(ngNew[i]);
	}
	if (ngChanged.length > 0) {
		if (role === 'viewer') {
			throw new ForbiddenError("Viewers can't answer whether they're going.");
		}
		if (ngChanged.length !== 1 || ngChanged[0] !== me) {
			throw new ForbiddenError("Only you can say you're not going.");
		}
	}
	// --- end #402 ---------------------------------------------------------------

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
	// (`original` and `me` are resolved above, before the #402 not going check.)

	// (1) Reject any OTHER field delta. Every item field except assigned_to and
	// not_going (#402 — checked self-only above, and in (2) below) must
	// be byte-for-byte unchanged. Explicit, stable field list (no goja schema
	// introspection) + string-coercion compares (empty/JSON fields read back as
	// objects; '' + x normalizes them — cerebrum goja scar).
	const lockedFields = [
		'trip', 'phase', 'day', 'type', 'subtype', 'title', 'description',
		'location_name', 'location_address', 'location_coords', 'google_place_id',
		'start_time', 'end_time', 'start_tz', 'end_tz', 'flight_number', 'end_date', 'status',
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

	// Symmetric difference of old vs new ids — the ids that were added or removed.
	const changed = [];
	for (let i = 0; i < oldIds.length; i++) {
		if (newIds.indexOf(oldIds[i]) === -1 && changed.indexOf(oldIds[i]) === -1) changed.push(oldIds[i]);
	}
	for (let i = 0; i < newIds.length; i++) {
		if (oldIds.indexOf(newIds[i]) === -1 && changed.indexOf(newIds[i]) === -1) changed.push(newIds[i]);
	}
	// #402 — a member answering not going (or switching going ↔ not going in one
	// write) touches both lists; the union of both deltas must still be only them.
	for (let i = 0; i < ngChanged.length; i++) {
		if (changed.indexOf(ngChanged[i]) === -1) changed.push(ngChanged[i]);
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

	const role = callerMember.getString('role');
	if (role !== 'owner' && role !== 'co_owner') {
		throw new ForbiddenError('Only an owner or co-owner can delete items.');
	}

	e.next();
}, 'items');

// ---------------------------------------------------------------------------
// #402 — going / not going are EXCLUSIVE: a member is in at most one of
// `assigned_to` (going) and `not_going` (said not going); in neither = no answer.
// "Setting one clears the other." MODEL hooks (not request hooks), so they run on
// every save — REST writes AND internal e.app.save calls (members/remove reassign,
// suggestion approval) — after the request hooks above have authorised the write.
//
// Resolution for a member found in both lists after a change:
//   - newly added to not_going and NOT newly added to assigned_to → they just
//     said "not going": drop them from assigned_to;
//   - anything else (newly going; added to both at once; a new record) → going
//     wins: drop them from not_going. Same tie-break as goingStateOf() in
//     src/lib/itinerary/assignment.ts.
// goja: helpers inlined per callback; ids string-coerced ('' + x).
// ---------------------------------------------------------------------------
onRecordCreate((e) => {
	const rawGoing = e.record.get('assigned_to');
	const rawNot = e.record.get('not_going');
	const going = [];
	if (rawGoing) for (let i = 0; i < rawGoing.length; i++) going.push('' + rawGoing[i]);
	const notGoing = [];
	if (rawNot) for (let i = 0; i < rawNot.length; i++) notGoing.push('' + rawNot[i]);

	// A new record has no prior answers: any overlap resolves to going.
	const keep = [];
	for (let i = 0; i < notGoing.length; i++) {
		if (going.indexOf(notGoing[i]) === -1) keep.push(notGoing[i]);
	}
	if (keep.length !== notGoing.length) e.record.set('not_going', keep);

	e.next();
}, 'items');

onRecordUpdate((e) => {
	const original = e.record.original();
	const toIds = (raw) => {
		const out = [];
		if (raw) for (let i = 0; i < raw.length; i++) out.push('' + raw[i]);
		return out;
	};
	const oldGoing = toIds(original.get('assigned_to'));
	const oldNot = toIds(original.get('not_going'));
	const going = toIds(e.record.get('assigned_to'));
	const notGoing = toIds(e.record.get('not_going'));

	const dropFromGoing = [];
	const dropFromNot = [];
	for (let i = 0; i < notGoing.length; i++) {
		const id = notGoing[i];
		if (going.indexOf(id) === -1) continue;
		const newlyNot = oldNot.indexOf(id) === -1;
		const newlyGoing = oldGoing.indexOf(id) === -1;
		if (newlyNot && !newlyGoing) dropFromGoing.push(id);
		else dropFromNot.push(id);
	}
	if (dropFromGoing.length > 0) {
		e.record.set('assigned_to', going.filter((id) => dropFromGoing.indexOf(id) === -1));
	}
	if (dropFromNot.length > 0) {
		e.record.set('not_going', notGoing.filter((id) => dropFromNot.indexOf(id) === -1));
	}

	e.next();
}, 'items');
