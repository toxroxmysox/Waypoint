/// <reference path="../pb_data/types.d.ts" />
// Documents S1 (#70) — documents collection hooks.
//
// PB rules gate membership; these hooks enforce the role-specific logic the
// rules can't express cleanly (mirrors expenses.pb.js):
//   - create: viewers cannot upload; uploaded_by is auto-set to the caller.
//   - delete: only the uploader OR a trip owner/co_owner.
//
// Hooks run in isolated sandboxes — every helper is inlined into the callback.

// ---------------------------------------------------------------------------
// Before create: block viewers, pin uploaded_by to the caller, sanity-check the
// optional item relation belongs to the same trip.
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
	const record = e.record;
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const tripId = record.get('trip');
	if (!tripId) throw new BadRequestError('trip is required');

	// Resolve caller membership for this trip.
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

	// Viewers are read-only (PRD — viewers view + download, never upload).
	if (callerMember.get('role') === 'viewer') {
		throw new ForbiddenError('Viewers cannot upload documents');
	}

	// An item-scoped document must point at an item in the same trip.
	const itemId = record.get('item');
	if (itemId) {
		let item;
		try {
			item = e.app.findRecordById('items', itemId);
		} catch (_) {
			throw new BadRequestError('Linked item not found');
		}
		if (item.get('trip') !== tripId) {
			throw new BadRequestError('Linked item belongs to a different trip');
		}
	}

	// Pin uploaded_by to the caller regardless of what the client sent.
	record.set('uploaded_by', callerMember.id);

	e.next();
}, 'documents');

// ---------------------------------------------------------------------------
// Before delete: only the uploader or a trip owner/co_owner.
// ---------------------------------------------------------------------------
onRecordDeleteRequest((e) => {
	const record = e.record;
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const tripId = record.get('trip');
	const uploadedById = record.get('uploaded_by');

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
	const isUploader = callerMember.id === uploadedById;
	const isPrivileged = callerRole === 'owner' || callerRole === 'co_owner';

	if (!isUploader && !isPrivileged) {
		throw new ForbiddenError('Only the uploader or a trip owner/co-owner can delete this document');
	}

	e.next();
}, 'documents');
