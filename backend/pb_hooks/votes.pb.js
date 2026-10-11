/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) {
		throw new BadRequestError('Not authenticated.');
	}

	const tripId = e.record.get('trip');
	const memberId = e.record.get('member');

	// Verify the member belongs to the authenticated user
	let membership;
	try {
		membership = e.app.findRecordById('trip_members', memberId);
	} catch (_) {
		throw new BadRequestError('Invalid member.');
	}

	if (membership.get('user') !== authId) {
		throw new ForbiddenError('You can only vote as yourself.');
	}

	if (membership.get('trip') !== tripId) {
		throw new BadRequestError('Member does not belong to this trip.');
	}

	e.next();
}, 'votes');

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
	const item = r.getString('item');
	if (item && (changed('item') || changed('trip')) && !sameTrip('items', item)) {
		throw new BadRequestError("That item isn't on this trip.");
	}
	e.next();
}, 'votes');
