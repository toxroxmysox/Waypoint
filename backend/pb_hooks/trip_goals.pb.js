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
		member = e.app.findFirstRecordByFilter('trip_members', 'trip = {:trip} && user = {:user}', {
			trip: e.record.get('trip'),
			user: authId
		});
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip.');
	}

	if (member.getString('role') === 'viewer') {
		throw new ForbiddenError('Viewers cannot edit goals.');
	}

	e.next();
}, 'trip_goals');

// delete (#77 tightening): owner/co_owner may delete any goal; the creator may
// delete their own goal ONLY while it has zero goal_votes. Once others have
// voted, the goal is shared attention — deleting it would discard their input,
// so only an owner can. (PRD "Permissions — Trip Goal": `(creator AND zero
// goal_votes) OR owner/co_owner`.)
onRecordDeleteRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) {
		throw new BadRequestError('Not authenticated.');
	}

	let member;
	try {
		member = e.app.findFirstRecordByFilter('trip_members', 'trip = {:trip} && user = {:user}', {
			trip: e.record.get('trip'),
			user: authId
		});
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip.');
	}

	const role = member.getString('role');
	const isOwner = role === 'owner' || role === 'co_owner';

	// Owners/co-owners delete regardless of votes.
	if (isOwner) {
		e.next();
		return;
	}

	const isCreator = e.record.get('created_by') === member.id;
	if (!isCreator) {
		throw new ForbiddenError('Only the goal creator or an owner can delete it.');
	}

	// Creator branch: allowed only with zero goal_votes. findFirstRecordByFilter
	// throws when none match — absence of a match means zero votes.
	let hasVotes = true;
	try {
		e.app.findFirstRecordByFilter('goal_votes', 'goal = {:goal}', { goal: e.record.id });
	} catch (_) {
		hasVotes = false;
	}
	if (hasVotes) {
		throw new ForbiddenError('This goal has votes — only an owner can delete it.');
	}

	e.next();
}, 'trip_goals');

// ---------------------------------------------------------------------------
// #519 — cross-trip references (#411 pattern). A goal's linked items must be on
// the goal's trip. onRecordValidate, so admin saves are checked too; on update
// only when the list or trip changed. goja: helpers inlined.
// ---------------------------------------------------------------------------
onRecordValidate((e) => {
	const r = e.record;
	const tripId = r.getString('trip');
	const isNew = r.isNew();
	const ids = r.getStringSlice('items');
	const changed =
		isNew ||
		r.getString('trip') !== r.original().getString('trip') ||
		JSON.stringify(ids) !== JSON.stringify(r.original().getStringSlice('items'));
	if (changed) {
		for (let i = 0; i < ids.length; i++) {
			let ok = false;
			try {
				ok = e.app.findRecordById('items', ids[i]).getString('trip') === tripId;
			} catch (_) {}
			if (!ok) throw new BadRequestError("That item isn't on this trip.");
		}
	}
	e.next();
}, 'trip_goals');
