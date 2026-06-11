#!/usr/bin/env node
// Waypoint M2a — PocketBase API rule verification harness.
//
// Authenticates as five identities (owner, co_owner, traveler, viewer,
// non_member) plus anon, and exercises every (collection, op) cell against
// a freshly minted fixture trip. Reports a pass/fail matrix with HTTP codes.
//
// Prerequisites:
//   - PocketBase running on $PUBLIC_PB_URL (default http://127.0.0.1:8090)
//   - Migration 0014_explicit_rules_audit applied
//   - PB started with: WAYPOINT_DEV_MODE=true E2E_TEST_EMAILS=<the 5 emails>
//
// Run:
//   pnpm test:rules
//
// Exit code: 0 on all-green, 1 on any failure.

import { exit } from 'node:process';

const PB_URL = process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090';

const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

const ROLES = ['owner', 'co_owner', 'traveler', 'viewer', 'non_member'];
const COLLECTIONS = ['users', 'trips', 'trip_members', 'phases', 'days', 'items', 'checklist_items', 'pending_invites', 'votes', 'trip_goals', 'goal_votes', 'documents'];

// Collections whose create requires a multipart body (a file field). `documents`
// (#70) takes a single file; the harness uploads a valid 1x1 PNG so PB's
// mimeTypes/maxSize validation passes and the create result reflects the
// permission rule + hook, not a payload-validation 400.
const MULTIPART_CREATE = new Set(['documents']);
const PNG_1x1 = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
	0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
	0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
	0x42, 0x60, 0x82
]);

function documentsCreateForm(fixture) {
	const form = new FormData();
	form.set('trip', fixture.tripId);
	form.set('file', new Blob([PNG_1x1], { type: 'image/png' }), 'harness.png');
	return form;
}

async function pbRequest(method, path, opts = {}) {
	const headers = {};
	if (opts.token) headers.Authorization = opts.token;
	const init = { method, headers };
	if (opts.form !== undefined) {
		// Let fetch set the multipart boundary + Content-Type.
		init.body = opts.form;
	} else if (opts.body !== undefined) {
		headers['Content-Type'] = 'application/json';
		init.body = JSON.stringify(opts.body);
	}
	const res = await fetch(PB_URL + path, init);
	let data = null;
	try {
		data = await res.json();
	} catch (_) {
		// Empty body (e.g. 204 from DELETE).
	}
	return { status: res.status, data };
}

async function authBypass(email) {
	const { status, data } = await pbRequest('POST', '/api/dev/auth-bypass', { body: { email } });
	if (status !== 200) {
		console.error(`auth-bypass failed for ${email}: HTTP ${status}`, data);
		exit(2);
	}
	return data.token;
}

async function setupFixture() {
	const { status, data } = await pbRequest('POST', '/api/dev/rules-fixture', {
		body: { emails: EMAILS }
	});
	if (status !== 200) {
		console.error(`fixture setup failed: HTTP ${status}`, data);
		exit(2);
	}
	return data;
}

function fixtureRecordId(fixture, collection) {
	switch (collection) {
		case 'users':
			return fixture.userIds.owner;
		case 'trips':
			return fixture.tripId;
		case 'trip_members':
			return fixture.memberIds.owner;
		case 'phases':
			return fixture.phaseId;
		case 'days':
			return fixture.dayId;
		case 'items':
			return fixture.itemId;
		case 'checklist_items':
			return fixture.checklistItemId;
		case 'pending_invites':
			return fixture.pendingInviteId;
		case 'votes':
			return fixture.voteId;
		case 'trip_goals':
			return fixture.goalId;
		case 'goal_votes':
			return fixture.goalVoteId;
		case 'documents':
			return fixture.documentId;
		default:
			throw new Error('unknown collection ' + collection);
	}
}

// Outcome classifiers. PB encodes denials inconsistently (404 vs 403 vs 400),
// so we collapse to allow / deny / auth_error and report the raw status alongside.
function classifyList(status, items, fixtureId) {
	if (status === 401) return 'auth_error';
	if (status !== 200) return 'http_' + status;
	if (!Array.isArray(items)) return 'http_' + status;
	return items.some((r) => r.id === fixtureId) ? 'allow' : 'deny';
}

