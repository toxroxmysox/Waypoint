/// <reference path="../pb_data/types.d.ts" />
// M3b: settlement validation hooks.
// - Before create: from_member != to_member, caller must be one of the parties.
// - Before delete: only creator or trip owner/co_owner.

// ---------------------------------------------------------------------------
// Before create: validate parties + set created_by.
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
	const record = e.record;
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const tripId = record.get('trip');
	if (!tripId) throw new BadRequestError('trip is required');

	const fromMember = record.get('from_member');
	const toMember = record.get('to_member');

	if (!fromMember || !toMember) {
		throw new BadRequestError('from_member and to_member are required');
	}
	if (fromMember === toMember) {
		throw new BadRequestError('from_member and to_member cannot be the same');
	}

	// Resolve caller membership.
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

	if (callerMember.getString('role') === 'viewer') {
		throw new ForbiddenError('Viewers cannot record settlements');
	}

	// Caller must be either from_member or to_member.
	if (callerMember.id !== fromMember && callerMember.id !== toMember) {
		throw new ForbiddenError('You can only record settlements you are a party to');
	}

	record.set('created_by', callerMember.id);

	e.next();
}, 'settlements');

// ---------------------------------------------------------------------------
// Before delete: only creator or trip owner/co_owner.
// ---------------------------------------------------------------------------
onRecordDeleteRequest((e) => {
	const record = e.record;
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const tripId = record.get('trip');
	const createdById = record.get('created_by');

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

	const callerRole = callerMember.getString('role');
	const isCreator = callerMember.id === createdById;
	const isPrivileged = callerRole === 'owner' || callerRole === 'co_owner';

	if (!isCreator && !isPrivileged) {
		throw new ForbiddenError('Only the settlement creator or trip owner/co-owner can delete settlements');
	}

	e.next();
}, 'settlements');

// ---------------------------------------------------------------------------
// #411 — cross-trip references. Every relation that names another trip-scoped
// record must point into this record's own trip. onRecordValidate, so admin
// saves are checked too. On update only changed fields are checked. Empty
// relation values are absent, not foreign ids. goja: helpers inlined.
// ---------------------------------------------------------------------------
onRecordValidate((e) => {
	const r = e.record;
	const tripId = r.getString('trip');
	const isNew = r.isNew();
	const changed = (f) => isNew || r.getString(f) !== r.original().getString(f);
	const sameTrip = (collection, id) => {
		try {
			return e.app.findRecordById(collection, id).getString('trip') === tripId;
		} catch (_) {
			return false;
		}
	};
	for (const f of ['from_member', 'to_member']) {
		const id = r.getString(f);
		if (id && (changed(f) || changed('trip')) && !sameTrip('trip_members', id)) {
			throw new BadRequestError("That member isn't on this trip.");
		}
	}
	e.next();
}, 'settlements');
