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
	if (callerMember.getString('role') === 'viewer') {
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
		try {
			splitData = JSON.parse(String.fromCharCode.apply(null, splitData));
		} catch (_) {
			splitData = {};
		}
	} else if (typeof splitData === 'string') {
		try {
			splitData = JSON.parse(splitData);
		} catch (_) {
			splitData = {};
		}
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
			throw new BadRequestError(
				'split_data amounts (' +
					sum.toFixed(2) +
					') must sum to expense amount (' +
					amountUsd.toFixed(2) +
					')'
			);
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
		try {
			splitData = JSON.parse(String.fromCharCode.apply(null, splitData));
		} catch (_) {
			splitData = {};
		}
	} else if (typeof splitData === 'string') {
		try {
			splitData = JSON.parse(splitData);
		} catch (_) {
			splitData = {};
		}
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
			throw new BadRequestError(
				'split_data amounts (' +
					sum.toFixed(2) +
					') must sum to expense amount (' +
					amountUsd.toFixed(2) +
					')'
			);
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

	const callerRole = callerMember.getString('role');
	const isCreator = callerMember.id === createdById;
	const isPrivileged = callerRole === 'owner' || callerRole === 'co_owner';

	if (!isCreator && !isPrivileged) {
		throw new ForbiddenError('Only the expense creator or trip owner/co-owner can delete expenses');
	}

	e.next();
}, 'expenses');

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
	const M = "That member isn't on this trip.";
	// #506 — viewers aren't on the trip for money: never a payer or in a split.
	const V = "Viewers can't pay for or share an expense.";
	const isViewer = (id) => {
		try {
			return e.app.findRecordById('trip_members', id).getString('role') === 'viewer';
		} catch (_) {
			return false;
		}
	};
	const paidBy = r.getString('paid_by');
	if (paidBy && (changed('paid_by') || changed('trip')) && !sameTrip('trip_members', paidBy))
		throw new BadRequestError(M);
	if (paidBy && (changed('paid_by') || changed('trip')) && isViewer(paidBy))
		throw new BadRequestError(V);
	const linked = r.getString('linked_item');
	if (linked && (changed('linked_item') || changed('trip')) && !sameTrip('items', linked)) {
		throw new BadRequestError("That item isn't on this trip.");
	}
	if (changed('split_data') || changed('split_mode') || changed('trip')) {
		let splitData = r.get('split_data');
		// PB JSON fields read back as a byte array (or string) in hooks.
		if (splitData && typeof splitData === 'object' && typeof splitData.length === 'number') {
			try {
				splitData = JSON.parse(String.fromCharCode.apply(null, splitData));
			} catch (_) {
				splitData = null;
			}
		} else if (typeof splitData === 'string') {
			try {
				splitData = JSON.parse(splitData);
			} catch (_) {
				splitData = null;
			}
		}
		const ids = [];
		if (splitData && Array.isArray(splitData.members)) {
			for (let i = 0; i < splitData.members.length; i++) ids.push('' + splitData.members[i]);
		}
		if (splitData && splitData.amounts && typeof splitData.amounts === 'object') {
			const keys = Object.keys(splitData.amounts);
			for (let i = 0; i < keys.length; i++) ids.push('' + keys[i]);
		}
		for (let i = 0; i < ids.length; i++) {
			if (ids[i] && !sameTrip('trip_members', ids[i])) throw new BadRequestError(M);
			if (ids[i] && isViewer(ids[i])) throw new BadRequestError(V);
		}
	}
	e.next();
}, 'expenses');
