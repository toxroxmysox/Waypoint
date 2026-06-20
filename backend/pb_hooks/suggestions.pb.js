/// <reference path="../pb_data/types.d.ts" />
// M2d: suggestions — create, list, review.
//
// PB 0.27: each routerAdd callback runs in an isolated sandbox.
// The createItemFromPayload helper CANNOT be shared at module scope —
// it is inlined into every callback that needs it.

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

	e.app.save(suggestion);

	// If auto-approved, create the item immediately.
	// Inlined here because module-scope helpers are not visible in PB 0.27 sandbox.
	let itemId = '';
	if (autoApprove) {
		// #196 — never let an approved item land phase-less. An unplanned item
		// (no day) with phase='' renders on no surface (every parking view is
		// phase-scoped). Fall back to the trip's first phase (by order) when the
		// payload omits one. Inlined — module-scope helpers are invisible in the
		// PB 0.27 sandbox.
		let resolvedPhase = payload.phase || '';
		if (!resolvedPhase && !payload.day) {
			try {
				const firstPhase = e.app.findRecordsByFilter(
					'phases',
					'trip = {:tripId}',
					'+order',
					1,
					0,
					{ tripId: tripId }
				);
				if (firstPhase && firstPhase.length > 0) resolvedPhase = firstPhase[0].id;
			} catch (_) {
				resolvedPhase = '';
			}
		}
		const itemsCol = e.app.findCollectionByNameOrId('items');
		const item = new Record(itemsCol);
		item.set('trip', tripId);
		item.set('phase', resolvedPhase);
		item.set('day', payload.day || '');
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
		item.set('sort_order', 0);
		item.set('created_by', callerMember.id);
		item.set('status', payload.day ? 'planned' : 'unplanned');
		e.app.save(item);
		itemId = item.id;
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
// Auth: owner/co_owner sees all new_item suggestions; traveler sees own.
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/suggestions/list', (e) => {
	const authRecord = e.auth;
	if (!authRecord) {
		throw new UnauthorizedError('Authentication required');
	}

	// Use requestInfo().query — e.request.url is not valid in PB 0.27 sandbox.
	// Values may be a string or string array depending on PB version; normalize safely.
	const query = e.requestInfo().query || {};
	const tripId = Array.isArray(query['trip_id']) ? query['trip_id'][0] : (query['trip_id'] || '');
	const statusFilter = Array.isArray(query['status']) ? query['status'][0] : (query['status'] || '');

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
		filter += ' && author = {:authorId}';
		filterParams['authorId'] = callerMember.id;
	}
	if (statusFilter) {
		filter += ' && status = {:status}';
		filterParams['status'] = statusFilter;
	}

	let records;
	try {
		records = e.app.findRecordsByFilter('suggestions', filter, '-id', 0, 0, filterParams);
	} catch (_) {
		records = [];
	}

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

	// #250 — reject requires a one-line note (no one-tap reject). Stored on the
	// suggestion (migration 0051 review_note) and carried in the rejection notice.
	const reviewNote = (info.body && info.body['review_note']) ? String(info.body['review_note']).trim() : '';
	if (action === 'reject' && !reviewNote) {
		throw new BadRequestError('A note is required to reject a suggestion');
	}

	// The suggestion's AUTHOR (a trip_members.id) — the attribution target on
	// approve (#249) and the sole recipient of the approve/reject notice. NEVER
	// the reviewer: items.created_by is a trip_members.id (migration 0006), and an
	// approved idea must read as the contributor's, not the owner's.
	const authorMemberId = suggestion.get('author');

	const now = new Date().toISOString().replace('T', ' ').replace('Z', '') + 'Z';
	suggestion.set('status', action === 'approve' ? 'approved' : 'rejected');
	suggestion.set('reviewed_by', callerMember.id);
	suggestion.set('reviewed_at', now);
	if (action === 'reject') suggestion.set('review_note', reviewNote);
	e.app.save(suggestion);

	// Trip slug — used for both the notification deep link and (approve) the
	// item's landing spot.
	let tripSlug = '';
	try {
		const tripRec = e.app.findRecordById('trips', tripId);
		tripSlug = tripRec.get('slug') || '';
	} catch (_) {}

	// If approving, create the item.
	// Inlined here because module-scope helpers are not visible in PB 0.27 sandbox.
	let itemId = '';
	let landingPhaseId = '';
	let landingDayId = '';
	let approvedTitle = '';
	if (action === 'approve') {
		let trip;
		try {
			trip = e.app.findRecordById('trips', tripId);
		} catch (_) {
			throw new NotFoundError('Trip not found');
		}
		// PB JSON fields may come back as a string — parse defensively.
		let rawPayload = suggestion.get('payload');
		// PB 0.27 JSON fields return as a byte array, string, or object depending on context — normalize all cases.
		if (Array.isArray(rawPayload)) {
			try { rawPayload = JSON.parse(String.fromCharCode.apply(null, rawPayload)); } catch (_) { rawPayload = {}; }
		} else if (typeof rawPayload === 'string') {
			try { rawPayload = JSON.parse(rawPayload); } catch (_) { rawPayload = {}; }
		}
		const payload = modifiedPayload || rawPayload;

		// #196 — never approve an item into phase-less limbo. When the (possibly
		// owner-edited) payload omits a phase and there's no day, fall back to the
		// trip's first phase (by order) so the unplanned item is renderable in a
		// parking lot. Inlined — sandbox can't see module-scope helpers.
		let resolvedPhase = payload.phase || '';
		if (!resolvedPhase && !payload.day) {
			try {
				const firstPhase = e.app.findRecordsByFilter(
					'phases',
					'trip = {:tripId}',
					'+order',
					1,
					0,
					{ tripId: tripId }
				);
				if (firstPhase && firstPhase.length > 0) resolvedPhase = firstPhase[0].id;
			} catch (_) {
				resolvedPhase = '';
			}
		}

		const itemsCol = e.app.findCollectionByNameOrId('items');
		const item = new Record(itemsCol);
		item.set('trip', tripId);
		item.set('phase', resolvedPhase);
		item.set('day', payload.day || '');
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
		item.set('sort_order', 0);
		// #249 LETHAL ATTRIBUTION SCAR — created_by is a trip_members.id (migration
		// 0006), and approval attributes the item to the SUGGESTION'S AUTHOR, never
		// the reviewing owner. Fall back to the reviewer only if the author somehow
		// went missing (data integrity), so created_by is never blank/wrong.
		item.set('created_by', authorMemberId || callerMember.id);
		item.set('status', payload.day ? 'planned' : 'unplanned');
		e.app.save(item);
		itemId = item.id;
		landingPhaseId = resolvedPhase;
		landingDayId = payload.day || '';
		approvedTitle = payload.title || '';

		// #249 — migrate the ghost's votes onto the new item: each suggestion_vote
		// (same member + value) becomes a votes row on the real item. The suggestion
		// + its suggestion_votes freeze as history (not deleted). Inlined per sandbox.
		try {
			const ghostVotes = e.app.findRecordsByFilter(
				'suggestion_votes',
				'suggestion = {:sid}',
				'-id', 0, 0,
				{ sid: suggestionId }
			);
			const votesCol = e.app.findCollectionByNameOrId('votes');
			for (const gv of ghostVotes) {
				try {
					const vote = new Record(votesCol);
					vote.set('trip', tripId);
					vote.set('item', itemId);
					vote.set('member', gv.get('member'));
					vote.set('value', gv.get('value'));
					e.app.save(vote);
				} catch (_) {}
			}
		} catch (_) {}
	}

	// #249 / #250 — notify the AUTHOR (and only the author) of the decision. No
	// group noise: an approval/rejection is between the reviewer and the
	// contributor. Inlined — notifications.pb.js only fires on suggestion CREATE,
	// and a status-change isn't a create, so the trigger lives here.
	try {
		let payloadTitle = approvedTitle;
		if (!payloadTitle) {
			let rp = suggestion.get('payload');
			if (Array.isArray(rp)) {
				try { rp = JSON.parse(String.fromCharCode.apply(null, rp)); } catch (_) { rp = {}; }
			} else if (typeof rp === 'string') {
				try { rp = JSON.parse(rp); } catch (_) { rp = {}; }
			}
			if (rp && rp.title) payloadTitle = rp.title;
		}

		let link = '';
		let body = '';
		if (action === 'approve') {
			// Link to where it landed: its day (if scheduled) else the phase parking lot.
			if (tripSlug && landingDayId) link = `/trips/${tripSlug}/days/${landingDayId}`;
			else if (tripSlug && landingPhaseId) link = `/trips/${tripSlug}/phases/${landingPhaseId}`;
			else if (tripSlug) link = `/trips/${tripSlug}`;
			body = payloadTitle ? `Your idea “${payloadTitle}” was approved` : 'Your idea was approved';
		} else {
			// Reject — link to the phase for context (where the idea was proposed).
			let rejPhase = '';
			let rp = suggestion.get('payload');
			if (Array.isArray(rp)) {
				try { rp = JSON.parse(String.fromCharCode.apply(null, rp)); } catch (_) { rp = {}; }
			} else if (typeof rp === 'string') {
				try { rp = JSON.parse(rp); } catch (_) { rp = {}; }
			}
			if (rp && rp.phase) rejPhase = rp.phase;
			if (tripSlug && rejPhase) link = `/trips/${tripSlug}/phases/${rejPhase}`;
			else if (tripSlug) link = `/trips/${tripSlug}`;
			body = payloadTitle
				? `Your idea “${payloadTitle}” wasn’t approved: ${reviewNote}`
				: `Your idea wasn’t approved: ${reviewNote}`;
		}

		if (authorMemberId) {
			const notifCol = e.app.findCollectionByNameOrId('notifications');
			const notif = new Record(notifCol);
			notif.set('trip', tripId);
			notif.set('recipient', authorMemberId);
			notif.set('type', action === 'approve' ? 'suggestion_approved' : 'suggestion_rejected');
			notif.set('body', body);
			notif.set('link', link);
			e.app.save(notif);
		}
	} catch (_) {}

	return e.json(200, { ok: true, status: suggestion.get('status'), item_id: itemId });
});

