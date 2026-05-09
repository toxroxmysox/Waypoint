/// <reference path="../pb_data/types.d.ts" />
// M2f: notification triggers.
//
// Fires on:
//   suggestion_added  — pending new_item → owners + co_owners
//   comment_added     — comment → all trip members minus author
//   member_joined     — invite accepted → owners + co_owners + the joiner
//
// PB 0.27 sandbox isolation: helpers must be inlined per callback.

// ---------------------------------------------------------------------------
// Helper: create one notification record (must be inlined — not callable across callbacks).
// Called inline below; the function is defined at module scope only as documentation.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Trigger: suggestion created (pending new_item)
// ---------------------------------------------------------------------------
onRecordAfterCreateSuccess((e) => {
	if (e.record.get('target_type') !== 'new_item') return;
	if (e.record.get('status') !== 'pending') return;

	const tripId = e.record.get('trip');
	const authorMemberId = e.record.get('author');

	// Load author's display name for the body.
	let authorName = 'Someone';
	try {
		const authorMember = e.app.findRecordById('trip_members', authorMemberId);
		authorName = authorMember.get('display_name') || authorMember.get('placeholder_name') || 'Someone';
	} catch (_) {}

	// Load the suggestion payload for a title hint.
	let payloadTitle = '';
	try {
		let rawPayload = e.record.get('payload');
		if (Array.isArray(rawPayload)) {
			try { rawPayload = JSON.parse(String.fromCharCode.apply(null, rawPayload)); } catch (_) {}
		} else if (typeof rawPayload === 'string') {
			try { rawPayload = JSON.parse(rawPayload); } catch (_) {}
		}
		if (rawPayload && rawPayload.title) payloadTitle = rawPayload.title;
	} catch (_) {}

	const body = payloadTitle
		? `${authorName} suggested: ${payloadTitle}`
		: `${authorName} submitted a new suggestion`;

	// Get trip slug for the link.
	let tripSlug = '';
	try {
		const trip = e.app.findRecordById('trips', tripId);
		tripSlug = trip.get('slug') || '';
	} catch (_) {}

	const link = tripSlug ? `/trips/${tripSlug}/inbox` : '';

	// Notify all owners + co_owners (excluding the author, who already knows).
	let recipients;
	try {
		recipients = e.app.findRecordsByFilter(
			'trip_members',
			'trip = {:tripId} && (role = "owner" || role = "co_owner") && id != {:authorId}',
			'-id', 0, 0,
			{ tripId: tripId, authorId: authorMemberId }
		);
	} catch (_) {
		return;
	}

	const notifCol = e.app.findCollectionByNameOrId('notifications');
	for (const member of recipients) {
		try {
			const notif = new Record(notifCol);
			notif.set('trip', tripId);
			notif.set('recipient', member.id);
			notif.set('type', 'suggestion_added');
			notif.set('body', body);
			notif.set('link', link);
			e.app.save(notif);
		} catch (_) {}
	}
}, 'suggestions');

// ---------------------------------------------------------------------------
// Trigger: comment created
// ---------------------------------------------------------------------------
onRecordAfterCreateSuccess((e) => {
	if (e.record.get('target_type') !== 'comment') return;

	const tripId = e.record.get('trip');
	const authorMemberId = e.record.get('author');
	const itemId = e.record.get('target_item');

	let authorName = 'Someone';
	try {
		const authorMember = e.app.findRecordById('trip_members', authorMemberId);
		authorName = authorMember.get('display_name') || authorMember.get('placeholder_name') || 'Someone';
	} catch (_) {}

	// Get item title + trip slug for the link.
	let itemTitle = '';
	let tripSlug = '';
	try {
		const item = e.app.findRecordById('items', itemId);
		itemTitle = item.get('title') || '';
	} catch (_) {}
	try {
		const trip = e.app.findRecordById('trips', tripId);
		tripSlug = trip.get('slug') || '';
	} catch (_) {}

	const body = itemTitle
		? `${authorName} commented on: ${itemTitle}`
		: `${authorName} left a comment`;
	const link = tripSlug && itemId ? `/trips/${tripSlug}/items/${itemId}` : '';

	// Notify all trip members except the author.
	let recipients;
	try {
		recipients = e.app.findRecordsByFilter(
			'trip_members',
			'trip = {:tripId} && id != {:authorId}',
			'-id', 0, 0,
			{ tripId: tripId, authorId: authorMemberId }
		);
	} catch (_) {
		return;
	}

	const notifCol = e.app.findCollectionByNameOrId('notifications');
	for (const member of recipients) {
		try {
			const notif = new Record(notifCol);
			notif.set('trip', tripId);
			notif.set('recipient', member.id);
			notif.set('type', 'comment_added');
			notif.set('body', body);
			notif.set('link', link);
			e.app.save(notif);
		} catch (_) {}
	}
}, 'suggestions');