function classifyView(status) {
	if (status === 401) return 'auth_error';
	if (status === 200) return 'allow';
	if (status >= 400 && status < 500) return 'deny';
	return 'http_' + status;
}

function classifyWrite(status) {
	if (status === 401) return 'auth_error';
	if (status >= 200 && status < 300) return 'allow';
	if (status >= 400 && status < 500) return 'deny';
	return 'http_' + status;
}

const results = [];
function recordResult(collection, op, role, expected, actual, status) {
	results.push({
		collection,
		op,
		role,
		expected,
		actual,
		status,
		passed: expected === actual
	});
}

// Expected outcomes per (collection, op, role). Anon is hardcoded to 'deny'
// in each phase runner: PB doesn't return 401 to unauthenticated requests
// against rule-protected endpoints — every rule starts with
// `@request.auth.id != ""`, so anon just fails the rule like a non-member.
//
// The matrix below reflects M2a baseline (role-agnostic membership). When a
// later sub-milestone tightens permissions, update the affected cells AND
// document the change in backend/RULES.md.
const ALLOW_MEMBERS_DENY_NONMEMBER = {
	owner: 'allow',
	co_owner: 'allow',
	traveler: 'allow',
	viewer: 'allow',
	non_member: 'deny'
};
const DENY_ALL = {
	owner: 'deny',
	co_owner: 'deny',
	traveler: 'deny',
	viewer: 'deny',
	non_member: 'deny'
};
const SELF_ONLY = {
	owner: 'allow',
	co_owner: 'deny',
	traveler: 'deny',
	viewer: 'deny',
	non_member: 'deny'
};

