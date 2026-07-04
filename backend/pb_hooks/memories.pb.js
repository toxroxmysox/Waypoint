/// <reference path="../pb_data/types.d.ts" />
// #269 (ADR-0007) — memories collection hooks.
//
// PB rules gate membership + author-as-self + author-only edit/delete (see
// migration 0058). These hooks enforce what the rules can't express:
//   - create: "at least one of {photo, thought}"; day belongs to the same trip;
//             author is an ACTIVE member of the trip (removed_at = "");
//             author is auto-pinned to the caller's own membership.
//   - update: "at least one of {photo, thought}" must still hold AFTER the
//             patch (clearing both = the app deletes the record instead; a
//             direct clear-both PATCH is rejected as a backstop).
//
// Hooks run in isolated sandboxes — every helper is inlined into the callback.

// ---------------------------------------------------------------------------
// Before create.
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
	const record = e.record;
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const tripId = record.get('trip');
	if (!tripId) throw new BadRequestError('trip is required');

	// Resolve the caller's ACTIVE membership for this trip (cerebrum invariant:
	// active-member queries MUST append removed_at = "").
	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid} && removed_at = ""',
			{ tripId: tripId, uid: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	// Viewers are read-only (PRD — viewers see memories, never author them).
	if (callerMember.get('role') === 'viewer') {
		throw new ForbiddenError('Viewers cannot capture memories');
	}

	// Pin author to the caller's own membership regardless of what was sent —
	// a memory is personal expression; you can only author as yourself.
	record.set('author', callerMember.id);

	// The day must belong to the same trip.
	const dayId = record.get('day');
	if (!dayId) throw new BadRequestError('day is required');
	let day;
	try {
		day = e.app.findRecordById('days', dayId);
	} catch (_) {
		throw new BadRequestError('Day not found');
	}
	if (day.get('trip') !== tripId) {
		throw new BadRequestError('Day belongs to a different trip');
	}

	// --- at-least-one-of {photo, thought} (PRD §Constraints) ---
	// A record with neither does not exist. At before-create time a freshly
	// UPLOADED photo is a PENDING-upload object (has .name), so getString() is
	// still "" — check both forms (same scar as documents.pb.js).
	const thought = record.getString('thought').trim();
	let hasPhoto = record.getString('photo') !== '';
	if (!hasPhoto) {
		const raw = record.get('photo');
		if (raw) {
			if (Array.isArray(raw)) {
				hasPhoto = raw.length > 0;
			} else if (typeof raw === 'object') {
				hasPhoto = !!(raw.name || raw.originalName);
			}
		}
	}
	if (!hasPhoto && thought === '') {
		throw new BadRequestError('A memory needs a photo or a thought');
	}

	e.next();
}, 'memories');

// ---------------------------------------------------------------------------
// Before update: the patched record must still carry a photo or a thought.
// (Author-only is already the update RULE; clearing both fields should go
// through DELETE — the app's composer does that; this is the API backstop.)
// ---------------------------------------------------------------------------
onRecordUpdateRequest((e) => {
	const record = e.record; // new state — request payload already applied
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const thought = record.getString('thought').trim();
	let hasPhoto = record.getString('photo') !== '';
	if (!hasPhoto) {
		const raw = record.get('photo');
		if (raw) {
			if (Array.isArray(raw)) {
				hasPhoto = raw.length > 0;
			} else if (typeof raw === 'object') {
				hasPhoto = !!(raw.name || raw.originalName);
			}
		}
	}
	if (!hasPhoto && thought === '') {
		throw new BadRequestError(
			'A memory needs a photo or a thought — delete it instead of clearing both'
		);
	}

	e.next();
}, 'memories');
