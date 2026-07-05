/// <reference path="../pb_data/types.d.ts" />
// #337 (Candidate Scenarios) — champion-only edit/delete gate that PB rules can't
// express in one expression.
//
// create role gating lives in the rule (0063: champion is a single relation, so
// `champion.user = auth && champion.role != "viewer"` is unambiguous). Edit and
// delete act on an EXISTING scenario whose champion may differ from the caller, so
// the caller's own identity is resolved here and compared to the champion — the
// spec's "edit/delete = champion only (fork instead of edit-war)".
//
// The promotion cascade (milestone 5) flips status → won/archived via admin-context
// e.app.save(), which bypasses these REQUEST hooks entirely — so promotion is not
// blocked by the champion gate.
//
// PB 0.27 runs each callback in an isolated sandbox — top-of-file helpers are
// invisible inside the body, so the membership lookup is inlined per handler
// (mirrors trip_goals.pb.js).

// edit: champion only. The active-member lookup appends `removed_at = ""` (the
// standing invariant — a departed member is not an active champion).
onRecordUpdateRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) {
		throw new BadRequestError('Not authenticated.');
	}

	let member;
	try {
		member = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:trip} && user = {:user} && removed_at = ""',
			{ trip: e.record.get('trip'), user: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip.');
	}

	if (e.record.get('champion') !== member.id) {
		throw new ForbiddenError('Only the champion can edit this scenario — fork it instead.');
	}

	e.next();
}, 'scenarios');

// delete: champion only.
onRecordDeleteRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) {
		throw new BadRequestError('Not authenticated.');
	}

	let member;
	try {
		member = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:trip} && user = {:user} && removed_at = ""',
			{ trip: e.record.get('trip'), user: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip.');
	}

	if (e.record.get('champion') !== member.id) {
		throw new ForbiddenError('Only the champion can delete this scenario.');
	}

	e.next();
}, 'scenarios');