const EXPECT = {
	// users (#103 / ADR-0006):
	//   list:   SELF_ONLY — no user enumeration. listRule stays `id = auth.id`,
	//           so every role's list returns only their own row; the fixture
	//           record (owner's user row) is absent from everyone else's page.
	//   view:   co-traveler — viewRule loosens to "the caller shares a trip with
	//           the target user" (a two-level nested back-relation, migration
	//           0043). The fixture view target is owner's user row, so every
	//           member of the fixture trip (owner/co_owner/traveler/viewer) may
	//           view it; non_member (and anon) deny. Field-level visibility
	//           (name+avatar yes, email+secrets no) is asserted separately in
	//           runUsersCrossReadCases.
	//   create/update/delete: unchanged from 0014 (create/delete admin-only,
	//           update self-only).
	users: {
		list: SELF_ONLY,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: DENY_ALL,
		update: SELF_ONLY,
		delete: DENY_ALL
	},
	trips: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: { owner: 'allow', co_owner: 'allow', traveler: 'allow', viewer: 'allow', non_member: 'allow' },
		update: ALLOW_MEMBERS_DENY_NONMEMBER,
		delete: ALLOW_MEMBERS_DENY_NONMEMBER
	},
	trip_members: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: DENY_ALL,
		update: ALLOW_MEMBERS_DENY_NONMEMBER,
		delete: ALLOW_MEMBERS_DENY_NONMEMBER
	},
	phases: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: ALLOW_MEMBERS_DENY_NONMEMBER,
		update: ALLOW_MEMBERS_DENY_NONMEMBER,
		delete: ALLOW_MEMBERS_DENY_NONMEMBER
	},
	days: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: DENY_ALL,
		update: ALLOW_MEMBERS_DENY_NONMEMBER,
		delete: DENY_ALL
	},
	items: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: ALLOW_MEMBERS_DENY_NONMEMBER,
		update: ALLOW_MEMBERS_DENY_NONMEMBER,
		delete: ALLOW_MEMBERS_DENY_NONMEMBER
	},
	checklist_items: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: ALLOW_MEMBERS_DENY_NONMEMBER,
		update: ALLOW_MEMBERS_DENY_NONMEMBER,
		delete: ALLOW_MEMBERS_DENY_NONMEMBER
	},
	// pending_invites (M2b):
	//   list/view: any member can see invites for the trip
	//   create: null (rule) — legitimate path is /api/invites/create endpoint
	//   update: null (rule) — invites are immutable; revoke + re-invite to change
	//   delete: rule = member; HOOK enforces SPEC §3 — owner/co_owner can
	//           revoke any; traveler can revoke only their own; viewer cannot.
	//           Fixture invite is created by the owner, so traveler/viewer
	//           both deny here.
	pending_invites: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: DENY_ALL,
		update: DENY_ALL,
		delete: {
			owner: 'allow',
			co_owner: 'allow',
			traveler: 'deny',
			viewer: 'deny',
			non_member: 'deny'
		}
	},
	// votes (#30):
	//   list/view: any member can see the trip's votes
	//   create: any member can vote (createBody votes as the acting member, on a
	//           second item so it doesn't collide with the seeded fixture vote)
	//   update/delete: own vote only (rule: member.user = @request.auth.id). The
	//           fixture vote belongs to the owner, so only owner passes — SELF_ONLY.
	votes: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: ALLOW_MEMBERS_DENY_NONMEMBER,
		update: SELF_ONLY,
		delete: SELF_ONLY
	},
	// trip_goals (#75):
	//   list/view: any member can see the trip's goals
	//   create: owner·co_owner·traveler — viewers read-only, no suggestion queue.
	//           Rule-enforced: createBody authors as the acting member, and the
	//           createRule requires `created_by.user = auth && created_by.role !=
	//           "viewer"` (created_by is a single relation, so the role check is
	//           unambiguous). viewer + non_member therefore deny.
	//   update (edit): same role set. Rule is membership; trip_goals.pb.js rejects
	//           viewers (their own role can't be correlated in a single rule).
	//   delete: creator OR owner/co_owner. The fixture goal is authored by the
	//           traveler, so traveler passes as creator; owner/co_owner pass by
	//           role; viewer denies. (The "AND zero goal_votes" clause lands in
	//           #77 with the goal_votes collection.)
	trip_goals: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: { owner: 'allow', co_owner: 'allow', traveler: 'allow', viewer: 'deny', non_member: 'deny' },
		update: { owner: 'allow', co_owner: 'allow', traveler: 'allow', viewer: 'deny', non_member: 'deny' },
		delete: { owner: 'allow', co_owner: 'allow', traveler: 'allow', viewer: 'deny', non_member: 'deny' }
	},
	// goal_votes (#77 — ADR-0004 separate collection, parallel to votes):
	//   list/view: any member can see the trip's goal votes.
	//   create: owner·co_owner·traveler may vote on a goal they did NOT create;
	//           viewers cannot (role) and non_member/anon are not members. The
	//           createBody targets the viewer-authored `goalNeutral`, so none of
	//           owner/co_owner/traveler is its creator — all three pass; viewer
	//           denies on both role and the can't-vote-own rule. (The can't-vote-
	//           your-own-goal negative case is asserted separately — see
	//           runGoalVotesNovelCases.)
	//   update/delete: own vote only. The fixture goal_vote belongs to the owner
	//           (on the co_owner's goal), so only owner passes — SELF_ONLY.
	goal_votes: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: { owner: 'allow', co_owner: 'allow', traveler: 'allow', viewer: 'deny', non_member: 'deny' },
		update: SELF_ONLY,
		delete: SELF_ONLY
	},
	// documents (#70):
	//   list/view: any member sees the trip's documents.
	//   create: any member EXCEPT viewers (documents.pb.js blocks viewers;
	//           uploaded_by is auto-pinned to the caller). Each role uploads a
	//           valid PNG via multipart so the result reflects the gate, not a
	//           payload error.
	//   update: none — updateRule is null (v4 documents are immutable artifacts).
	//   delete: uploader OR owner/co_owner (documents.pb.js). The fixture document
	//           is uploaded by the owner, so owner + co_owner pass; traveler and
	//           viewer (neither uploader nor privileged) are denied.
	documents: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: { owner: 'allow', co_owner: 'allow', traveler: 'allow', viewer: 'deny', non_member: 'deny' },
		update: DENY_ALL,
		delete: { owner: 'allow', co_owner: 'allow', traveler: 'deny', viewer: 'deny', non_member: 'deny' }
	}
};

