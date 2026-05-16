/// <reference path="../pb_data/types.d.ts" />
// M3b: trip_budgets validation hooks.
// - Before create/update: only owner or co_owner can modify budgets.
// - Before create: validate categories JSON structure.

// ---------------------------------------------------------------------------
// Before create: enforce owner/co_owner + validate categories.
// ---------------------------------------------------------------------------
onRecordCreate('trip_budgets', (e) => {
	const record = e.record;
	const authId = e.httpContext.auth && e.httpContext.auth.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const tripId = record.get('trip');
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

	const callerRole = callerMember.get('role');
	if (callerRole !== 'owner' && callerRole !== 'co_owner') {
		throw new ForbiddenError('Only owners and co-owners can manage trip budgets');
	}

	// Validate categories structure.
	let categories = record.get('categories');
	if (Array.isArray(categories) && categories.length > 0 && typeof categories[0] === 'number') {
		try { categories = JSON.parse(String.fromCharCode.apply(null, categories)); } catch (_) { categories = []; }
	} else if (typeof categories === 'string') {
		try { categories = JSON.parse(categories); } catch (_) { categories = []; }
	}

	if (!Array.isArray(categories)) {
		throw new BadRequestError('categories must be an array');
	}

	const validCategories = ['lodging', 'transportation', 'food', 'activity', 'other'];
	for (let i = 0; i < categories.length; i++) {
		const cat = categories[i];
		if (!cat.category || validCategories.indexOf(cat.category) === -1) {
			throw new BadRequestError('Invalid category: ' + (cat.category || 'undefined'));
		}
		if (cat.mode !== 'per_day' && cat.mode !== 'total') {
			throw new BadRequestError('Category mode must be "per_day" or "total"');
		}
		if (typeof cat.total !== 'number' || cat.total < 0) {
			throw new BadRequestError('Category total must be a non-negative number');
		}
	}

	e.next();
});

// ---------------------------------------------------------------------------
// Before update: enforce owner/co_owner + validate categories.
// ---------------------------------------------------------------------------
onRecordUpdate('trip_budgets', (e) => {
	const record = e.record;
	const authId = e.httpContext.auth && e.httpContext.auth.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const tripId = record.get('trip');

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
	if (callerRole !== 'owner' && callerRole !== 'co_owner') {
		throw new ForbiddenError('Only owners and co-owners can manage trip budgets');
	}

	let categories = record.get('categories');
	if (Array.isArray(categories) && categories.length > 0 && typeof categories[0] === 'number') {
		try { categories = JSON.parse(String.fromCharCode.apply(null, categories)); } catch (_) { categories = []; }
	} else if (typeof categories === 'string') {
		try { categories = JSON.parse(categories); } catch (_) { categories = []; }
	}

	if (!Array.isArray(categories)) {
		throw new BadRequestError('categories must be an array');
	}

	const validCategories = ['lodging', 'transportation', 'food', 'activity', 'other'];
	for (let i = 0; i < categories.length; i++) {
		const cat = categories[i];
		if (!cat.category || validCategories.indexOf(cat.category) === -1) {
			throw new BadRequestError('Invalid category: ' + (cat.category || 'undefined'));
		}
		if (cat.mode !== 'per_day' && cat.mode !== 'total') {
			throw new BadRequestError('Category mode must be "per_day" or "total"');
		}
		if (typeof cat.total !== 'number' || cat.total < 0) {
			throw new BadRequestError('Category total must be a non-negative number');
		}
	}

	e.next();
});
