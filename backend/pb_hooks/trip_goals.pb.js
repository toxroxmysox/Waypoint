/// <reference path="../pb_data/types.d.ts" />
// #75 — Trip Goals role gating that PB rules can't express in one expression.
//
// create role gating lives in the rule (createRule on 0040: created_by is a
// single relation, so `created_by.role != "viewer"` is unambiguous). Edit and
// delete act on an existing record by a member who is not necessarily the
// author, so the acting user's own role has to be looked up here.
//
// PB 0.27 runs each callback in an isolated sandbox — top-of-file helpers are
// invisible inside the body, so the membership lookup is inlined per handler.

// edit: any non-viewer member of the trip (viewers are read-only).
onRecordUpdateRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) {
		throw new BadRequestError('Not authenticated.');
	}

	let member;
	try {
		member = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:trip} && user = {:user}',
			{ trip: e.record.get('trip'), user: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip.');
	}

	if (member.get('role') === 'viewer') {
		throw new ForbiddenError('Viewers cannot edit goals.');
	}

	e.next();
}, 'trip_goals');

// delete: the creator, or an owner / co_owner. (The "creator AND zero
// goal_votes" tightening lands in #77 alongside the goal_votes collection.)
onRecordDeleteRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) {
		throw new BadRequestError('Not authenticated.');
	}

	let member;
	try {
		member = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:trip} && user = {:user}',
			{ trip: e.record.get('trip'), user: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip.');
	}

	const role = member.get('role');
	const isOwner = role === 'owner' || role === 'co_owner';
	const isCreator = e.record.get('created_by') === member.id;

	if (!isOwner && !isCreator) {
		throw new ForbiddenError('Only the goal creator or an owner can delete it.');
	}

	e.next();
}, 'trip_goals');
