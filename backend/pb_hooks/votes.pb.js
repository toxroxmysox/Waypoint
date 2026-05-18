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
