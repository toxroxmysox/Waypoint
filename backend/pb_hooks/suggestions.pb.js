/// <reference path="../pb_data/types.d.ts" />
// M2d: suggestions — create, list, review.
//
// PB 0.27: each callback runs in an isolated sandbox.
// Helpers are inlined into every callback that needs them.

// ---------------------------------------------------------------------------
// POST /api/suggestions/create
// Body: { trip_id, payload }  (payload = proposed item fields JSON)
// Auth: any trip member. Auto-approval logic per SPEC §4.
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/suggestions/create', (e) => {
	const authRecord = e.auth;
	if (!authRecord) {
		throw new UnauthorizedError('Authentication required');
	}

	const info = e.requestInfo();
	const tripId = (info.body && info.body['trip_id']) || '';
	const payload = (info.body && info.body['payload']) || null;

	if (!tripId) throw new BadRequestError('trip_id is required');
	if (!payload || typeof payload !== 'object') throw new BadRequestError('payload is required and must be an object');
	if (!payload.title || !payload.title.trim()) throw new BadRequestError('payload.title is required');

	// Resolve caller's membership.
	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid}',
			{ tripId: tripId, uid: authRecord.id }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	const callerRole = callerMember.get('role');
	if (callerRole === 'viewer') {
		throw new ForbiddenError('Viewers cannot submit suggestions');
	}

	// Load trip for auto_approve setting.
	let trip;
	try {
		trip = e.app.findRecordById('trips', tripId);
	} catch (_) {
		throw new NotFoundError('Trip not found');
	}

	const autoApproveFlag = trip.get('auto_approve_suggestions') === true;

	// Determine if this suggestion should be auto-approved.
	const isPrivileged = callerRole === 'owner' || callerRole === 'co_owner';
	const autoApprove = isPrivileged || (callerRole === 'traveler' && autoApproveFlag);

	const suggestionsCol = e.app.findCollectionByNameOrId('suggestions');
	const suggestion = new Record(suggestionsCol);
	suggestion.set('trip', tripId);
	suggestion.set('author', callerMember.id);
	suggestion.set('target_type', 'new_item');
	suggestion.set('payload', payload);
	suggestion.set('status', autoApprove ? 'approved' : 'pending');

	if (autoApprove) {
		suggestion.set('reviewed_by', callerMember.id);
		const now = new Date().toISOString().replace('T', ' ').replace('Z', '') + 'Z';
		suggestion.set('reviewed_at', now);
	}

	try {
		e.app.save(suggestion);
	} catch (err) {
		throw new BadRequestError('Failed to save suggestion: ' + err);
	}

	// If auto-approved, create the item immediately.
	let itemId = '';
	if (autoApprove) {
		itemId = createItemFromPayload(e.app, trip, payload, callerMember.id, tripId);
	}

	return e.json(200, {
		ok: true,
		suggestion_id: suggestion.id,
		status: suggestion.get('status'),
		item_id: itemId
	});
});

// ---------------------------------------------------------------------------
// GET /api/suggestions/list
// Query: ?trip_id=<id>&status=pending|approved|rejected (status optional)
// Auth: owner/co_owner sees all; traveler sees own pending.
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/suggestions/list', (e) => {
	const authRecord = e.auth;
	if (!authRecord) {
		throw new UnauthorizedError('Authentication required');
	}

	const tripId = e.request.url.searchParams.get('trip_id') || '';
	const statusFilter = e.request.url.searchParams.get('status') || '';

	if (!tripId) throw new BadRequestError('trip_id is required');

	// Resolve caller's membership.
	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid}',
			{ tripId: tripId, uid: authRecord.id }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	const callerRole = callerMember.get('role');
	const isPrivileged = callerRole === 'owner' || callerRole === 'co_owner';

	// Build filter.
	let filter = 'trip = {:tripId} && target_type = "new_item"';
	const filterParams = { tripId: tripId };
	if (!isPrivileged) {
		// Travelers only see their own suggestions.
		filter += ' && author = {:authorId}';
		filterParams['authorId'] = callerMember.id;
	}
	if (statusFilter) {
		filter += ' && status = {:status}';
		filterParams['status'] = statusFilter;
	}

	let records;
	try {
		records = e.app.findRecordsByFilter('suggestions', filter, '-created', 0, 0, filterParams);
	} catch (_) {
		records = [];
	}

	// Expand author and reviewed_by display names.
	const items = records.map((r) => {
		let authorName = '';
		let authorRole = '';
		try {
			const authorMember = e.app.findRecordById('trip_members', r.get('author'));
			authorName = authorMember.get('display_name') || authorMember.get('placeholder_name') || '';
			authorRole = authorMember.get('role');
		} catch (_) {}

		return {
			id: r.id,
			trip: r.get('trip'),
			author_id: r.get('author'),
			author_name: authorName,
			author_role: authorRole,
			target_type: r.get('target_type'),
			payload: r.get('payload'),
			status: r.get('status'),
			reviewed_at: r.get('reviewed_at') || '',
			created: r.get('created')
		};
	});

	return e.json(200, { items: items });
});

