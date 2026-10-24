/// <reference path="../pb_data/types.d.ts" />
// #281 (AUTHZ-6) — money_units edit/delete gate.
//
// THE GAP: money_units (migration 0050, ADR-0015 — a self-declared SHARED pool of
// members who pool spend) shipped with bare MEMBER_VIA_TRIP update/delete and the
// migration header flagged finer gating as deferred. So ANY trip member (incl. a
// viewer) could PATCH another couple's unit — insert their own trip_members.id into
// `members` to silently join the pooled-spend view, or DELETE the unit and corrupt
// the settle-up collapse (ADR-0015).
//
// THE RULE (ADR-0015 "anyone can leave" consent valve):
//   - owner/co_owner may manage any unit (the trip admins).
//   - otherwise the caller must ALREADY be a member of the unit (their own
//     trip_members.id is in the unit's ORIGINAL `members` array) to edit or delete
//     it. An existing unit member adding another member is the consent path; a
//     NON-member cannot unilaterally self-add (the "silently joining" exploit) — a
//     caller absent from the original members is rejected before any change is read.
//   - self-removal is therefore free: an existing member is in `members`, so they
//     pass the gate and may drop their own id (or delete the pool).
// list/view/create stay at MEMBER_VIA_TRIP (the rule) — any member can see units
// and declare a new one.
//
// goja: helpers inlined per handler; handler-first signature; the caller's member
// id is resolved by a trip_members lookup, and `members` (a multi-relation) is
// read off the ORIGINAL record and normalized to a plain string-id array (relation
// values read back as objects). created_by / members hold trip_members.id, NOT
// user ids.

// ---------------------------------------------------------------------------
// #503 invariant audit — before create: the groups form action set created_by
// to the caller and only offered this trip's members. Generic AI writes go
// straight to PB, so pin created_by to the caller's membership and refuse any
// member from another trip. Viewers may still declare a unit (rule unchanged).
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');
	const tripId = e.record.getString('trip');

	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid} && removed_at = ""',
			{ tripId: tripId, uid: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}
	e.record.set('created_by', callerMember.id);

	const raw = e.record.get('members') || [];
	for (let i = 0; i < raw.length; i++) {
		const id = '' + raw[i];
		let m;
		try {
			m = e.app.findRecordById('trip_members', id);
		} catch (_) {
			throw new BadRequestError('Unknown member in this group');
		}
		if (m.getString('trip') !== tripId) {
			throw new BadRequestError('A group can only hold members of this trip');
		}
	}
	e.next();
}, 'money_units');

// ---------------------------------------------------------------------------
// Before update: owner/co_owner OR an existing member of the unit.
// ---------------------------------------------------------------------------
onRecordUpdateRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const tripId = e.record.get('trip');

	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid} && removed_at = ""',
			{ tripId: tripId, uid: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	const callerRole = callerMember.getString('role');
	if (callerRole === 'owner' || callerRole === 'co_owner') {
		e.next();
		return;
	}

	// Otherwise the caller must ALREADY be in the unit. Read members off the
	// ORIGINAL record (not the inbound one) so a non-member can't pass by adding
	// themselves in the same PATCH. Normalize the multi-relation to string ids.
	const original = e.record.original();
	const rawMembers = original.get('members');
	const memberIds = [];
	if (rawMembers) for (let i = 0; i < rawMembers.length; i++) memberIds.push('' + rawMembers[i]);

	if (memberIds.indexOf('' + callerMember.id) === -1) {
		throw new ForbiddenError('Only a member of this money unit (or an owner/co-owner) can edit it');
	}

	e.next();
}, 'money_units');

// ---------------------------------------------------------------------------
// Before delete: owner/co_owner OR an existing member of the unit.
// ---------------------------------------------------------------------------
onRecordDeleteRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const tripId = e.record.get('trip');

	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid} && removed_at = ""',
			{ tripId: tripId, uid: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	const callerRole = callerMember.getString('role');
	if (callerRole === 'owner' || callerRole === 'co_owner') {
		e.next();
		return;
	}

	const rawMembers = e.record.get('members');
	const memberIds = [];
	if (rawMembers) for (let i = 0; i < rawMembers.length; i++) memberIds.push('' + rawMembers[i]);

	if (memberIds.indexOf('' + callerMember.id) === -1) {
		throw new ForbiddenError(
			'Only a member of this money unit (or an owner/co-owner) can delete it'
		);
	}

	e.next();
}, 'money_units');
