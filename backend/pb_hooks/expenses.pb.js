/// <reference path="../pb_data/types.d.ts" />
// M3b: expense validation hooks.
// - Before create/update: validate split_data matches split_mode and sums to amount_usd.
// - Before delete: only the creator (created_by) or trip owner/co_owner can delete.

// ---------------------------------------------------------------------------
// Before create: validate split_data, set created_by to caller's membership.
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
	const record = e.record;
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const tripId = record.get('trip');
	if (!tripId) throw new BadRequestError('trip is required');

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

	// Viewers cannot create expenses.
	if (callerMember.get('role') === 'viewer') {
		throw new ForbiddenError('Viewers cannot create expenses');
	}

	// Auto-set created_by to caller.
	record.set('created_by', callerMember.id);

	// If paid_by is not set, default to caller.
	if (!record.get('paid_by')) {
		record.set('paid_by', callerMember.id);
	}

	// Validate split_data.
	const amountUsd = Number(record.get('amount_usd'));
	const splitMode = record.get('split_mode');
	let splitData = record.get('split_data');

	// PB JSON fields may come as byte array in hooks.
	if (Array.isArray(splitData) && splitData.length > 0 && typeof splitData[0] === 'number') {
		try { splitData = JSON.parse(String.fromCharCode.apply(null, splitData)); } catch (_) { splitData = {}; }
	} else if (typeof splitData === 'string') {
		try { splitData = JSON.parse(splitData); } catch (_) { splitData = {}; }
	}

	if (splitMode === 'equal') {
		if (!splitData || !Array.isArray(splitData.members) || splitData.members.length === 0) {
			throw new BadRequestError('split_data.members must be a non-empty array for equal split');
		}
	} else if (splitMode === 'by_amount') {
		if (!splitData || !splitData.amounts || typeof splitData.amounts !== 'object') {
			throw new BadRequestError('split_data.amounts is required for by_amount split');
		}
		const keys = Object.keys(splitData.amounts);
		if (keys.length === 0) {
			throw new BadRequestError('split_data.amounts must have at least one entry');
		}
		let sum = 0;
		for (let i = 0; i < keys.length; i++) {
			sum += Number(splitData.amounts[keys[i]]) || 0;
		}
		// Allow 1 cent tolerance for rounding.
		if (Math.abs(sum - amountUsd) > 0.01) {
			throw new BadRequestError('split_data amounts (' + sum.toFixed(2) + ') must sum to expense amount (' + amountUsd.toFixed(2) + ')');
		}
	}

	e.next();
}, 'expenses');

// ---------------------------------------------------------------------------
// Before update: re-validate split_data.
// ---------------------------------------------------------------------------
onRecordUpdateRequest((e) => {
	const record = e.record;
	const amountUsd = Number(record.get('amount_usd'));
	const splitMode = record.get('split_mode');
	let splitData = record.get('split_data');

	if (Array.isArray(splitData) && splitData.length > 0 && typeof splitData[0] === 'number') {
		try { splitData = JSON.parse(String.fromCharCode.apply(null, splitData)); } catch (_) { splitData = {}; }
	} else if (typeof splitData === 'string') {
		try { splitData = JSON.parse(splitData); } catch (_) { splitData = {}; }
	}

	if (splitMode === 'equal') {
		if (!splitData || !Array.isArray(splitData.members) || splitData.members.length === 0) {
			throw new BadRequestError('split_data.members must be a non-empty array for equal split');
		}
	} else if (splitMode === 'by_amount') {
		if (!splitData || !splitData.amounts || typeof splitData.amounts !== 'object') {
			throw new BadRequestError('split_data.amounts is required for by_amount split');
		}
		const keys = Object.keys(splitData.amounts);
		if (keys.length === 0) {
			throw new BadRequestError('split_data.amounts must have at least one entry');
		}
		let sum = 0;
		for (let i = 0; i < keys.length; i++) {
			sum += Number(splitData.amounts[keys[i]]) || 0;
		}
		if (Math.abs(sum - amountUsd) > 0.01) {
			throw new BadRequestError('split_data amounts (' + sum.toFixed(2) + ') must sum to expense amount (' + amountUsd.toFixed(2) + ')');
		}
	}

	e.next();
}, 'expenses');

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

	const callerRole = callerMember.get('role');
	const isCreator = callerMember.id === createdById;
	const isPrivileged = callerRole === 'owner' || callerRole === 'co_owner';

	if (!isCreator && !isPrivileged) {
		throw new ForbiddenError('Only the expense creator or trip owner/co-owner can delete expenses');
	}

	e.next();
}, 'expenses');