// ---------------------------------------------------------------------------
// POST /api/suggestions/review
// Body: { suggestion_id, action: 'approve' | 'reject', payload? }
// Auth: owner/co_owner only.
// If action='approve', creates the item (with optional modified payload).
// If action='reject', marks rejected.
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/suggestions/review', (e) => {
	const authRecord = e.auth;
	if (!authRecord) {
		throw new UnauthorizedError('Authentication required');
	}

	const info = e.requestInfo();
	const suggestionId = (info.body && info.body['suggestion_id']) || '';
	const action = (info.body && info.body['action']) || '';
	const modifiedPayload = (info.body && info.body['payload']) || null;

	if (!suggestionId) throw new BadRequestError('suggestion_id is required');
	if (action !== 'approve' && action !== 'reject') {
		throw new BadRequestError('action must be "approve" or "reject"');
	}

	// Load suggestion.
	let suggestion;
	try {
		suggestion = e.app.findRecordById('suggestions', suggestionId);
	} catch (_) {
		throw new NotFoundError('Suggestion not found');
	}

	if (suggestion.get('status') !== 'pending') {
		throw new BadRequestError('Only pending suggestions can be reviewed');
	}

	const tripId = suggestion.get('trip');

	// Verify caller is owner/co_owner.
	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid}',
			{ tripId: tripId, uid: authRecord.id }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	const callerRole = callerMember.get('role');
	if (callerRole !== 'owner' && callerRole !== 'co_owner') {
		throw new ForbiddenError('Only owners and co-owners can review suggestions');
	}

	const now = new Date().toISOString().replace('T', ' ').replace('Z', '') + 'Z';
	suggestion.set('status', action === 'approve' ? 'approved' : 'rejected');
	suggestion.set('reviewed_by', callerMember.id);
	suggestion.set('reviewed_at', now);

	try {
		e.app.save(suggestion);
	} catch (err) {
		throw new BadRequestError('Failed to update suggestion: ' + err);
	}

	let itemId = '';
	if (action === 'approve') {
		let trip;
		try {
			trip = e.app.findRecordById('trips', tripId);
		} catch (_) {
			throw new NotFoundError('Trip not found');
		}
		const payload = modifiedPayload || suggestion.get('payload');
		itemId = createItemFromPayload(e.app, trip, payload, callerMember.id, tripId);
	}

	return e.json(200, { ok: true, status: suggestion.get('status'), item_id: itemId });
});

// ---------------------------------------------------------------------------
// Shared helper: create an item record from a suggestion payload.
// Called by both create (auto-approve) and review (approve).
// Defined at module scope — visible to all routerAdd callbacks in this file.
// ---------------------------------------------------------------------------
function createItemFromPayload(app, trip, payload, reviewerMemberId, tripId) {
	const itemsCol = app.findCollectionByNameOrId('items');
	const item = new Record(itemsCol);

	item.set('trip', tripId);
	item.set('phase', payload.phase || '');
	item.set('day', payload.day || '');
	item.set('slot', payload.slot || 'anytime');
	item.set('type', payload.type || 'activity');
	item.set('subtype', payload.subtype || '');
	item.set('title', payload.title || '');
	item.set('description', payload.description || '');
	item.set('location_name', payload.location_name || '');
	item.set('location_address', payload.location_address || '');
	item.set('start_time', payload.start_time || '');
	item.set('end_time', payload.end_time || '');
	item.set('booked', payload.booked === true);
	item.set('reservation_url', payload.reservation_url || '');
	item.set('free_cancellation', payload.free_cancellation === true);
	item.set('cost_estimate_usd', Number(payload.cost_estimate_usd) || 0);
	item.set('cost_actual_usd', Number(payload.cost_actual_usd) || 0);
	item.set('assigned_to', Array.isArray(payload.assigned_to) ? payload.assigned_to : []);
	item.set('confirmation_codes', Array.isArray(payload.confirmation_codes) ? payload.confirmation_codes : []);
	item.set('rank', 0);
	item.set('parking_lot_scope', payload.day ? 'none' : 'trip');
	item.set('created_by', reviewerMemberId);
	item.set('status', 'planned');

	try {
		app.save(item);
	} catch (err) {
		throw new BadRequestError('Failed to create item from suggestion: ' + err);
	}

	return item.id;
}