function createBody(collection, role, fixture) {
	const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
	switch (collection) {
		case 'users':
			return {
				email: `harness-${stamp}@e2e.test`,
				password: 'harnesspw1234',
				passwordConfirm: 'harnesspw1234'
			};
		case 'trips':
			return {
				slug: `harness-${role}-${stamp}`,
				title: `Harness ${role}`,
				start_date: '2027-01-01 00:00:00.000Z',
				end_date: '2027-01-02 00:00:00.000Z',
				timezone: 'UTC',
				created_by: fixture.userIds[role] || fixture.userIds.owner
			};
		case 'trip_members':
			return {
				trip: fixture.tripId,
				user: fixture.userIds.non_member,
				role: 'viewer',
				joined_at: '2027-01-01 00:00:00.000Z'
			};
		case 'phases':
			return {
				trip: fixture.tripId,
				name: `Harness phase ${role} ${stamp}`,
				start_date: '2026-06-01 00:00:00.000Z',
				end_date: '2026-06-02 00:00:00.000Z',
				order: 99
			};
		case 'days':
			return { trip: fixture.tripId, date: '2027-01-01 00:00:00.000Z' };
		case 'items':
			return {
				trip: fixture.tripId,
				type: 'activity',
				title: `Harness item ${role} ${stamp}`,
				created_by: fixture.memberIds[role] || fixture.memberIds.owner
			};
		case 'checklist_items':
			return { item: fixture.itemId, text: `Harness row ${stamp}`, order: 99 };
		case 'pending_invites':
			return {
				trip: fixture.tripId,
				email: `harness-invitee-${stamp}@e2e.test`,
				role: 'viewer',
				invited_by: fixture.memberIds[role] || fixture.memberIds.owner,
				code: `harness-code-${stamp}`,
				expires_at: '2027-01-01 00:00:00.000Z'
			};
		case 'votes':
			// Vote as the acting member on itemId2 (distinct from the fixture vote's
			// item) so members don't trip the unique (item, member) index. The
			// votes.pb.js create hook requires member.user === auth, which holds
			// since each role votes as its own membership.
			return {
				trip: fixture.tripId,
				item: fixture.itemId2,
				member: fixture.memberIds[role] || fixture.memberIds.owner,
				value: 'like'
			};
		case 'goal_votes':
			// Vote as the acting member on the viewer-authored `goalNeutral`, which
			// none of owner/co_owner/traveler created — so the can't-vote-own rule
			// passes for them and they vote successfully; viewer denies on role.
			// non_member has no membership → falls back to owner, whose user != the
			// non_member auth, so member.user = auth fails → deny.
			return {
				goal: fixture.goalNeutralId,
				member: fixture.memberIds[role] || fixture.memberIds.owner,
				value: 'like'
			};
		case 'trip_goals':
			// Author as the acting member's own membership. The createRule gates on
			// created_by.role (single relation), so viewer denies and owner/
			// co_owner/traveler pass. non_member has no membership → falls back to
			// owner, whose user != the non_member auth, so the rule denies.
			return {
				trip: fixture.tripId,
				title: `Harness goal ${role} ${stamp}`,
				created_by: fixture.memberIds[role] || fixture.memberIds.owner,
				manual_status: 'unplanned',
				sort_order: 99
			};
		default:
			throw new Error('no body for ' + collection);
	}
}

function updateBody(collection) {
	switch (collection) {
		case 'users':
			return { name: 'Harness updated' };
		case 'trips':
			return { location_summary: 'Harness updated' };
		case 'trip_members':
			return { display_name: 'Harness updated' };
		case 'phases':
			return { name: 'Harness updated' };
		case 'days':
			return { notes: 'Harness updated' };
		case 'items':
			return { description: 'Harness updated' };
		case 'checklist_items':
			return { text: 'Harness updated' };
		case 'pending_invites':
			// updateRule = null, so any field works; PB will reject before
			// validating the payload.
			return { role: 'viewer' };
		case 'votes':
			return { value: 'love' };
		case 'goal_votes':
			return { value: 'love' };
		case 'trip_goals':
			return { title: 'Harness goal updated' };
		case 'documents':
			// updateRule is null, so PB rejects before validating the payload.
			return { caption: 'Harness updated' };
		default:
			throw new Error('no body for ' + collection);
	}
}

async function runListPhase(tokens, fixture) {
	for (const col of COLLECTIONS) {
		const fid = fixtureRecordId(fixture, col);
		for (const role of ROLES) {
			const r = await pbRequest('GET', `/api/collections/${col}/records?perPage=200`, {
				token: tokens[role]
			});
			recordResult(col, 'list', role, EXPECT[col].list[role], classifyList(r.status, r.data?.items, fid), r.status);
		}
		const r = await pbRequest('GET', `/api/collections/${col}/records?perPage=200`);
		recordResult(col, 'list', 'anon', 'deny', classifyList(r.status, r.data?.items, fid), r.status);
	}
}

