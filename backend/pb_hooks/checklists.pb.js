/// <reference path="../pb_data/types.d.ts" />
// #283 (AUTHZ-3) — checklists write gate: block viewers.
//
// THE GAP: checklists (migration 0030) ship with bare MEMBER_VIA_TRIP on every
// op and no hook, so a VIEWER could create/edit/delete checklists via direct PB
// REST — the SvelteKit isViewer()->403 guard only covers the form-action UI path.
//
// CONFIRMED TIER (SPEC §4 — travelers manage tasks/lists in the app model):
// allow traveler+, block viewers. Mirrors documents.pb.js (viewer-block in the
// hook; rule stays at membership as defense-in-depth — a viewer's role can't be
// correlated in a PB rule, the multi-relation ?= aliasing gotcha, cf. 0047).
//
// goja: membership lookup inlined per handler; handler-first signature. The
// caller's role is resolved from their OWN trip_members row for the checklist's
// trip — never trusted from a relation field.

// ---------------------------------------------------------------------------
// Before create / update / delete: traveler+ only (viewers read-only). The
// viewer-block logic is DUPLICATED into each callback on purpose — PB's goja
// sandbox can't see file-scope helpers (cerebrum [2026-06-05]), so a shared
// function would throw a swallowed ReferenceError after e.next() commits.
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');
	const tripId = e.record.get('trip');
	if (!tripId) throw new BadRequestError('trip is required');
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
		throw new ForbiddenError('Viewers cannot create checklists');
	}
	e.next();
}, 'checklists');

onRecordUpdateRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');
	const tripId = e.record.get('trip');
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
		throw new ForbiddenError('Viewers cannot edit checklists');
	}
	e.next();
}, 'checklists');

onRecordDeleteRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');
	const tripId = e.record.get('trip');
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
		throw new ForbiddenError('Viewers cannot delete checklists');
	}
	e.next();
}, 'checklists');
