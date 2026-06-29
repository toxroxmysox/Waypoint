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

	// --- file-XOR-code structural validation (#268 / ADR-0016) ---
	// PB's schema can't express "exactly one of file / code"; enforce it here.
	// `kind` defaults to 'file' (a non-required select otherwise stores "").
	let kind = record.getString('kind');
	if (kind === '') {
		kind = 'file';
		record.set('kind', 'file');
	}
	if (kind === 'code') {
		// A code Document carries a non-empty code_value instead of a file.
		if (record.getString('code_value') === '') {
			throw new BadRequestError('A code document requires a non-empty code_value');
		}
	} else {
		// kind === 'file': must carry a file artifact. At before-create time a
		// freshly UPLOADED file is a PENDING-upload object (has .name/.size), so
		// getString('file') is still "" — checking only the string yields a false
		// negative on the real upload path. A file is present if EITHER the stored
		// filename is set (getString) OR get() returns a non-empty pending upload
		// (object with a .name, or a non-empty array of them).
		const fileStr = record.getString('file');
		let hasFile = fileStr !== '';
		if (!hasFile) {
			const raw = record.get('file');
			if (raw) {
				if (Array.isArray(raw)) {
					hasFile = raw.length > 0;
				} else if (typeof raw === 'object') {
					// pending upload object — has a generated .name
					hasFile = !!(raw.name || raw.originalName);
				}
			}
		}
		if (!hasFile) {
			throw new BadRequestError('A file document requires a file');
		}
	}

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