async function runViewPhase(tokens, fixture) {
	for (const col of COLLECTIONS) {
		const fid = fixtureRecordId(fixture, col);
		for (const role of ROLES) {
			const r = await pbRequest('GET', `/api/collections/${col}/records/${fid}`, {
				token: tokens[role]
			});
			recordResult(col, 'view', role, EXPECT[col].view[role], classifyView(r.status), r.status);
		}
		const r = await pbRequest('GET', `/api/collections/${col}/records/${fid}`);
		recordResult(col, 'view', 'anon', 'deny', classifyView(r.status), r.status);
	}
}

async function runCreatePhase(tokens, fixture) {
	for (const col of COLLECTIONS) {
		const multipart = MULTIPART_CREATE.has(col);
		for (const role of ROLES) {
			const opts = multipart
				? { token: tokens[role], form: documentsCreateForm(fixture) }
				: { token: tokens[role], body: createBody(col, role, fixture) };
			const r = await pbRequest('POST', `/api/collections/${col}/records`, opts);
			recordResult(col, 'create', role, EXPECT[col].create[role], classifyWrite(r.status), r.status);
		}
		const anonOpts = multipart
			? { form: documentsCreateForm(fixture) }
			: { body: createBody(col, 'owner', fixture) };
		const r = await pbRequest('POST', `/api/collections/${col}/records`, anonOpts);
		recordResult(col, 'create', 'anon', 'deny', classifyWrite(r.status), r.status);
	}
}

async function runUpdatePhase(tokens, fixture) {
	for (const col of COLLECTIONS) {
		const fid = fixtureRecordId(fixture, col);
		for (const role of ROLES) {
			const r = await pbRequest('PATCH', `/api/collections/${col}/records/${fid}`, {
				token: tokens[role],
				body: updateBody(col)
			});
			recordResult(col, 'update', role, EXPECT[col].update[role], classifyWrite(r.status), r.status);
		}
		const r = await pbRequest('PATCH', `/api/collections/${col}/records/${fid}`, {
			body: updateBody(col)
		});
		recordResult(col, 'update', 'anon', 'deny', classifyWrite(r.status), r.status);
	}
}

async function runDeletePhase(tokens) {
	// Each delete attempt that should succeed mutates state; rebuild fixture
	// before each "allow" identity to keep things deterministic. Deny attempts
	// share one fixture since they don't change state.
	for (const col of COLLECTIONS) {
		const exp = EXPECT[col].delete;

		let fixture = await setupFixture();
		for (const role of ROLES) {
			if (exp[role] !== 'deny') continue;
			const fid = fixtureRecordId(fixture, col);
			const r = await pbRequest('DELETE', `/api/collections/${col}/records/${fid}`, {
				token: tokens[role]
			});
			recordResult(col, 'delete', role, 'deny', classifyWrite(r.status), r.status);
		}
		// anon
		const fidAnon = fixtureRecordId(fixture, col);
		const ranon = await pbRequest('DELETE', `/api/collections/${col}/records/${fidAnon}`);
		recordResult(col, 'delete', 'anon', 'deny', classifyWrite(ranon.status), ranon.status);

		for (const role of ROLES) {
			if (exp[role] !== 'allow') continue;
			fixture = await setupFixture();
			const fid = fixtureRecordId(fixture, col);
			const r = await pbRequest('DELETE', `/api/collections/${col}/records/${fid}`, {
				token: tokens[role]
			});
			recordResult(col, 'delete', role, 'allow', classifyWrite(r.status), r.status);
		}
	}
}

// Novel #77 rules the fixed (collection, op, role) matrix can't express: the
// can't-vote-your-own-goal create rule, and the tightened goal-delete "creator
// AND zero goal_votes" clause. Each sub-case uses its own fresh fixture. Results
// are recorded with custom op labels (collected in NOVEL_OPS for the report).
const NOVEL_OPS = [
	'create_own_goal',
	'create_other_goal',
	'delete_creator_zero',
	'delete_creator_voted',
	'delete_owner_voted'
];

