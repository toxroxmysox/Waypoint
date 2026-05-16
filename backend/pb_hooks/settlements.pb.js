/// <reference path="../pb_data/types.d.ts" />
// M3b: settlement validation hooks.
// - Before create: from_member != to_member, caller must be one of the parties.
// - Before delete: only creator or trip owner/co_owner.

// ---------------------------------------------------------------------------
// Before create: validate parties + set created_by.
// ---------------------------------------------------------------------------
onRecordCreate('settlements', (e) => {
	const record = e.record;
	const authId = e.httpContext.auth && e.httpContext.auth.id;
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

	if (callerMember.get('role') === 'viewer') {
		throw new ForbiddenError('Viewers cannot record settlements');
	}

	// Caller must be either from_member or to_member.
	if (callerMember.id !== fromMember && callerMember.id !== toMember) {
		throw new ForbiddenError('You can only record settlements you are a party to');
	}

	record.set('created_by', callerMember.id);

	e.next();
});

// ---------------------------------------------------------------------------
// Before delete: only creator or trip owner/co_owner.
// ---------------------------------------------------------------------------
onRecordDelete('settlements', (e) => {
	const record = e.record;
	const authId = e.httpContext.auth && e.httpContext.auth.id;
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

	const callerRole = callerMember.get('role');
	const isCreator = callerMember.id === createdById;
	const isPrivileged = callerRole === 'owner' || callerRole === 'co_owner';

	if (!isCreator && !isPrivileged) {
		throw new ForbiddenError('Only the settlement creator or trip owner/co-owner can delete settlements');
	}

	e.next();
});