// ---------------------------------------------------------------------------
// Trigger: member joined (pending_invite accepted → trip_member created with a real user)
// ---------------------------------------------------------------------------
onRecordAfterCreateSuccess((e) => {
	// Only fire for members with a real user (not placeholders).
	const userId = e.record.get('user');
	if (!userId) return;

	const tripId = e.record.get('trip');
	const newMemberId = e.record.id;
	const newMemberRole = e.record.get('role');

	let newMemberName = 'Someone';
	try {
		newMemberName = e.record.get('display_name') || e.record.get('placeholder_name') || 'Someone';
	} catch (_) {}

	let tripSlug = '';
	try {
		const trip = e.app.findRecordById('trips', tripId);
		tripSlug = trip.get('slug') || '';
	} catch (_) {}

	const body = `${newMemberName} joined the trip`;
	const link = tripSlug ? `/trips/${tripSlug}/members` : '';

	// Recipients: owners + co_owners + the joiner themselves.
	let recipients;
	try {
		recipients = e.app.findRecordsByFilter(
			'trip_members',
			'trip = {:tripId} && (role = "owner" || role = "co_owner" || id = {:newMemberId})',
			'-id', 0, 0,
			{ tripId: tripId, newMemberId: newMemberId }
		);
	} catch (_) {
		return;
	}

	const notifCol = e.app.findCollectionByNameOrId('notifications');
	for (const member of recipients) {
		try {
			const notif = new Record(notifCol);
			notif.set('trip', tripId);
			notif.set('recipient', member.id);
			notif.set('type', 'member_joined');
			notif.set('body', body);
			notif.set('link', link);
			e.app.save(notif);
		} catch (_) {}
	}
}, 'trip_members');

// ---------------------------------------------------------------------------
// GET /api/notifications/list
// Query: ?limit=20 (optional)
// Auth: any authenticated user — returns unread + recent read notifs for caller.
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/notifications/list', (e) => {
	const authRecord = e.auth;
	if (!authRecord) {
		throw new UnauthorizedError('Authentication required');
	}

	const query = e.requestInfo().query || {};
	const limitRaw = Array.isArray(query['limit']) ? query['limit'][0] : (query['limit'] || '20');
	const limit = Math.min(parseInt(limitRaw, 10) || 20, 100);

	// Find all trip_member records for this user.
	let memberIds;
	try {
		const members = e.app.findRecordsByFilter(
			'trip_members',
			'user = {:uid}',
			'-id', 0, 0,
			{ uid: authRecord.id }
		);
		memberIds = members.map((m) => m.id);
	} catch (_) {
		memberIds = [];
	}

	if (memberIds.length === 0) {
		return e.json(200, { items: [], unread: 0 });
	}

	// Build filter: recipient IN memberIds.
	// PB parameterized filter doesn't support IN lists natively — use string interpolation
	// (IDs are alphanumeric so safe here).
	const idList = memberIds.map((id) => `"${id}"`).join(',');
	const filter = `recipient ?= "${memberIds.join('" || recipient ?= "')}"`;

	// Simpler approach: OR chain of recipient conditions.
	let records = [];
	try {
		// Fetch per member and merge (limit small so this is fine).
		for (const memberId of memberIds) {
			try {
				const recs = e.app.findRecordsByFilter(
					'notifications',
					'recipient = {:mid}',
					'-id', 0, limit,
					{ mid: memberId }
				);
				records = records.concat(recs);
			} catch (_) {}
		}
		// Sort by id desc (newest first) and apply limit.
		records.sort((a, b) => (a.id < b.id ? 1 : -1));
		records = records.slice(0, limit);
	} catch (_) {
		records = [];
	}

	const unread = records.filter((r) => !r.get('read_at')).length;

	const items = records.map((r) => ({
		id: r.id,
		trip: r.get('trip'),
		type: r.get('type'),
		body: r.get('body'),
		link: r.get('link'),
		read_at: r.get('read_at') || null,
		created: r.get('created')
	}));

	return e.json(200, { items: items, unread: unread });
});

// ---------------------------------------------------------------------------
// POST /api/notifications/mark-read
// Body: { ids: string[] } or { all: true, trip_id?: string }
// Auth: any authenticated user — can only mark their own.
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/notifications/mark-read', (e) => {
	const authRecord = e.auth;
	if (!authRecord) {
		throw new UnauthorizedError('Authentication required');
	}

	const info = e.requestInfo();
	const ids = (info.body && Array.isArray(info.body['ids'])) ? info.body['ids'] : [];
	const markAll = !!(info.body && info.body['all']);

	const now = new Date().toISOString().replace('T', ' ').replace('Z', '') + 'Z';

	if (markAll) {
		// Find all unread notifs for this user's members.
		let members;
		try {
			members = e.app.findRecordsByFilter(
				'trip_members', 'user = {:uid}', '-id', 0, 0, { uid: authRecord.id }
			);
		} catch (_) { members = []; }

		for (const member of members) {
			try {
				const unread = e.app.findRecordsByFilter(
					'notifications',
					'recipient = {:mid} && read_at = ""',
					'-id', 0, 0,
					{ mid: member.id }
				);
				for (const notif of unread) {
					notif.set('read_at', now);
					e.app.save(notif);
				}
			} catch (_) {}
		}
	} else {
		for (const id of ids) {
			try {
				const notif = e.app.findRecordById('notifications', id);
				// Verify ownership via recipient.user.
				const recipient = e.app.findRecordById('trip_members', notif.get('recipient'));
				if (recipient.get('user') !== authRecord.id) continue;
				notif.set('read_at', now);
				e.app.save(notif);
			} catch (_) {}
		}
	}

	return e.json(200, { ok: true });
});