async function runGoalVotesNovelCases(tokens) {
	// 1a. Can't vote your own goal — owner votes the owner-authored goalOwner → deny.
	let fixture = await setupFixture();
	const ownGoal = await pbRequest('POST', '/api/collections/goal_votes/records', {
		token: tokens.owner,
		body: { goal: fixture.goalOwnerId, member: fixture.memberIds.owner, value: 'like' }
	});
	recordResult('goal_votes', 'create_own_goal', 'owner', 'deny', classifyWrite(ownGoal.status), ownGoal.status);

	// 1b. Control: owner votes a goal they did NOT author (goalNeutral) → allow.
	const otherGoal = await pbRequest('POST', '/api/collections/goal_votes/records', {
		token: tokens.owner,
		body: { goal: fixture.goalNeutralId, member: fixture.memberIds.owner, value: 'like' }
	});
	recordResult('goal_votes', 'create_other_goal', 'owner', 'allow', classifyWrite(otherGoal.status), otherGoal.status);

	// 2a. Control: traveler deletes their own goal while it has zero votes → allow.
	fixture = await setupFixture();
	const delZero = await pbRequest('DELETE', `/api/collections/trip_goals/records/${fixture.goalId}`, {
		token: tokens.traveler
	});
	recordResult('trip_goals', 'delete_creator_zero', 'traveler', 'allow', classifyWrite(delZero.status), delZero.status);

	// 2b. Tightening: once a vote exists on the traveler's goal (cast by the owner,
	//     legal — not the owner's own goal), the traveler-creator can no longer
	//     delete it → deny.
	fixture = await setupFixture();
	await pbRequest('POST', '/api/collections/goal_votes/records', {
		token: tokens.owner,
		body: { goal: fixture.goalId, member: fixture.memberIds.owner, value: 'like' }
	});
	const delVoted = await pbRequest('DELETE', `/api/collections/trip_goals/records/${fixture.goalId}`, {
		token: tokens.traveler
	});
	recordResult('trip_goals', 'delete_creator_voted', 'traveler', 'deny', classifyWrite(delVoted.status), delVoted.status);

	// 2c. ...but an owner may still delete a voted goal regardless.
	fixture = await setupFixture();
	await pbRequest('POST', '/api/collections/goal_votes/records', {
		token: tokens.owner,
		body: { goal: fixture.goalId, member: fixture.memberIds.owner, value: 'like' }
	});
	const delOwner = await pbRequest('DELETE', `/api/collections/trip_goals/records/${fixture.goalId}`, {
		token: tokens.owner
	});
	recordResult('trip_goals', 'delete_owner_voted', 'owner', 'allow', classifyWrite(delOwner.status), delOwner.status);
}

function printNovelReport() {
	console.log('\n[novel #77 rules]');
	for (const r of results.filter((x) => NOVEL_OPS.includes(x.op))) {
		const mark = r.passed ? 'PASS' : 'FAIL';
		console.log(`  ${mark} ${r.collection}.${r.op} as ${r.role}: expected=${r.expected} actual=${r.actual}/${r.status}`);
	}
}

// #103 / ADR-0006 — co-traveler cross-read of the `users` row. The fixed
// (collection, op, role) matrix proves co_owner/traveler/viewer can *view* the
// owner's row and non_member can't, but it only inspects HTTP status. These
// cases additionally assert the PAYLOAD's field-level visibility — the crux of
// the ADR: a loosened view rule must expose `name` + `avatar` to a co-traveler
// while still hiding `email` (emailVisibility off) and the auth secrets
// (`password`/`tokenKey`, always stripped by PB on auth collections). Each is
// recorded under the `users` collection with a custom op label.
const USERS_CROSSREAD_OPS = [
	'crossread_view',
	'crossread_nonmember',
	'crossread_name_visible',
	'crossread_avatar_visible',
	'crossread_email_hidden',
	'crossread_password_hidden',
	'crossread_tokenkey_hidden'
];