// ---------------------------------------------------------------------------
// POST /api/comments/add
// Body: { item_id, comment_text }
// Auth: any trip member including viewer (SPEC §3: all roles can comment).
// Always auto-approves immediately.
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/comments/add', (e) => {
	const authRecord = e.auth;
	if (!authRecord) {
		throw new UnauthorizedError('Authentication required');
	}

	const info = e.requestInfo();
	const itemId = (info.body && info.body['item_id']) || '';
	const commentText = (info.body && info.body['comment_text']) || '';

	if (!itemId) throw new BadRequestError('item_id is required');
	if (!commentText.trim()) throw new BadRequestError('comment_text is required');
	if (commentText.length > 5000) throw new BadRequestError('comment_text exceeds 5000 characters');

	// Load the item to get the trip.
	let item;
	try {
		item = e.app.findRecordById('items', itemId);
	} catch (_) {
		throw new NotFoundError('Item not found');
	}

	const tripId = item.get('trip');

	// Resolve caller's membership — all roles (including viewer) can comment.
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

	// Comments always auto-approve.
	const now = new Date().toISOString().replace('T', ' ').replace('Z', '') + 'Z';
	const suggestionsCol = e.app.findCollectionByNameOrId('suggestions');
	const comment = new Record(suggestionsCol);
	comment.set('trip', tripId);
	comment.set('author', callerMember.id);
	comment.set('target_type', 'comment');
	comment.set('target_item', itemId);
	comment.set('comment_text', commentText.trim());
	comment.set('status', 'approved');
	comment.set('reviewed_by', callerMember.id);
	comment.set('reviewed_at', now);
	e.app.save(comment);

	return e.json(200, { ok: true, comment_id: comment.id });
});
