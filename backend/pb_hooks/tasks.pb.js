/// <reference path="../pb_data/types.d.ts" />
// #283 (AUTHZ-3) — tasks write gate: block viewers.
//
// THE GAP: tasks (migration 0030) ship with bare MEMBER_VIA_CHECKLIST on every
// op and no hook, so a VIEWER could create/edit/delete tasks (incl. ticking off
// others' booking tasks) via direct PB REST — the SvelteKit isViewer()->403 guard
// only covers the form-action UI path.
//
// CONFIRMED TIER (SPEC §4 — travelers manage tasks/lists in the app model): allow
// traveler+, block viewers. Mirrors documents.pb.js / checklists.pb.js. A task has
// no `trip` field — it belongs to a checklist (tasks.checklist, migration 0030),
// so the trip is resolved via the checklist, then the caller's role from their own
// trip_members row. The rule (MEMBER_VIA_CHECKLIST) stays as defense-in-depth.
//
// goja: everything inlined per handler; handler-first signature. The checklist
// lookup is repeated in each callback (no file-scope helpers in the sandbox).

// ---------------------------------------------------------------------------
// Before create / update / delete: traveler+ only (viewers read-only).
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');
	const checklistId = e.record.get('checklist');
	if (!checklistId) throw new BadRequestError('checklist is required');
	let checklist;
	try {
		checklist = e.app.findRecordById('checklists', checklistId);
	} catch (_) {
		throw new BadRequestError('Checklist not found');
	}
	const tripId = checklist.get('trip');
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
	if (callerMember.get('role') === 'viewer') {
		throw new ForbiddenError('Viewers cannot create tasks');
	}
	e.next();
}, 'tasks');

onRecordUpdateRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');
	const checklistId = e.record.get('checklist');
	let checklist;
	try {
		checklist = e.app.findRecordById('checklists', checklistId);
	} catch (_) {
		throw new BadRequestError('Checklist not found');
	}
	const tripId = checklist.get('trip');
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
	if (callerMember.get('role') === 'viewer') {
		throw new ForbiddenError('Viewers cannot edit tasks');
	}
	e.next();
}, 'tasks');

onRecordDeleteRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');
	const checklistId = e.record.get('checklist');
	let checklist;
	try {
		checklist = e.app.findRecordById('checklists', checklistId);
	} catch (_) {
		throw new BadRequestError('Checklist not found');
	}
	const tripId = checklist.get('trip');
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
	if (callerMember.get('role') === 'viewer') {
		throw new ForbiddenError('Viewers cannot delete tasks');
	}
	e.next();
}, 'tasks');