async function runUsersCrossReadCases(tokens, fixture) {
	const ownerUserId = fixture.userIds.owner;

	// A co-traveler (co_owner) reads the owner's users row through their OWN authed
	// token — the read path the avatar wire-up depends on (expand:user).
	const view = await pbRequest('GET', `/api/collections/users/records/${ownerUserId}`, {
		token: tokens.co_owner
	});
	recordResult('users', 'crossread_view', 'co_owner', 'allow', classifyView(view.status), view.status);

	// A non-member must NOT be able to read it (404, existence not leaked).
	const denied = await pbRequest('GET', `/api/collections/users/records/${ownerUserId}`, {
		token: tokens.non_member
	});
	recordResult('users', 'crossread_nonmember', 'non_member', 'deny', classifyView(denied.status), denied.status);

	// Field-level visibility on the co-traveler payload. The fixture sets the
	// owner's `name` to "E2E owner"; `avatar` is an (empty) file field — the KEY
	// must be present and cross-readable even when no file is set. `email` must be
	// blanked (PB omits/empties it when emailVisibility is off and the caller
	// isn't the record owner/superuser); `password`/`tokenKey` are never serialized.
	const p = view.data || {};
	const nameVisible = typeof p.name === 'string' && p.name.length > 0;
	const avatarVisible = Object.prototype.hasOwnProperty.call(p, 'avatar');
	const emailHidden = !p.email; // absent or empty string both satisfy "not exposed"
	const passwordHidden = !Object.prototype.hasOwnProperty.call(p, 'password');
	const tokenKeyHidden = !Object.prototype.hasOwnProperty.call(p, 'tokenKey');

	recordResult('users', 'crossread_name_visible', 'co_owner', 'yes', nameVisible ? 'yes' : 'no', view.status);
	recordResult('users', 'crossread_avatar_visible', 'co_owner', 'yes', avatarVisible ? 'yes' : 'no', view.status);
	recordResult('users', 'crossread_email_hidden', 'co_owner', 'yes', emailHidden ? 'yes' : 'no', view.status);
	recordResult('users', 'crossread_password_hidden', 'co_owner', 'yes', passwordHidden ? 'yes' : 'no', view.status);
	recordResult('users', 'crossread_tokenkey_hidden', 'co_owner', 'yes', tokenKeyHidden ? 'yes' : 'no', view.status);
}

// #122 — suggestions member-read. Comments live in `suggestions`; writes go
// through hook endpoints (admin context) so the fixed matrix can't cover this
// collection (create/update/delete rules are null by design). These cases pin
// the two #122 regressions: the listRule/viewRule back-relation
// (`trip.trip_members_via_trip.user`, was the invalid `members_via_trip`) and
// the `created` autodate field (`sort=created` 400'd without it). A comment is
// authored by the owner via /api/comments/add; the co_owner — a co-member who
// is NOT the author — must be able to list (sorted by created) and view it,
// while non_member and anon are denied.
const SUGGESTIONS_OPS = [
	'comment_add',
	'member_list_sorted',
	'member_view',
	'created_present',
	'nonmember_list',
	'anon_list'
];

async function runSuggestionsMemberReadCases(tokens, fixture) {
	// Owner authors a comment on the fixture item via the hook endpoint.
	const add = await pbRequest('POST', '/api/comments/add', {
		token: tokens.owner,
		body: { item_id: fixture.itemId, comment_text: 'Harness comment (#122)' }
	});
	recordResult('suggestions', 'comment_add', 'owner', 'allow', classifyWrite(add.status), add.status);
	const commentId = add.data?.comment_id;

	// A co-member (not the author) lists suggestions sorted by created — both
	// the rule fix and the autodate field must hold for this to pass (a missing
	// `created` field makes the sort 400).
	const list = await pbRequest('GET', '/api/collections/suggestions/records?perPage=200&sort=created', {
		token: tokens.co_owner
	});
	recordResult(
		'suggestions',
		'member_list_sorted',
		'co_owner',
		'allow',
		classifyList(list.status, list.data?.items, commentId),
		list.status
	);

	// ...and views the record directly.
	const view = await pbRequest('GET', `/api/collections/suggestions/records/${commentId}`, {
		token: tokens.co_owner
	});
	recordResult('suggestions', 'member_view', 'co_owner', 'allow', classifyView(view.status), view.status);

	// The autodate field is populated on the payload.
	const createdPresent = typeof view.data?.created === 'string' && view.data.created.length > 0;
	recordResult('suggestions', 'created_present', 'co_owner', 'yes', createdPresent ? 'yes' : 'no', view.status);

	// Non-members and anon stay locked out.
	const nm = await pbRequest('GET', '/api/collections/suggestions/records?perPage=200&sort=created', {
		token: tokens.non_member
	});
	recordResult('suggestions', 'nonmember_list', 'non_member', 'deny', classifyList(nm.status, nm.data?.items, commentId), nm.status);

	const anon = await pbRequest('GET', '/api/collections/suggestions/records?perPage=200&sort=created');
	recordResult('suggestions', 'anon_list', 'anon', 'deny', classifyList(anon.status, anon.data?.items, commentId), anon.status);
}

function printSuggestionsReport() {
	console.log('\n[#122 suggestions member-read — co-member reads a comment, sort=created works]');
	for (const r of results.filter((x) => SUGGESTIONS_OPS.includes(x.op))) {
		const mark = r.passed ? 'PASS' : 'FAIL';
		console.log(`  ${mark} suggestions.${r.op} as ${r.role}: expected=${r.expected} actual=${r.actual}/${r.status}`);
	}
}

function printUsersCrossReadReport() {
	console.log('\n[#103 users cross-read — co-traveler name+avatar, email+secrets hidden]');
	for (const r of results.filter((x) => USERS_CROSSREAD_OPS.includes(x.op))) {
		const mark = r.passed ? 'PASS' : 'FAIL';
		console.log(`  ${mark} users.${r.op} as ${r.role}: expected=${r.expected} actual=${r.actual}/${r.status}`);
	}
}

function printReport() {
	const ops = ['list', 'view', 'create', 'update', 'delete'];
	const allRoles = [...ROLES, 'anon'];
	const colWidth = 16;

	for (const col of COLLECTIONS) {
		console.log(`\n[${col}]`);
		const header = ['  op'.padEnd(10), ...allRoles.map((r) => r.padEnd(colWidth))].join('');
		console.log(header);
		for (const op of ops) {
			const row = ['  ' + op.padEnd(8)];
			for (const role of allRoles) {
				const r = results.find((x) => x.collection === col && x.op === op && x.role === role);
				if (!r) {
					row.push('--'.padEnd(colWidth));
					continue;
				}
				const mark = r.passed ? 'PASS' : 'FAIL';
				const cell = `${mark} ${r.actual}/${r.status}`;
				row.push(cell.padEnd(colWidth));
			}
			console.log(row.join(''));
		}
	}

	const failures = results.filter((r) => !r.passed);
	if (failures.length > 0) {
		console.log('\n[FAILURES]');
		for (const f of failures) {
			console.log(
				`  ${f.collection}.${f.op} as ${f.role}: expected=${f.expected} actual=${f.actual} (HTTP ${f.status})`
			);
		}
	}

	console.log(
		`\n${failures.length === 0 ? 'PASS' : 'FAIL'}: ${results.length - failures.length}/${results.length} cells passed`
	);
}

async function main() {
	console.log(`PB: ${PB_URL}`);

	const tokens = {};
	for (const role of ROLES) {
		tokens[role] = await authBypass(EMAILS[role]);
	}

	console.log('Fixture: building...');
	let fixture = await setupFixture();
	console.log(`Fixture: trip=${fixture.tripId} item=${fixture.itemId}`);

	console.log('Phase 1/5: list');
	await runListPhase(tokens, fixture);

	console.log('Phase 2/5: view');
	await runViewPhase(tokens, fixture);

	console.log('Phase 3/5: create');
	fixture = await setupFixture();
	await runCreatePhase(tokens, fixture);

	console.log('Phase 4/5: update');
	fixture = await setupFixture();
	await runUpdatePhase(tokens, fixture);

	console.log('Phase 5/5: delete');
	await runDeletePhase(tokens);

	console.log('Novel #77 cases: vote-own-goal + tightened delete');
	await runGoalVotesNovelCases(tokens);

	console.log('#103 cases: co-traveler users cross-read (name+avatar, no email/secrets)');
	fixture = await setupFixture();
	await runUsersCrossReadCases(tokens, fixture);

	console.log('#122 cases: suggestions member-read (comment visible to co-member, sort=created)');
	fixture = await setupFixture();
	await runSuggestionsMemberReadCases(tokens, fixture);

	printReport();
	printNovelReport();
	printUsersCrossReadReport();
	printSuggestionsReport();

	const failed = results.some((r) => !r.passed);
	exit(failed ? 1 : 0);
}

main().catch((err) => {
	console.error('harness crashed:', err);
	exit(2);
});
