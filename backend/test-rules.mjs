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
const COLLECTIONS = ['users', 'trips', 'trip_members', 'phases', 'days', 'items', 'checklist_items', 'pending_invites', 'votes', 'trip_goals', 'goal_votes', 'suggestion_votes', 'documents', 'memories', 'scenarios', 'scenario_votes', 'scenario_points', 'decisions'];

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

// #238 — superuser token for schema introspection (GET /api/collections is
// superuser-only). Defaults to the isolated-PB superuser that scripts/
// e2e-clean-pb.sh upserts (admin@e2e.test / e2eAdminPass123); override via
// PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD when running against another PB.
// Returns null (rather than exiting) if auth fails, so the drift test can degrade
// to a recorded FAIL instead of taking down the whole harness.
async function superuserToken() {
	const identity = process.env.PB_SUPERUSER_EMAIL || 'admin@e2e.test';
	const password = process.env.PB_SUPERUSER_PASSWORD || 'e2eAdminPass123';
	const { status, data } = await pbRequest('POST', '/api/collections/_superusers/auth-with-password', {
		body: { identity, password }
	});
	if (status !== 200 || !data?.token) {
		console.error(`superuser auth failed (HTTP ${status}) — set PB_SUPERUSER_EMAIL/PASSWORD`, data);
		return null;
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
		case 'suggestion_votes':
			return fixture.suggestionVoteId;
		case 'documents':
			return fixture.documentId;
		case 'memories':
			return fixture.memoryId;
		case 'scenarios':
			return fixture.scenarioId;
		case 'scenario_votes':
			return fixture.scenarioVoteId;
		case 'scenario_points':
			return fixture.scenarioPointId;
		case 'decisions':
			return fixture.decisionId;
		default:
			throw new Error('unknown collection ' + collection);
	}
}

// #133: the delete phase needs a CHILDLESS trip_members target. The owner member
// (fixtureRecordId) is referenced required+non-cascade by item/vote/goal/invite/
// document FKs, so a raw delete 400s on the constraint rather than the rule —
// the 4 perennial delete-reds. The `spare` member authors nothing, so deleting
// it exercises the actual delete RULE. All other collections delete their normal
// fixture record.
function deleteTargetId(fixture, collection) {
	if (collection === 'trip_members') return fixture.memberIds.spare;
	return fixtureRecordId(fixture, collection);
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
// #175 — owner/co_owner only (travelers + viewers denied). Used for items and
// phases write ops: the role gate lives in items.pb.js / phases.pb.js (the rule
// stays at membership), resolving the caller's actual trip_members role.
const OWNER_COOWNER_ONLY = {
	owner: 'allow',
	co_owner: 'allow',
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
	// trip_members (#279 — AUTHZ-1):
	//   update: a NON-role edit (the matrix PATCHes the owner row's display_name)
	//           stays at MEMBER_VIA_TRIP — any member passes. trip_members.pb.js only
	//           gates `role` CHANGES (owner/co_owner only) — see the novel
	//           role-escalation cases below.
	//   delete: owner/co_owner only. The matrix deletes the childless `spare`
	//           placeholder (user=""), so it's never a self-leave for any role;
	//           trip_members.pb.js requires owner/co_owner to delete someone else's
	//           row, so traveler + viewer now deny (was the wide-open MEMBER rule).
	//           Self-leave + sole-owner cap are exercised in the novel cases.
	trip_members: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: DENY_ALL,
		update: ALLOW_MEMBERS_DENY_NONMEMBER,
		delete: OWNER_COOWNER_ONLY
	},
	// phases (#175):
	//   list/view: any member sees the trip's phases.
	//   create/update/delete: owner·co_owner only. Phases are trip-structure
	//           (SPEC §4 — same tier as trip metadata). phases.pb.js role hooks
	//           resolve the caller's membership and reject travelers + viewers;
	//           the rule stays at membership (no created_by, and the caller's role
	//           can't be correlated in a rule for update/delete). The fixture phase
	//           is owner-authored in admin context, so traveler/viewer attempting
	//           to mutate it deny on role; owner/co_owner pass.
	phases: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: OWNER_COOWNER_ONLY,
		update: OWNER_COOWNER_ONLY,
		delete: OWNER_COOWNER_ONLY
	},
	days: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: DENY_ALL,
		update: ALLOW_MEMBERS_DENY_NONMEMBER,
		delete: DENY_ALL
	},
	// items (#175):
	//   list/view: any member sees the trip's items.
	//   create: owner·co_owner only. Travelers *suggest* (route through
	//           /api/suggestions/create, admin context — bypasses this gate);
	//           viewers are read-only. items.pb.js resolves the caller's actual
	//           membership and rejects non-owner/co_owner regardless of the
	//           created_by the client sends.
	//   update/delete: owner·co_owner only (items.pb.js). The fixture item is
	//           owner-authored, so traveler/viewer attempting to edit or delete it
	//           deny on the caller's role; owner/co_owner pass.
	items: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: OWNER_COOWNER_ONLY,
		update: OWNER_COOWNER_ONLY,
		delete: OWNER_COOWNER_ONLY
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
	// votes (#30 / #286):
	//   list/view: any member can see the trip's votes
	//   create: owner·co_owner·traveler may vote; VIEWERS are denied (#286 —
	//           votes.createRule gained `&& member.role != "viewer"` in migration
	//           0055, mirroring goal_votes/suggestion_votes; SPEC.md:99 lists Viewer
	//           = denied for voting). createBody votes as the acting member on a
	//           second item so it doesn't collide with the seeded fixture vote.
	//   update/delete: own vote only (rule: member.user = @request.auth.id). The
	//           fixture vote belongs to the owner, so only owner passes — SELF_ONLY.
	votes: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: { owner: 'allow', co_owner: 'allow', traveler: 'allow', viewer: 'deny', non_member: 'deny' },
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
	// suggestion_votes (#248 — PRD #202 / ADR-0009 votable Ghost Cards; parallels
	// goal_votes, single-parent ownership `suggestion → trip`):
	//   list/view: any member can see the trip's suggestion votes.
	//   create: owner·co_owner·traveler may vote on a suggestion they did NOT
	//           author; viewers cannot (role) and non_member/anon are not members.
	//           The createBody targets the viewer-authored `suggestionNeutral`, so
	//           none of owner/co_owner/traveler is its author — all three pass;
	//           viewer denies on both role and the can't-vote-own rule. (The
	//           can't-vote-your-own-suggestion negative case is asserted separately
	//           — see runSuggestionVotesNovelCases.)
	//   update/delete: own vote only. The fixture suggestion_vote belongs to the
	//           owner (on the co_owner's suggestion), so only owner passes —
	//           SELF_ONLY.
	suggestion_votes: {
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
	},
	// memories (#269 / ADR-0007):
	//   list/view: ALL trip members, including viewers — memories are reviewed
	//           together (Trip Mode Today + Closeout). Never public.
	//   create: owner·co_owner·traveler authoring as THEMSELVES; viewers are
	//           read-only (createRule: author.user = auth && author.role !=
	//           "viewer", mirroring trip_goals). createBody targets dayId2 so it
	//           never collides with the seeded (day1, owner) fixture memory under
	//           the unique (day, author) cap.
	//   update/delete: AUTHOR ONLY — personal expression, deliberately stricter
	//           than documents (no owner/co_owner override, PRD §Permissions).
	//           The fixture memory is owner-authored, so only owner passes.
	memories: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: { owner: 'allow', co_owner: 'allow', traveler: 'allow', viewer: 'deny', non_member: 'deny' },
		update: SELF_ONLY,
		delete: SELF_ONLY
	},
	// scenarios (#337 — Candidate Scenarios):
	//   list/view: ALL trip members incl. viewers — everyone reads the board.
	//   create: owner·co_owner·traveler authoring as THEMSELVES; viewers read-only
	//           (createRule: champion.user = auth && champion.role != "viewer",
	//           mirroring trip_goals / memories). createBody champions the acting
	//           member, so viewer + non_member deny.
	//   update/delete: CHAMPION only. The rule stays at membership; scenarios.pb.js
	//           enforces champion == caller. The fixture scenario is owner-championed,
	//           so only owner passes — SELF_ONLY. (The novel champion-gate cases prove
	//           a non-champion member denies.)
	scenarios: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: { owner: 'allow', co_owner: 'allow', traveler: 'allow', viewer: 'deny', non_member: 'deny' },
		update: SELF_ONLY,
		delete: SELF_ONLY
	},
	// scenario_votes (#337 — mirrors votes/goal_votes/suggestion_votes):
	//   list/view: any member sees the board's votes.
	//   create: owner·co_owner·traveler voting AS THEMSELVES; viewers denied
	//           (member.user = auth && member.role != "viewer"). createBody votes on
	//           scenarioNeutral so members don't collide with the seeded vote under the
	//           unique (scenario, member) index. non_member falls back to the owner
	//           member, whose user != non_member auth → deny.
	//   update/delete: own vote only (member.user = auth). The fixture vote belongs to
	//           the owner → SELF_ONLY.
	scenario_votes: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: { owner: 'allow', co_owner: 'allow', traveler: 'allow', viewer: 'deny', non_member: 'deny' },
		update: SELF_ONLY,
		delete: SELF_ONLY
	},
	// scenario_points (#337 — pros/cons as comment-like entries):
	//   list/view: any member sees the board's pros/cons.
	//   create: owner·co_owner·traveler as THEMSELVES; viewers denied.
	//   update: NONE — updateRule is null (a point is immutable; delete + re-add).
	//           DENY_ALL for every role.
	//   delete: author only (member.user = auth). The fixture point is owner-authored
	//           → SELF_ONLY.
	scenario_points: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: { owner: 'allow', co_owner: 'allow', traveler: 'allow', viewer: 'deny', non_member: 'deny' },
		update: DENY_ALL,
		delete: SELF_ONLY
	},
	// decisions (#337 — append-only, hook-written at promotion):
	//   list/view: ALL trip members incl. viewers — the "How we decided" record is
	//           readable forever.
	//   create/update/delete: DENY_ALL for every client role (all rules null). The
	//           promotion cascade writes via admin-context e.app.save, which bypasses
	//           collection rules — so even the owner can't client-create one.
	decisions: {
		list: ALLOW_MEMBERS_DENY_NONMEMBER,
		view: ALLOW_MEMBERS_DENY_NONMEMBER,
		create: DENY_ALL,
		update: DENY_ALL,
		delete: DENY_ALL
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
		case 'suggestion_votes':
			// Vote as the acting member on the viewer-authored `suggestionNeutral`,
			// which none of owner/co_owner/traveler authored — so the
			// can't-vote-own-suggestion rule passes for them and they vote
			// successfully; viewer denies on role + own-suggestion. non_member has no
			// membership → falls back to owner, whose user != the non_member auth, so
			// member.user = auth fails → deny.
			return {
				suggestion: fixture.suggestionNeutralId,
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
		case 'memories':
			// Thought-only memory (JSON — no file needed to satisfy the hook's
			// at-least-one-of check). Authored as the acting member on the SECOND
			// day, so the seeded (day1, owner) memory never collides under the
			// unique (day, author) index. non_member falls back to the owner's
			// member id, whose user != the non_member auth → rule denies.
			return {
				trip: fixture.tripId,
				day: fixture.dayId2,
				author: fixture.memberIds[role] || fixture.memberIds.owner,
				thought: `Harness memory ${role} ${stamp}`
			};
		case 'scenarios':
			// Champion as the acting member's own membership. createRule gates on
			// champion.role (single relation) + champion.user = auth, so viewer denies
			// and owner/co_owner/traveler pass. non_member has no membership → falls
			// back to owner, whose user != the non_member auth, so the rule denies.
			return {
				trip: fixture.tripId,
				title: `Harness scenario ${role} ${stamp}`,
				champion: fixture.memberIds[role] || fixture.memberIds.owner,
				status: 'candidate'
			};
		case 'scenario_votes':
			// Vote as the acting member on scenarioNeutral (viewer-championed), which
			// carries no seeded vote — so members don't trip the unique (scenario,
			// member) index. member.user = auth holds for owner/co_owner/traveler;
			// viewer denies on role; non_member falls back to owner → member.user !=
			// auth → deny.
			return {
				scenario: fixture.scenarioNeutralId,
				member: fixture.memberIds[role] || fixture.memberIds.owner,
				value: 'like'
			};
		case 'scenario_points':
			// Author a pro as the acting member on scenarioNeutral. Same role gating as
			// scenario_votes (member.user = auth && member.role != "viewer").
			return {
				scenario: fixture.scenarioNeutralId,
				member: fixture.memberIds[role] || fixture.memberIds.owner,
				kind: 'pro',
				text: `Harness point ${role} ${stamp}`
			};
		case 'decisions':
			// createRule is null → DENY_ALL; a valid-shaped body ensures the rule (not
			// a payload error) is what rejects for every role.
			return { trip: fixture.tripId, payload: { note: 'harness' } };
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
		case 'suggestion_votes':
			return { value: 'love' };
		case 'trip_goals':
			return { title: 'Harness goal updated' };
		case 'documents':
			// updateRule is null, so PB rejects before validating the payload.
			return { caption: 'Harness updated' };
		case 'memories':
			// A non-empty thought keeps the at-least-one-of hook satisfied, so the
			// matrix result reflects the author-only rule, not the backstop.
			return { thought: 'Harness updated' };
		case 'scenarios':
			// A plain non-status edit — the champion-only gate (scenarios.pb.js) is what
			// decides, so only the owner (fixture champion) passes.
			return { pitch: 'Harness updated' };
		case 'scenario_votes':
			return { value: 'love' };
		case 'scenario_points':
			// updateRule is null → PB rejects before validating the payload.
			return { text: 'Harness updated' };
		case 'decisions':
			// updateRule is null → PB rejects before validating the payload.
			return { payload: { note: 'harness updated' } };
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
			const fid = deleteTargetId(fixture, col);
			const r = await pbRequest('DELETE', `/api/collections/${col}/records/${fid}`, {
				token: tokens[role]
			});
			recordResult(col, 'delete', role, 'deny', classifyWrite(r.status), r.status);
		}
		// anon
		const fidAnon = deleteTargetId(fixture, col);
		const ranon = await pbRequest('DELETE', `/api/collections/${col}/records/${fidAnon}`);
		recordResult(col, 'delete', 'anon', 'deny', classifyWrite(ranon.status), ranon.status);

		for (const role of ROLES) {
			if (exp[role] !== 'allow') continue;
			fixture = await setupFixture();
			const fid = deleteTargetId(fixture, col);
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

// #248 (PRD #202 / ADR-0009) — votable Ghost Cards. The fixed (collection, op,
// role) matrix proves the membership + viewer gates, but four rule behaviors need
// dedicated assertions: a member CAN cast a vote, a member CANNOT vote a
// suggestion they authored, ownership resolves single-parent via `suggestion →
// trip`, and a non-member is denied. Each sub-case uses a fresh fixture (the
// unique (suggestion, member) index forbids re-voting). Authored = owner;
// neutral = viewer-authored (so owner/traveler are non-authors of it).
const SUGGESTION_VOTE_OPS = [
	'cast_vote',
	'cannot_vote_own',
	'ownership_via_parent',
	'nonmember_denied'
];

async function runSuggestionVotesNovelCases(tokens) {
	// 1. CAST — owner votes a suggestion they did NOT author (the viewer-authored
	//    `suggestionNeutral`) → allow. The headline "pending suggestions are
	//    votable" behavior.
	let fixture = await setupFixture();
	const cast = await pbRequest('POST', '/api/collections/suggestion_votes/records', {
		token: tokens.owner,
		body: { suggestion: fixture.suggestionNeutralId, member: fixture.memberIds.owner, value: 'love' }
	});
	recordResult('suggestion_votes', 'cast_vote', 'owner', 'allow', classifyWrite(cast.status), cast.status);

	// 2. CANNOT-VOTE-OWN — owner votes the owner-authored `suggestionAuthored` →
	//    deny (authorship is the implicit endorsement; rule: suggestion.author !=
	//    member).
	fixture = await setupFixture();
	const own = await pbRequest('POST', '/api/collections/suggestion_votes/records', {
		token: tokens.owner,
		body: { suggestion: fixture.suggestionAuthoredId, member: fixture.memberIds.owner, value: 'like' }
	});
	recordResult('suggestion_votes', 'cannot_vote_own', 'owner', 'deny', classifyWrite(own.status), own.status);

	// 3. OWNERSHIP VIA PARENT — a traveler who is a member of the suggestion's trip
	//    (resolved single-parent via `suggestion → trip`, no `trip` FK on the vote)
	//    votes a suggestion they did NOT author → allow. Proves the branch-free
	//    ownership path holds for a non-owner member.
	fixture = await setupFixture();
	const viaParent = await pbRequest('POST', '/api/collections/suggestion_votes/records', {
		token: tokens.traveler,
		body: { suggestion: fixture.suggestionNeutralId, member: fixture.memberIds.traveler, value: 'like' }
	});
	recordResult('suggestion_votes', 'ownership_via_parent', 'traveler', 'allow', classifyWrite(viaParent.status), viaParent.status);

	// 4. NON-MEMBER DENIED — a non-member of the trip cannot vote any of its
	//    suggestions; the `suggestion.trip.trip_members_via_trip` path excludes
	//    them → deny. (Votes as the owner's member id; they still fail member.user =
	//    auth, and aren't a member regardless.)
	fixture = await setupFixture();
	const nm = await pbRequest('POST', '/api/collections/suggestion_votes/records', {
		token: tokens.non_member,
		body: { suggestion: fixture.suggestionNeutralId, member: fixture.memberIds.owner, value: 'like' }
	});
	recordResult('suggestion_votes', 'nonmember_denied', 'non_member', 'deny', classifyWrite(nm.status), nm.status);
}

function printSuggestionVotesReport() {
	console.log('\n[#248 suggestion_votes — cast, cannot-vote-own, ownership-via-parent, non-member denied]');
	for (const r of results.filter((x) => SUGGESTION_VOTE_OPS.includes(x.op))) {
		const mark = r.passed ? 'PASS' : 'FAIL';
		console.log(`  ${mark} ${r.collection}.${r.op} as ${r.role}: expected=${r.expected} actual=${r.actual}/${r.status}`);
	}
}

// #217 — a trip must always have at least one phase. phases.pb.js blocks
// deleting the LAST phase of a trip (BadRequestError before e.next()). The fixed
// matrix can't express "delete allowed when >1 phase, denied when it's the last":
// the fixture now has TWO phases (the hook-seeded "Trip" = phaseId2, plus the
// explicit "Test Phase" = phaseId), so these cases drive both halves on one
// fixture in sequence. Owner is used (it already passes the owner/co_owner role
// gate, isolating the last-phase rule).
const LAST_PHASE_OPS = ['delete_not_last', 'delete_last'];

async function runLastPhaseDeleteCases(tokens) {
	const fixture = await setupFixture();

	// Control: two phases exist → owner deletes one ("Test Phase") → allow.
	const delNotLast = await pbRequest('DELETE', `/api/collections/phases/records/${fixture.phaseId}`, {
		token: tokens.owner
	});
	recordResult('phases', 'delete_not_last', 'owner', 'allow', classifyWrite(delNotLast.status), delNotLast.status);

	// Block: only the hook-seeded "Trip" phase remains → deleting it is the
	// last-phase delete → deny (BadRequestError, classified deny).
	const delLast = await pbRequest('DELETE', `/api/collections/phases/records/${fixture.phaseId2}`, {
		token: tokens.owner
	});
	recordResult('phases', 'delete_last', 'owner', 'deny', classifyWrite(delLast.status), delLast.status);
}

function printLastPhaseDeleteReport() {
	console.log('\n[novel #217 last-phase delete block]');
	for (const r of results.filter((x) => LAST_PHASE_OPS.includes(x.op))) {
		const mark = r.passed ? 'PASS' : 'FAIL';
		console.log(`  ${mark} ${r.collection}.${r.op} as ${r.role}: expected=${r.expected} actual=${r.actual}/${r.status}`);
	}
}

// #226 — self-assign exception in items.pb.js. The fixed matrix keeps items
// update at OWNER_COOWNER_ONLY (a generic traveler edit must still 403); these
// cases drive the NARROW carve-out: a member may PATCH `assigned_to` IFF the only
// delta is toggling their OWN trip_members.id. Each sub-case uses a fresh fixture
// (the fixture item starts with empty assigned_to). assigned_to holds
// trip_members.id, NOT users.id.
const SELF_ASSIGN_OPS = [
	'self_add_traveler',
	'self_remove_traveler',
	'self_add_viewer',
	'self_add_nonmember',
	'add_other_member',
	'self_add_with_other_field'
];

async function runSelfAssignNovelCases(tokens) {
	// 1. Traveler self-ADD — toggles their own id onto an empty assigned_to → allow.
	let fixture = await setupFixture();
	const add = await pbRequest('PATCH', `/api/collections/items/records/${fixture.itemId}`, {
		token: tokens.traveler,
		body: { assigned_to: [fixture.memberIds.traveler] }
	});
	recordResult('items', 'self_add_traveler', 'traveler', 'allow', classifyWrite(add.status), add.status);

	// 2. Traveler self-REMOVE — from a state where they're already assigned → allow.
	//    Seed via the owner (a privileged edit) so the remove is the only delta.
	fixture = await setupFixture();
	await pbRequest('PATCH', `/api/collections/items/records/${fixture.itemId}`, {
		token: tokens.owner,
		body: { assigned_to: [fixture.memberIds.traveler] }
	});
	const remove = await pbRequest('PATCH', `/api/collections/items/records/${fixture.itemId}`, {
		token: tokens.traveler,
		body: { assigned_to: [] }
	});
	recordResult('items', 'self_remove_traveler', 'traveler', 'allow', classifyWrite(remove.status), remove.status);

	// 3. Viewer self-ADD — viewers are read-only, never self-assign → deny.
	fixture = await setupFixture();
	const viewerAdd = await pbRequest('PATCH', `/api/collections/items/records/${fixture.itemId}`, {
		token: tokens.viewer,
		body: { assigned_to: [fixture.memberIds.viewer] }
	});
	recordResult('items', 'self_add_viewer', 'viewer', 'deny', classifyWrite(viewerAdd.status), viewerAdd.status);

	// 4. Non-member self-ADD — not a member of the trip → deny.
	fixture = await setupFixture();
	const nmAdd = await pbRequest('PATCH', `/api/collections/items/records/${fixture.itemId}`, {
		token: tokens.non_member,
		body: { assigned_to: [fixture.memberIds.traveler] }
	});
	recordResult('items', 'self_add_nonmember', 'non_member', 'deny', classifyWrite(nmAdd.status), nmAdd.status);

	// 5. Traveler adds ANOTHER member's id (the co_owner's) — not self → deny.
	fixture = await setupFixture();
	const other = await pbRequest('PATCH', `/api/collections/items/records/${fixture.itemId}`, {
		token: tokens.traveler,
		body: { assigned_to: [fixture.memberIds.co_owner] }
	});
	recordResult('items', 'add_other_member', 'traveler', 'deny', classifyWrite(other.status), other.status);

	// 6. Traveler self-adds AND edits another field (title) in one PATCH → deny
	//    (the exception forbids any other field delta).
	fixture = await setupFixture();
	const piggyback = await pbRequest('PATCH', `/api/collections/items/records/${fixture.itemId}`, {
		token: tokens.traveler,
		body: { assigned_to: [fixture.memberIds.traveler], title: 'Sneaky edit' }
	});
	recordResult('items', 'self_add_with_other_field', 'traveler', 'deny', classifyWrite(piggyback.status), piggyback.status);
}

function printSelfAssignReport() {
	console.log('\n[#226 self-assign — member toggles only their OWN assigned_to]');
	for (const r of results.filter((x) => SELF_ASSIGN_OPS.includes(x.op))) {
		const mark = r.passed ? 'PASS' : 'FAIL';
		console.log(`  ${mark} ${r.collection}.${r.op} as ${r.role}: expected=${r.expected} actual=${r.actual}/${r.status}`);
	}
}

// #219 — creator-edit exception in items.pb.js. The fixed matrix keeps items
// update at OWNER_COOWNER_ONLY (a traveler editing SOMEONE ELSE's item must still
// 403), and items delete at OWNER_COOWNER_ONLY (no creator carve-out). These
// cases drive the new carve-out: a member may edit ALL fields of an item THEY
// created (created_by == the caller's own trip_members.id) directly — including
// booking/money fields — but may NOT delete it. The fixture item is
// owner-authored; for the "own item" cases we mint a TRAVELER-authored item via
// the owner's token (the create hook only checks the CALLER's role and does not
// validate created_by), then act as the traveler. created_by holds a
// trip_members.id, NOT a users.id.
const CREATOR_EDIT_OPS = [
	'edit_own_item_traveler',
	'edit_own_item_booking_traveler',
	'edit_other_item_traveler',
	'delete_own_item_traveler'
];

async function runCreatorEditNovelCases(tokens) {
	// 1. Traveler edits their OWN item (a plain field) → allow. Owner mints the
	//    item with created_by = the traveler's member id; the traveler then PATCHes
	//    a normal field.
	let fixture = await setupFixture();
	let made = await pbRequest('POST', '/api/collections/items/records', {
		token: tokens.owner,
		body: {
			trip: fixture.tripId,
			type: 'activity',
			title: 'Traveler-authored item (#219)',
			created_by: fixture.memberIds.traveler
		}
	});
	const ownItemId = made.data?.id;
	const editOwn = await pbRequest('PATCH', `/api/collections/items/records/${ownItemId}`, {
		token: tokens.traveler,
		body: { description: 'Creator edits their own item' }
	});
	recordResult('items', 'edit_own_item_traveler', 'traveler', 'allow', classifyWrite(editOwn.status), editOwn.status);

	// 2. Traveler edits a BOOKING/MONEY field on their OWN item → allow (the
	//    carve-out covers all fields, unlike the narrow #226 self-assign one).
	const editBooking = await pbRequest('PATCH', `/api/collections/items/records/${ownItemId}`, {
		token: tokens.traveler,
		body: { booked: true, cost_estimate_usd: 42 }
	});
	recordResult('items', 'edit_own_item_booking_traveler', 'traveler', 'allow', classifyWrite(editBooking.status), editBooking.status);

	// 3. Traveler edits ANOTHER member's item (the owner-authored fixture item) →
	//    deny. The creator exception must not leak to non-creators.
	fixture = await setupFixture();
	const editOther = await pbRequest('PATCH', `/api/collections/items/records/${fixture.itemId}`, {
		token: tokens.traveler,
		body: { description: 'Editing someone else’s item' }
	});
	recordResult('items', 'edit_other_item_traveler', 'traveler', 'deny', classifyWrite(editOther.status), editOther.status);

	// 4. Traveler DELETEs their OWN item → deny. The creator may edit but never
	//    delete (delete stays owner/co_owner only).
	fixture = await setupFixture();
	made = await pbRequest('POST', '/api/collections/items/records', {
		token: tokens.owner,
		body: {
			trip: fixture.tripId,
			type: 'activity',
			title: 'Traveler-authored item to delete (#219)',
			created_by: fixture.memberIds.traveler
		}
	});
	const delOwnId = made.data?.id;
	const delOwn = await pbRequest('DELETE', `/api/collections/items/records/${delOwnId}`, {
		token: tokens.traveler
	});
	recordResult('items', 'delete_own_item_traveler', 'traveler', 'deny', classifyWrite(delOwn.status), delOwn.status);
}

function printCreatorEditReport() {
	console.log('\n[#219 creator-edit — member edits their OWN item directly, but cannot delete it]');
	for (const r of results.filter((x) => CREATOR_EDIT_OPS.includes(x.op))) {
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

// #133 + #238 — removal disposition. The fixed matrix can't express endpoint-
// driven removal, so these cases drive /api/members/remove and assert the load-
// bearing invariants:
//   - A member WITH data (authored an expense + is in its split) tombstones:
//     money survives, the row is retained, and the tombstone is invisible to the
//     active-roster query (#133).
//   - A ZERO-REFERENCE member (the name-only spare authors nothing, and votes are
//     always dropped) is HARD-DELETED (purged) — the row is gone from even the
//     unguarded all-rows query, and the response reports deleted:true (#238 /
//     ADR-0013). This replaces the old name-only-tombstone assertion: the spare is
//     exactly the zero-ref case the purge targets.
const MEMBER_REMOVAL_OPS = [
	'remove_with_expense_ok',
	'member_tombstoned',
	'tombstone_not_deleted',
	'money_survived',
	'roster_excludes_tombstone',
	'tombstone_retained',
	'zeroref_purged_deleted',
	'zeroref_row_gone'
];

function filterQuery(tripId, extra) {
	return encodeURIComponent(`trip="${tripId}"${extra}`);
}

async function runMemberRemovalNovelCases(tokens) {
	// --- Money survives removal (Resolution 10) + removing a member who authored
	// money succeeds (the issue's headline acceptance).
	let fixture = await setupFixture();
	const exp = await pbRequest('POST', '/api/collections/expenses/records', {
		token: tokens.traveler,
		body: {
			trip: fixture.tripId,
			amount_usd: 50,
			description: 'Harness expense (#133)',
			date: '2026-06-02 00:00:00.000Z',
			split_mode: 'equal',
			split_data: { members: [fixture.memberIds.traveler, fixture.memberIds.owner] }
		}
	});
	const expenseId = exp.data?.id;
	const paidBy = exp.data?.paid_by; // defaults to caller (traveler member)

	const rm = await pbRequest('POST', '/api/members/remove', {
		token: tokens.owner,
		body: { member_id: fixture.memberIds.traveler }
	});
	recordResult('trip_members', 'remove_with_expense_ok', 'owner', 'allow', classifyWrite(rm.status), rm.status);

	// #238: the traveler authored an expense AND is in its split → tombstone, NOT
	// purge. The hook must report deleted:false.
	const tombNotDeleted = rm.status === 200 && rm.data?.deleted === false;
	recordResult('trip_members', 'tombstone_not_deleted', 'owner', 'yes', tombNotDeleted ? 'yes' : 'no', rm.status);

	// Row RETAINED as a tombstone: removed_at set, user cleared.
	const mem = await pbRequest('GET', `/api/collections/trip_members/records/${fixture.memberIds.traveler}`, {
		token: tokens.owner
	});
	const tomb = mem.status === 200 && !!mem.data?.removed_at && mem.data?.user === '';
	recordResult('trip_members', 'member_tombstoned', 'owner', 'yes', tomb ? 'yes' : 'no', mem.status);

	// The expense survives, still attributed to the now-departed traveler.
	const expAfter = await pbRequest('GET', `/api/collections/expenses/records/${expenseId}`, {
		token: tokens.owner
	});
	const survived = expAfter.status === 200 && expAfter.data?.paid_by === paidBy;
	recordResult('expenses', 'money_survived', 'owner', 'yes', survived ? 'yes' : 'no', expAfter.status);

	// Active roster (removed_at="") omits the tombstone; the unguarded query keeps it.
	const guarded = await pbRequest(
		'GET',
		`/api/collections/trip_members/records?perPage=200&filter=${filterQuery(fixture.tripId, ' && removed_at=""')}`,
		{ token: tokens.owner }
	);
	const inGuarded = (guarded.data?.items || []).some((r) => r.id === fixture.memberIds.traveler);
	recordResult('trip_members', 'roster_excludes_tombstone', 'owner', 'yes', !inGuarded ? 'yes' : 'no', guarded.status);

	const all = await pbRequest(
		'GET',
		`/api/collections/trip_members/records?perPage=200&filter=${filterQuery(fixture.tripId, '')}`,
		{ token: tokens.owner }
	);
	const inAll = (all.data?.items || []).some((r) => r.id === fixture.memberIds.traveler);
	recordResult('trip_members', 'tombstone_retained', 'owner', 'yes', inAll ? 'yes' : 'no', all.status);

	// --- #238 zero-ref purge. The name-only spare authors nothing and holds no
	// votes, so it is the canonical zero-reference member: removing it HARD-DELETES
	// the row (not a tombstone). Assert the hook reports deleted:true AND the row is
	// gone from even the unguarded all-rows query (a tombstone would still be there).
	fixture = await setupFixture();
	const purge = await pbRequest('POST', '/api/members/remove', {
		token: tokens.owner,
		body: { member_id: fixture.memberIds.spare }
	});
	const purgedDeleted = purge.status === 200 && purge.data?.deleted === true;
	recordResult('trip_members', 'zeroref_purged_deleted', 'owner', 'yes', purgedDeleted ? 'yes' : 'no', purge.status);

	// The row is hard-deleted: absent from the unguarded query (no removed_at filter),
	// and a direct GET 404s.
	const allRows = await pbRequest(
		'GET',
		`/api/collections/trip_members/records?perPage=200&filter=${filterQuery(fixture.tripId, '')}`,
		{ token: tokens.owner }
	);
	const spareStillPresent = (allRows.data?.items || []).some((r) => r.id === fixture.memberIds.spare);
	const directGet = await pbRequest('GET', `/api/collections/trip_members/records/${fixture.memberIds.spare}`, {
		token: tokens.owner
	});
	const rowGone = !spareStillPresent && directGet.status === 404;
	recordResult('trip_members', 'zeroref_row_gone', 'owner', 'yes', rowGone ? 'yes' : 'no', directGet.status);
}

function printMemberRemovalReport() {
	console.log('\n[#133/#238 removal — member-with-data tombstones (money survives); zero-ref member purges]');
	for (const r of results.filter((x) => MEMBER_REMOVAL_OPS.includes(x.op))) {
		const mark = r.passed ? 'PASS' : 'FAIL';
		console.log(`  ${mark} ${r.collection}.${r.op} as ${r.role}: expected=${r.expected} actual=${r.actual}/${r.status}`);
	}
}

// --- #238 schema-introspection DRIFT test ----------------------------------
// This is what makes the zero-ref purge afk-safe. The remove hook's reference
// scan (members.pb.js → MEMBER_RELATION_FIELDS) must enumerate EVERY relation
// field that targets trip_members — a miss means a member could be hard-deleted
// while still referenced, orphaning the id or throwing the prod-400 the tombstone
// model exists to prevent. The hand-maintained list already drifted once (the old
// #238 body missed 6 surfaces).
//
// So: introspect the LIVE schema (superuser GET /api/collections), enumerate every
// relation field whose target is trip_members, and FAIL if one isn't in the
// CANONICAL_MEMBER_RELATIONS set below (which mirrors the hook's constant). A
// future migration that adds a member-relation field then goes RED here until the
// purge check is taught about it.
const DRIFT_OPS = ['schema_covered', 'introspection_ok'];

// Mirror of members.pb.js MEMBER_RELATION_FIELDS (every category — drop / cascade
// / block / split). Keyed "collection.field". Keep in lock-step with the hook.
const CANONICAL_MEMBER_RELATIONS = new Set([
	// block (money + authored + the two the old body missed)
	'expenses.paid_by',
	'expenses.created_by',
	'settlements.from_member',
	'settlements.to_member',
	'settlements.created_by',
	'suggestions.author',
	'suggestions.reviewed_by',
	'trip_goals.created_by',
	'documents.uploaded_by',
	// memories (#269, migration 0058) — block; never reassigned (unique (day,
	// author) cap + personal expression), dropped on cascade disposition.
	'memories.author',
	'items.created_by',
	'items.paid_by',
	'items.booked_by',
	'items.assigned_to',
	'tasks.assignee',
	'checklist_items.checked_by',
	'notifications.recipient',
	// money_units (#230, migration 0050) — added at wave-M integration when the
	// drift test flagged it MISSING from the purge reference list.
	'money_units.members',
	'money_units.created_by',
	// scenarios (#337, migration 0063) — champion is authored content (block).
	'scenarios.champion',
	// drop (votes + scenario weigh-ins — always dropped before the reference scan)
	'votes.member',
	'goal_votes.member',
	'suggestion_votes.member',
	'scenario_votes.member',
	'scenario_points.member',
	// cascade (PB cascadeDelete + no identity to preserve)
	'pending_invites.invited_by',
	'join_tokens.created_by'
]);

async function runMemberRelationDriftCase() {
	const token = await superuserToken();
	if (!token) {
		// Auth unavailable — record an explicit FAIL so the harness goes red rather
		// than silently skipping the drift guard.
		recordResult('trip_members', 'introspection_ok', 'superuser', 'yes', 'no', 0);
		recordResult('trip_members', 'schema_covered', 'superuser', 'yes', 'unknown', 0);
		return;
	}

	const res = await pbRequest('GET', '/api/collections?perPage=500', { token: 'Bearer ' + token });
	const cols = res.data?.items;
	const introspected = res.status === 200 && Array.isArray(cols);
	recordResult('trip_members', 'introspection_ok', 'superuser', 'yes', introspected ? 'yes' : 'no', res.status);
	if (!introspected) return;

	// Resolve the trip_members collection id (relation fields reference by id).
	const tripMembers = cols.find((c) => c.name === 'trip_members');
	if (!tripMembers) {
		recordResult('trip_members', 'schema_covered', 'superuser', 'yes', 'no_trip_members', res.status);
		return;
	}
	const tripMembersId = tripMembers.id;

	// Enumerate every relation field across all collections targeting trip_members.
	// PB 0.27 exposes fields at collection.fields[]; the relation target is
	// field.collectionId (older shapes nest it under field.options.collectionId).
	const found = []; // "collection.field" strings
	for (const col of cols) {
		const fields = col.fields || col.schema || [];
		for (const f of fields) {
			if (f.type !== 'relation') continue;
			const targetId = f.collectionId || (f.options && f.options.collectionId);
			if (targetId === tripMembersId) {
				found.push(`${col.name}.${f.name}`);
			}
		}
	}

	// DRIFT: any live member-relation field not in the canonical (hook) set.
	const uncovered = found.filter((key) => !CANONICAL_MEMBER_RELATIONS.has(key));
	const covered = uncovered.length === 0;
	recordResult(
		'trip_members',
		'schema_covered',
		'superuser',
		'yes',
		covered ? 'yes' : `MISSING:${uncovered.join(',')}`,
		res.status
	);
	if (!covered) {
		console.log(
			`  ⚠️  DRIFT — these trip_members relation fields are NOT in members.pb.js ` +
				`MEMBER_RELATION_FIELDS / the harness CANONICAL_MEMBER_RELATIONS:\n     ${uncovered.join('\n     ')}\n` +
				`     Add them to the purge reference check (block unless cascadeDelete) before this can ship.`
		);
	}
}

function printMemberRelationDriftReport() {
	console.log('\n[#238 schema drift — every trip_members relation field is covered by the purge check]');
	for (const r of results.filter((x) => DRIFT_OPS.includes(x.op))) {
		const mark = r.passed ? 'PASS' : 'FAIL';
		console.log(`  ${mark} ${r.collection}.${r.op} as ${r.role}: expected=${r.expected} actual=${r.actual}/${r.status}`);
	}
}

// --- #279 (AUTHZ-1) trip_members role + delete gate ------------------------
// The fixed matrix proves the wide gates (delete is now OWNER_COOWNER_ONLY), but
// the load-bearing #279 behaviors need bespoke cases via direct PB REST:
//   - a viewer/traveler CANNOT change any member's `role` (incl. their OWN row) —
//     the self-escalation-to-owner exploit the issue describes;
//   - owner/co_owner CAN change a role directly (the privileged path);
//   - a non-role edit (display_name) still works for every member, incl. self;
//   - a member may DELETE their own row (self-leave), but the sole active owner
//     cannot be deleted (even by themselves).
// Each mutating case uses a fresh fixture. trip_members.update PATCHes hit the
// caller's OWN row (resolved from the fixture memberIds) for the self-escalation
// cases, and other members' rows for the cross-member cases.
const MEMBER_ROLE_GATE_OPS = [
	'self_escalate_viewer',
	'self_escalate_traveler',
	'escalate_other_traveler',
	'owner_change_role_ok',
	'coowner_change_role_ok',
	'self_display_name_viewer',
	'self_display_name_traveler',
	'self_leave_allowed_by_hook',
	'delete_sole_owner_denied'
];

async function runMemberRoleGateNovelCases(tokens) {
	// 1. Viewer self-escalates to owner on their OWN row → deny.
	let fixture = await setupFixture();
	const vEsc = await pbRequest('PATCH', `/api/collections/trip_members/records/${fixture.memberIds.viewer}`, {
		token: tokens.viewer,
		body: { role: 'owner' }
	});
	recordResult('trip_members', 'self_escalate_viewer', 'viewer', 'deny', classifyWrite(vEsc.status), vEsc.status);

	// 2. Traveler self-escalates to co_owner on their OWN row → deny.
	fixture = await setupFixture();
	const tEsc = await pbRequest('PATCH', `/api/collections/trip_members/records/${fixture.memberIds.traveler}`, {
		token: tokens.traveler,
		body: { role: 'co_owner' }
	});
	recordResult('trip_members', 'self_escalate_traveler', 'traveler', 'deny', classifyWrite(tEsc.status), tEsc.status);

	// 3. Traveler escalates ANOTHER member (the viewer) to owner → deny.
	fixture = await setupFixture();
	const tOther = await pbRequest('PATCH', `/api/collections/trip_members/records/${fixture.memberIds.viewer}`, {
		token: tokens.traveler,
		body: { role: 'owner' }
	});
	recordResult('trip_members', 'escalate_other_traveler', 'traveler', 'deny', classifyWrite(tOther.status), tOther.status);

	// 4. Owner promotes the traveler to co_owner directly → allow (privileged path).
	fixture = await setupFixture();
	const oChange = await pbRequest('PATCH', `/api/collections/trip_members/records/${fixture.memberIds.traveler}`, {
		token: tokens.owner,
		body: { role: 'co_owner' }
	});
	recordResult('trip_members', 'owner_change_role_ok', 'owner', 'allow', classifyWrite(oChange.status), oChange.status);

	// 5. Co_owner changes the viewer to traveler → allow.
	fixture = await setupFixture();
	const coChange = await pbRequest('PATCH', `/api/collections/trip_members/records/${fixture.memberIds.viewer}`, {
		token: tokens.co_owner,
		body: { role: 'traveler' }
	});
	recordResult('trip_members', 'coowner_change_role_ok', 'co_owner', 'allow', classifyWrite(coChange.status), coChange.status);

	// 6. Viewer edits their OWN display_name (no role change) → allow (the edit the
	//    roster UI does; the hook only gates role changes).
	fixture = await setupFixture();
	const vName = await pbRequest('PATCH', `/api/collections/trip_members/records/${fixture.memberIds.viewer}`, {
		token: tokens.viewer,
		body: { display_name: 'Viewer renamed self' }
	});
	recordResult('trip_members', 'self_display_name_viewer', 'viewer', 'allow', classifyWrite(vName.status), vName.status);

	// 7. Traveler edits their OWN display_name → allow.
	fixture = await setupFixture();
	const tName = await pbRequest('PATCH', `/api/collections/trip_members/records/${fixture.memberIds.traveler}`, {
		token: tokens.traveler,
		body: { display_name: 'Traveler renamed self' }
	});
	recordResult('trip_members', 'self_display_name_traveler', 'traveler', 'allow', classifyWrite(tName.status), tName.status);

	// 8. Self-leave is PERMITTED BY THE HOOK (a non-owner may delete their OWN row).
	//    The fixture traveler authored a trip_goal (created_by, required + non-cascade),
	//    so a RAW collection DELETE 400s on the PB FK constraint — which is exactly
	//    why the product's real self-leave goes through /api/members/remove (tombstone,
	//    no hard delete). What this case proves is that trip_members.pb.js does NOT
	//    403 a self-leave on the authority gate (a 403 would mean the hook wrongly
	//    blocked the member from leaving). So the pass condition is "not 403": 204
	//    (no references) or 400 (FK) are both the hook letting it through.
	fixture = await setupFixture();
	const selfLeave = await pbRequest('DELETE', `/api/collections/trip_members/records/${fixture.memberIds.traveler}`, {
		token: tokens.traveler
	});
	recordResult('trip_members', 'self_leave_allowed_by_hook', 'traveler', 'yes', selfLeave.status !== 403 ? 'yes' : 'no', selfLeave.status);

	// 9. Owner tries to DELETE their OWN row while sole owner → deny (sole-owner cap).
	fixture = await setupFixture();
	const soleOwner = await pbRequest('DELETE', `/api/collections/trip_members/records/${fixture.memberIds.owner}`, {
		token: tokens.owner
	});
	recordResult('trip_members', 'delete_sole_owner_denied', 'owner', 'deny', classifyWrite(soleOwner.status), soleOwner.status);
}

function printMemberRoleGateReport() {
	console.log('\n[#279 trip_members — block role escalation, gate cross-member delete, allow self-leave + display_name; sole-owner cap]');
	for (const r of results.filter((x) => MEMBER_ROLE_GATE_OPS.includes(x.op))) {
		const mark = r.passed ? 'PASS' : 'FAIL';
		console.log(`  ${mark} ${r.collection}.${r.op} as ${r.role}: expected=${r.expected} actual=${r.actual}/${r.status}`);
	}
}

// --- #280 (AUTHZ-2) trips lifecycle/publishing role gate -------------------
// The fixed trips.update matrix PATCHes location_summary (an ORDINARY field) and
// stays ALLOW_MEMBERS_DENY_NONMEMBER — proving the gate doesn't over-reach. These
// cases drive the PROTECTED fields (archived / archive_publish_at / archive_enabled
// / archive_show_budget / public_share_token / auto_approve_suggestions): a
// viewer + traveler must be denied each, owner/co_owner must still pass, an
// ordinary title+date edit by a traveler must still work, and the day-reconcile
// hook must still run after the gate when an owner changes the dates.
const TRIPS_GATE_OPS = [
	'protected_viewer_archived',
	'protected_traveler_publish',
	'protected_traveler_share_token',
	'protected_traveler_autoapprove',
	'protected_owner_archive_enabled',
	'protected_coowner_publish_at',
	'ordinary_traveler_title_date',
	'reconcile_after_gate'
];

async function runTripsGateNovelCases(tokens) {
	// 1. Viewer flips archived → deny.
	let fixture = await setupFixture();
	const vArch = await pbRequest('PATCH', `/api/collections/trips/records/${fixture.tripId}`, {
		token: tokens.viewer,
		body: { archived: true }
	});
	recordResult('trips', 'protected_viewer_archived', 'viewer', 'deny', classifyWrite(vArch.status), vArch.status);

	// 2. Traveler enables publishing (archive_enabled + archive_publish_at) → deny —
	//    the issue's headline "push the private itinerary public" exploit.
	fixture = await setupFixture();
	const tPub = await pbRequest('PATCH', `/api/collections/trips/records/${fixture.tripId}`, {
		token: tokens.traveler,
		body: { archive_enabled: true, archive_publish_at: '2026-06-02 00:00:00.000Z' }
	});
	recordResult('trips', 'protected_traveler_publish', 'traveler', 'deny', classifyWrite(tPub.status), tPub.status);

	// 3. Traveler sets a public_share_token → deny.
	fixture = await setupFixture();
	const tTok = await pbRequest('PATCH', `/api/collections/trips/records/${fixture.tripId}`, {
		token: tokens.traveler,
		body: { public_share_token: 'sneaky-token-' + Date.now() }
	});
	recordResult('trips', 'protected_traveler_share_token', 'traveler', 'deny', classifyWrite(tTok.status), tTok.status);

	// 4. Traveler flips auto_approve_suggestions → deny (self-promote their own ghosts).
	fixture = await setupFixture();
	const tAuto = await pbRequest('PATCH', `/api/collections/trips/records/${fixture.tripId}`, {
		token: tokens.traveler,
		body: { auto_approve_suggestions: true }
	});
	recordResult('trips', 'protected_traveler_autoapprove', 'traveler', 'deny', classifyWrite(tAuto.status), tAuto.status);

	// 5. Owner sets archive_enabled → allow (privileged path unaffected).
	fixture = await setupFixture();
	const oArch = await pbRequest('PATCH', `/api/collections/trips/records/${fixture.tripId}`, {
		token: tokens.owner,
		body: { archive_enabled: true }
	});
	recordResult('trips', 'protected_owner_archive_enabled', 'owner', 'allow', classifyWrite(oArch.status), oArch.status);

	// 6. Co_owner sets archive_publish_at (the date field) → allow.
	fixture = await setupFixture();
	const coPub = await pbRequest('PATCH', `/api/collections/trips/records/${fixture.tripId}`, {
		token: tokens.co_owner,
		body: { archive_publish_at: '2026-06-03 00:00:00.000Z' }
	});
	recordResult('trips', 'protected_coowner_publish_at', 'co_owner', 'allow', classifyWrite(coPub.status), coPub.status);

	// 7. Traveler edits ordinary fields (title + dates) → allow (MEMBER allowance kept).
	fixture = await setupFixture();
	const tOrdinary = await pbRequest('PATCH', `/api/collections/trips/records/${fixture.tripId}`, {
		token: tokens.traveler,
		body: { title: 'Traveler renamed trip', start_date: '2026-06-01 00:00:00.000Z', end_date: '2026-06-04 00:00:00.000Z' }
	});
	recordResult('trips', 'ordinary_traveler_title_date', 'traveler', 'allow', classifyWrite(tOrdinary.status), tOrdinary.status);

	// 8. Day-reconcile still runs after the gate: owner extends the trip by a day,
	//    the new day must be materialized by the reconcile handler that runs after
	//    the gate calls e.next(). Fixture trip is 2026-06-01..03 (3 days); extend to
	//    06-04 and assert a day for 2026-06-04 now exists.
	fixture = await setupFixture();
	const ext = await pbRequest('PATCH', `/api/collections/trips/records/${fixture.tripId}`, {
		token: tokens.owner,
		body: { end_date: '2026-06-04 00:00:00.000Z' }
	});
	let reconciled = false;
	if (ext.status >= 200 && ext.status < 300) {
		const days = await pbRequest(
			'GET',
			`/api/collections/days/records?perPage=200&filter=${filterQuery(fixture.tripId, '')}`,
			{ token: tokens.owner }
		);
		reconciled = (days.data?.items || []).some((d) => (d.date || '').substring(0, 10) === '2026-06-04');
	}
	recordResult('trips', 'reconcile_after_gate', 'owner', 'yes', reconciled ? 'yes' : 'no', ext.status);
}

function printTripsGateReport() {
	console.log('\n[#280 trips — gate archive/publish/share/auto-approve to owner·co_owner; ordinary edits + day-reconcile unaffected]');
	for (const r of results.filter((x) => TRIPS_GATE_OPS.includes(x.op))) {
		const mark = r.passed ? 'PASS' : 'FAIL';
		console.log(`  ${mark} ${r.collection}.${r.op} as ${r.role}: expected=${r.expected} actual=${r.actual}/${r.status}`);
	}
}

// --- #281 (AUTHZ-6) money_units edit/delete gate ---------------------------
// money_units isn't in the fixed COLLECTIONS matrix (the fixture seeds none), so
// these cases create a unit and drive money_units.pb.js directly. Unit membership
// = [co_owner, traveler] (a "couple"); viewer is the outside member, owner is the
// outside admin. Asserts:
//   - a non-unit member (viewer) cannot self-add, edit, or delete the unit;
//   - an existing unit member (traveler) can self-remove and delete the unit;
//   - an existing unit member (co_owner) can add another member (the consent path);
//   - an owner (not in the unit) can manage it.
// created_by / members hold trip_members.id. Each mutating case rebuilds the unit
// on a fresh fixture so state doesn't leak between cases.
const MONEY_UNIT_OPS = [
	'nonmember_self_add_denied',
	'nonmember_edit_denied',
	'nonmember_delete_denied',
	'member_self_remove_ok',
	'member_delete_ok',
	'member_consent_add_ok',
	'owner_manage_ok'
];

async function makeMoneyUnit(tokens, fixture) {
	// Owner declares a unit of {co_owner, traveler}. createRule = MEMBER_VIA_TRIP.
	const res = await pbRequest('POST', '/api/collections/money_units/records', {
		token: tokens.owner,
		body: {
			trip: fixture.tripId,
			members: [fixture.memberIds.co_owner, fixture.memberIds.traveler],
			created_by: fixture.memberIds.owner
		}
	});
	return res.data?.id;
}

async function runMoneyUnitNovelCases(tokens) {
	// 1. Viewer (not in unit, not privileged) PATCHes members to insert their OWN id
	//    → deny (the "silently joining a couple's pool" exploit).
	let fixture = await setupFixture();
	let unitId = await makeMoneyUnit(tokens, fixture);
	const vAdd = await pbRequest('PATCH', `/api/collections/money_units/records/${unitId}`, {
		token: tokens.viewer,
		body: { members: [fixture.memberIds.co_owner, fixture.memberIds.traveler, fixture.memberIds.viewer] }
	});
	recordResult('money_units', 'nonmember_self_add_denied', 'viewer', 'deny', classifyWrite(vAdd.status), vAdd.status);

	// 2. Viewer edits the unit's budget (not in unit) → deny.
	fixture = await setupFixture();
	unitId = await makeMoneyUnit(tokens, fixture);
	const vEdit = await pbRequest('PATCH', `/api/collections/money_units/records/${unitId}`, {
		token: tokens.viewer,
		body: { budget_usd: 999 }
	});
	recordResult('money_units', 'nonmember_edit_denied', 'viewer', 'deny', classifyWrite(vEdit.status), vEdit.status);

	// 3. Viewer deletes the unit → deny.
	fixture = await setupFixture();
	unitId = await makeMoneyUnit(tokens, fixture);
	const vDel = await pbRequest('DELETE', `/api/collections/money_units/records/${unitId}`, {
		token: tokens.viewer
	});
	recordResult('money_units', 'nonmember_delete_denied', 'viewer', 'deny', classifyWrite(vDel.status), vDel.status);

	// 4. Traveler (in unit) removes ONLY themselves → allow (the consent valve).
	fixture = await setupFixture();
	unitId = await makeMoneyUnit(tokens, fixture);
	const tLeave = await pbRequest('PATCH', `/api/collections/money_units/records/${unitId}`, {
		token: tokens.traveler,
		body: { members: [fixture.memberIds.co_owner] }
	});
	recordResult('money_units', 'member_self_remove_ok', 'traveler', 'allow', classifyWrite(tLeave.status), tLeave.status);

	// 5. Traveler (in unit) deletes the whole unit → allow.
	fixture = await setupFixture();
	unitId = await makeMoneyUnit(tokens, fixture);
	const tDel = await pbRequest('DELETE', `/api/collections/money_units/records/${unitId}`, {
		token: tokens.traveler
	});
	recordResult('money_units', 'member_delete_ok', 'traveler', 'allow', classifyWrite(tDel.status), tDel.status);

	// 6. Co_owner (in unit) adds the viewer — an EXISTING member granting entry is
	//    the consent path → allow. (Distinct from case 1: a unit member is doing the
	//    adding, not the joiner self-adding.)
	fixture = await setupFixture();
	unitId = await makeMoneyUnit(tokens, fixture);
	const consent = await pbRequest('PATCH', `/api/collections/money_units/records/${unitId}`, {
		token: tokens.co_owner,
		body: { members: [fixture.memberIds.co_owner, fixture.memberIds.traveler, fixture.memberIds.viewer] }
	});
	recordResult('money_units', 'member_consent_add_ok', 'co_owner', 'allow', classifyWrite(consent.status), consent.status);

	// 7. Owner (NOT in the unit) edits it → allow (trip admin can manage any unit).
	fixture = await setupFixture();
	unitId = await makeMoneyUnit(tokens, fixture);
	const oManage = await pbRequest('PATCH', `/api/collections/money_units/records/${unitId}`, {
		token: tokens.owner,
		body: { budget_usd: 250 }
	});
	recordResult('money_units', 'owner_manage_ok', 'owner', 'allow', classifyWrite(oManage.status), oManage.status);
}

function printMoneyUnitReport() {
	console.log('\n[#281 money_units — unit-member or owner·co_owner edits/deletes; no unilateral self-add; self-removal free]');
	for (const r of results.filter((x) => MONEY_UNIT_OPS.includes(x.op))) {
		const mark = r.passed ? 'PASS' : 'FAIL';
		console.log(`  ${mark} ${r.collection}.${r.op} as ${r.role}: expected=${r.expected} actual=${r.actual}/${r.status}`);
	}
}

// --- #283 (AUTHZ-3) checklists/tasks write gate (block viewers) -------------
// Neither collection is in the fixed matrix and the fixture seeds none, so these
// cases create a checklist + task and drive checklists.pb.js / tasks.pb.js
// directly. CONFIRMED tier (SPEC §4): traveler+ write, viewers read-only. Asserts
// viewers are denied create/update/delete on BOTH collections, and a traveler can
// create + tick a task (the in-app task-management the tier exists for). tasks
// resolve their trip via checklist.trip (no trip field on tasks).
const CHECKLIST_TASK_OPS = [
	'checklist_create_viewer_denied',
	'checklist_create_traveler_ok',
	'checklist_update_viewer_denied',
	'checklist_delete_viewer_denied',
	'task_create_viewer_denied',
	'task_create_traveler_ok',
	'task_update_viewer_denied',
	'task_tick_traveler_ok',
	'task_delete_viewer_denied'
];

async function makeChecklist(tokens, fixture, token) {
	const res = await pbRequest('POST', '/api/collections/checklists/records', {
		token: token || tokens.owner,
		body: { trip: fixture.tripId, title: 'Harness checklist', kind: 'manual', order: 0 }
	});
	return res.data?.id;
}
async function makeTask(tokens, checklistId, token) {
	const res = await pbRequest('POST', '/api/collections/tasks/records', {
		token: token || tokens.owner,
		body: { checklist: checklistId, title: 'Harness task', order: 0 }
	});
	return res.data?.id;
}

async function runChecklistTaskNovelCases(tokens) {
	// --- checklists ---
	// 1. Viewer creates a checklist → deny.
	let fixture = await setupFixture();
	const clVCreate = await pbRequest('POST', '/api/collections/checklists/records', {
		token: tokens.viewer,
		body: { trip: fixture.tripId, title: 'Viewer checklist', kind: 'manual', order: 0 }
	});
	recordResult('checklists', 'checklist_create_viewer_denied', 'viewer', 'deny', classifyWrite(clVCreate.status), clVCreate.status);

	// 2. Traveler creates a checklist → allow (traveler+ tier).
	const clTCreate = await pbRequest('POST', '/api/collections/checklists/records', {
		token: tokens.traveler,
		body: { trip: fixture.tripId, title: 'Traveler checklist', kind: 'manual', order: 1 }
	});
	recordResult('checklists', 'checklist_create_traveler_ok', 'traveler', 'allow', classifyWrite(clTCreate.status), clTCreate.status);

	// 3. Viewer edits an existing checklist → deny.
	fixture = await setupFixture();
	let checklistId = await makeChecklist(tokens, fixture);
	const clVUpdate = await pbRequest('PATCH', `/api/collections/checklists/records/${checklistId}`, {
		token: tokens.viewer,
		body: { title: 'Viewer edit' }
	});
	recordResult('checklists', 'checklist_update_viewer_denied', 'viewer', 'deny', classifyWrite(clVUpdate.status), clVUpdate.status);

	// 4. Viewer deletes a checklist → deny.
	fixture = await setupFixture();
	checklistId = await makeChecklist(tokens, fixture);
	const clVDelete = await pbRequest('DELETE', `/api/collections/checklists/records/${checklistId}`, {
		token: tokens.viewer
	});
	recordResult('checklists', 'checklist_delete_viewer_denied', 'viewer', 'deny', classifyWrite(clVDelete.status), clVDelete.status);

	// --- tasks (trip resolved via checklist.trip) ---
	// 5. Viewer creates a task → deny.
	fixture = await setupFixture();
	checklistId = await makeChecklist(tokens, fixture);
	const tkVCreate = await pbRequest('POST', '/api/collections/tasks/records', {
		token: tokens.viewer,
		body: { checklist: checklistId, title: 'Viewer task', order: 0 }
	});
	recordResult('tasks', 'task_create_viewer_denied', 'viewer', 'deny', classifyWrite(tkVCreate.status), tkVCreate.status);

	// 6. Traveler creates a task → allow.
	const tkTCreate = await pbRequest('POST', '/api/collections/tasks/records', {
		token: tokens.traveler,
		body: { checklist: checklistId, title: 'Traveler task', order: 1 }
	});
	recordResult('tasks', 'task_create_traveler_ok', 'traveler', 'allow', classifyWrite(tkTCreate.status), tkTCreate.status);

	// 7. Viewer ticks/edits a task → deny.
	fixture = await setupFixture();
	checklistId = await makeChecklist(tokens, fixture);
	let taskId = await makeTask(tokens, checklistId);
	const tkVUpdate = await pbRequest('PATCH', `/api/collections/tasks/records/${taskId}`, {
		token: tokens.viewer,
		body: { checked: true }
	});
	recordResult('tasks', 'task_update_viewer_denied', 'viewer', 'deny', classifyWrite(tkVUpdate.status), tkVUpdate.status);

	// 8. Traveler ticks a task → allow (the in-app task management the tier is for).
	const tkTTick = await pbRequest('PATCH', `/api/collections/tasks/records/${taskId}`, {
		token: tokens.traveler,
		body: { checked: true }
	});
	recordResult('tasks', 'task_tick_traveler_ok', 'traveler', 'allow', classifyWrite(tkTTick.status), tkTTick.status);

	// 9. Viewer deletes a task → deny.
	fixture = await setupFixture();
	checklistId = await makeChecklist(tokens, fixture);
	taskId = await makeTask(tokens, checklistId);
	const tkVDelete = await pbRequest('DELETE', `/api/collections/tasks/records/${taskId}`, {
		token: tokens.viewer
	});
	recordResult('tasks', 'task_delete_viewer_denied', 'viewer', 'deny', classifyWrite(tkVDelete.status), tkVDelete.status);
}

function printChecklistTaskReport() {
	console.log('\n[#283 checklists/tasks — viewers blocked on write (traveler+ tier, SPEC §4)]');
	for (const r of results.filter((x) => CHECKLIST_TASK_OPS.includes(x.op))) {
		const mark = r.passed ? 'PASS' : 'FAIL';
		console.log(`  ${mark} ${r.collection}.${r.op} as ${r.role}: expected=${r.expected} actual=${r.actual}/${r.status}`);
	}
}

// --- #118 shared Join Link novel cases -------------------------------------
const JOIN_LINK_OPS = [
	'create_co_owner_denied',
	'create_traveler_ok',
	'create_viewer_ok',
	'create_duplicate_denied',
	'anon_lookup_minimal',
	'accept_traveler_ok',
	'joined_role_traveler',
	'accept_viewer_ok',
	'joined_role_viewer',
	'traveler_manage_ok',
	'viewer_manage_denied',
	'revoke_ok',
	'revoked_lookup_404',
	'revoked_accept_denied',
	'clamp_claim_ok',
	'clamp_role_viewer',
	'picker_includes_live',
	'picker_excludes_tombstone',
	'closed_create_denied',
	'expired_lookup_flag',
	'expired_accept_denied'
];

async function runJoinLinkNovelCases(tokens) {
	// A FUTURE-dated trip — join-link expiry is capped at trip end, so a link on
	// the standard (past-dated) fixture trip is born expired. We exploit that on
	// purpose for the expiry cells at the end, but the happy-path joins need a
	// live window.
	const fixture = await setupFixture();
	const ownerUserId = fixture.userIds.owner;

	const slug = 'e2e-joinlink-' + Date.now();
	// Dates MUST be relative to now, not hardcoded: join-link expiry is capped at
	// trip end, so a link on a past-dated trip is born expired. Hardcoded
	// 2026-06-15..2026-06-25 dates silently rotted past once the wall clock crossed
	// them (every happy-path join cell went red as "expired"). Anchor the window
	// tomorrow..+30d so the link always has a live future window.
	const toPbDate = (d) => d.toISOString().replace('T', ' ').replace('Z', '') + 'Z';
	const jlStart = toPbDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
	const jlEnd = toPbDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
	const tripRes = await pbRequest('POST', '/api/collections/trips/records', {
		token: tokens.owner,
		body: {
			slug,
			title: 'Join Link Test Trip',
			start_date: jlStart,
			end_date: jlEnd,
			timezone: 'UTC',
			created_by: ownerUserId
		}
	});
	const tripId = tripRes.data?.id;

	// 1. Role cap — a co_owner join link is never mintable (Resolution 1/8).
	const capRes = await pbRequest('POST', '/api/join/create', {
		token: tokens.owner,
		body: { trip_id: tripId, role: 'co_owner' }
	});
	recordResult('join_tokens', 'create_co_owner_denied', 'owner', 'deny', classifyWrite(capRes.status), capRes.status);

	// 2. Owner mints a traveler link and a viewer link (both may be live at once).
	const travCreate = await pbRequest('POST', '/api/join/create', {
		token: tokens.owner,
		body: { trip_id: tripId, role: 'traveler' }
	});
	recordResult('join_tokens', 'create_traveler_ok', 'owner', 'allow', classifyWrite(travCreate.status), travCreate.status);
	const travToken = travCreate.data?.token;

	const viewCreate = await pbRequest('POST', '/api/join/create', {
		token: tokens.owner,
		body: { trip_id: tripId, role: 'viewer' }
	});
	recordResult('join_tokens', 'create_viewer_ok', 'owner', 'allow', classifyWrite(viewCreate.status), viewCreate.status);
	const viewToken = viewCreate.data?.token;

	// 3. One link per (trip, role) — a second traveler create is refused.
	const dupRes = await pbRequest('POST', '/api/join/create', {
		token: tokens.owner,
		body: { trip_id: tripId, role: 'traveler' }
	});
	recordResult('join_tokens', 'create_duplicate_denied', 'owner', 'deny', classifyWrite(dupRes.status), dupRes.status);

	// 4. Anon pre-auth lookup — title + dates + role ONLY, no roster (Resolution 6).
	const anonLookup = await pbRequest('POST', '/api/join/lookup', { body: { token: travToken } });
	const minimalOk =
		anonLookup.status === 200 &&
		anonLookup.data?.role === 'traveler' &&
		!!anonLookup.data?.trip_title &&
		!!anonLookup.data?.start_date &&
		anonLookup.data?.expired === false &&
		(anonLookup.data?.unclaimed_placeholders || []).length === 0;
	recordResult('join_tokens', 'anon_lookup_minimal', 'anon', 'yes', minimalOk ? 'yes' : 'no', anonLookup.status);

	// 5. Join at the traveler role — a stranger lands as a traveler.
	const joinTrav = await pbRequest('POST', '/api/join/accept', {
		token: tokens.non_member,
		body: { token: travToken }
	});
	recordResult('join_tokens', 'accept_traveler_ok', 'non_member', 'allow', classifyWrite(joinTrav.status), joinTrav.status);
	const travMem = await pbRequest('GET', `/api/collections/trip_members/records/${joinTrav.data?.member_id}`, {
		token: tokens.owner
	});
	recordResult('join_tokens', 'joined_role_traveler', 'non_member', 'traveler', travMem.data?.role || 'none', travMem.status);

	// 6. Join at the viewer role — a different stranger lands as a viewer.
	const joinView = await pbRequest('POST', '/api/join/accept', {
		token: tokens.viewer,
		body: { token: viewToken }
	});
	recordResult('join_tokens', 'accept_viewer_ok', 'viewer', 'allow', classifyWrite(joinView.status), joinView.status);
	const viewMem = await pbRequest('GET', `/api/collections/trip_members/records/${joinView.data?.member_id}`, {
		token: tokens.owner
	});
	recordResult('join_tokens', 'joined_role_viewer', 'viewer', 'viewer', viewMem.data?.role || 'none', viewMem.status);

	// 7. Management authority (#152) — a TRAVELER may now manage links (parity with
	// email invites); a VIEWER still may not. The freshly-joined traveler (step 5)
	// revokes the TRAVELER link — already consumed, and step 8 re-revokes it — so
	// this allow leaves the viewer link untouched for the clamp/picker cases below.
	// The viewer (step 6) is then refused, pinning the boundary; a denied revoke
	// throws before mutating, so the viewer link stays live.
	const travManage = await pbRequest('POST', '/api/join/revoke', {
		token: tokens.non_member,
		body: { trip_id: tripId, role: 'traveler' }
	});
	recordResult('join_tokens', 'traveler_manage_ok', 'traveler', 'allow', classifyWrite(travManage.status), travManage.status);

	const viewerManage = await pbRequest('POST', '/api/join/revoke', {
		token: tokens.viewer,
		body: { trip_id: tripId, role: 'viewer' }
	});
	recordResult('join_tokens', 'viewer_manage_denied', 'viewer', 'deny', classifyWrite(viewerManage.status), viewerManage.status);

	// 8. Revoke — the old traveler token 404s on lookup and is refused on accept.
	const revRes = await pbRequest('POST', '/api/join/revoke', {
		token: tokens.owner,
		body: { trip_id: tripId, role: 'traveler' }
	});
	recordResult('join_tokens', 'revoke_ok', 'owner', 'allow', classifyWrite(revRes.status), revRes.status);
	const revLookup = await pbRequest('POST', '/api/join/lookup', { body: { token: travToken } });
	recordResult('join_tokens', 'revoked_lookup_404', 'anon', 'yes', revLookup.status === 404 ? 'yes' : 'no', revLookup.status);
	const revAccept = await pbRequest('POST', '/api/join/accept', {
		token: tokens.co_owner,
		body: { token: travToken }
	});
	recordResult('join_tokens', 'revoked_accept_denied', 'co_owner', 'deny', classifyWrite(revAccept.status), revAccept.status);

	// 9. Clamp invariant — a name-only co_owner placeholder claimed through the
	// VIEWER link lands as a viewer (never above the link cap).
	const clampPh = await pbRequest('POST', '/api/members/add-placeholder', {
		token: tokens.owner,
		body: { trip_id: tripId, display_name: 'Clamp Target', role: 'co_owner' }
	});
	const clampJoin = await pbRequest('POST', '/api/join/accept', {
		token: tokens.co_owner,
		body: { token: viewToken, claim_placeholder: clampPh.data?.member_id }
	});
	recordResult('join_tokens', 'clamp_claim_ok', 'co_owner', 'allow', classifyWrite(clampJoin.status), clampJoin.status);
	const clampMem = await pbRequest('GET', `/api/collections/trip_members/records/${clampPh.data?.member_id}`, {
		token: tokens.owner
	});
	recordResult('join_tokens', 'clamp_role_viewer', 'co_owner', 'viewer', clampMem.data?.role || 'none', clampMem.status);

	// 10. Tombstone exclusion from the claim picker — a live name-only placeholder
	// is offered; a Departed Member (#133) is not.
	const liveph = await pbRequest('POST', '/api/members/add-placeholder', {
		token: tokens.owner,
		body: { trip_id: tripId, display_name: 'Live Spare', role: 'traveler' }
	});
	const tombph = await pbRequest('POST', '/api/members/add-placeholder', {
		token: tokens.owner,
		body: { trip_id: tripId, display_name: 'Tomb Spare', role: 'traveler' }
	});
	await pbRequest('POST', '/api/members/remove', {
		token: tokens.owner,
		body: { member_id: tombph.data?.member_id }
	});
	const authLookup = await pbRequest('POST', '/api/join/lookup', {
		token: tokens.owner,
		body: { token: viewToken }
	});
	const picker = authLookup.data?.unclaimed_placeholders || [];
	const hasLive = picker.some((p) => p.member_id === liveph.data?.member_id);
	const hasTomb = picker.some((p) => p.member_id === tombph.data?.member_id);
	recordResult('join_tokens', 'picker_includes_live', 'owner', 'yes', hasLive ? 'yes' : 'no', authLookup.status);
	recordResult('join_tokens', 'picker_excludes_tombstone', 'owner', 'yes', !hasTomb ? 'yes' : 'no', authLookup.status);

	// 11. Closed trip — archiving the trip disables link creation (Resolution 3).
	await pbRequest('PATCH', `/api/collections/trips/records/${tripId}`, {
		token: tokens.owner,
		body: { archived: true }
	});
	const closedCreate = await pbRequest('POST', '/api/join/create', {
		token: tokens.owner,
		body: { trip_id: tripId, role: 'viewer' }
	});
	recordResult('join_tokens', 'closed_create_denied', 'owner', 'deny', classifyWrite(closedCreate.status), closedCreate.status);

	// 12. Expiry — a link on the past-dated fixture trip is born expired (cap = trip
	// end). Lookup flags it; accept refuses it.
	const expLink = await pbRequest('POST', '/api/join/create', {
		token: tokens.owner,
		body: { trip_id: fixture.tripId, role: 'viewer' }
	});
	const expLookup = await pbRequest('POST', '/api/join/lookup', { body: { token: expLink.data?.token } });
	recordResult('join_tokens', 'expired_lookup_flag', 'anon', 'yes', expLookup.data?.expired === true ? 'yes' : 'no', expLookup.status);
	const expAccept = await pbRequest('POST', '/api/join/accept', {
		token: tokens.non_member,
		body: { token: expLink.data?.token }
	});
	recordResult('join_tokens', 'expired_accept_denied', 'non_member', 'deny', classifyWrite(expAccept.status), expAccept.status);
}

function printJoinLinkReport() {
	console.log('\n[#118 shared join link — role cap, join-at-role, revoke/expiry, clamp, tombstone exclusion]');
	for (const r of results.filter((x) => JOIN_LINK_OPS.includes(x.op))) {
		const mark = r.passed ? 'PASS' : 'FAIL';
		console.log(`  ${mark} ${r.collection}.${r.op} as ${r.role}: expected=${r.expected} actual=${r.actual}/${r.status}`);
	}
}

// #269 (ADR-0007) — memories novel cases. The fixed matrix proves membership +
// author-as-self + author-only; these drive the two load-bearing constraints it
// can't express: the unique (day, author) CAP (the feature's whole personality)
// and the at-least-one-of {photo, thought} hook (create + the clear-both update
// backstop). Plus one multipart photo-only create, so the file path (mimeTypes,
// pending-upload detection in the hook) is exercised — the matrix creates are
// thought-only JSON.
const MEMORIES_OPS = ['photo_create', 'cap_second_memory', 'empty_create', 'clear_both_update'];

async function runMemoriesNovelCases(tokens) {
	const fixture = await setupFixture();

	// 1. PHOTO-ONLY multipart create (owner, day2) → allow. No thought; the
	//    pending-upload photo alone must satisfy the at-least-one-of hook.
	const form = new FormData();
	form.set('trip', fixture.tripId);
	form.set('day', fixture.dayId2);
	form.set('author', fixture.memberIds.owner);
	form.set('photo', new Blob([PNG_1x1], { type: 'image/png' }), 'memory.png');
	const photo = await pbRequest('POST', '/api/collections/memories/records', {
		token: tokens.owner,
		form
	});
	recordResult('memories', 'photo_create', 'owner', 'allow', classifyWrite(photo.status), photo.status);

	// 2. THE CAP — owner already holds the seeded (day1, owner) slot; a second
	//    memory on day1 must 400 on the unique index → deny. Editing replaces;
	//    two memories for the same member+day can never exist (ADR-0007).
	const dup = await pbRequest('POST', '/api/collections/memories/records', {
		token: tokens.owner,
		body: {
			trip: fixture.tripId,
			day: fixture.dayId,
			author: fixture.memberIds.owner,
			thought: 'Second memory, same day — must never exist'
		}
	});
	recordResult('memories', 'cap_second_memory', 'owner', 'deny', classifyWrite(dup.status), dup.status);

	// 3. EMPTY create — neither photo nor thought → deny (memories.pb.js: a
	//    record with neither does not exist). Traveler on day2 (their slot is
	//    free, so the rejection is the hook's, not the index's).
	const empty = await pbRequest('POST', '/api/collections/memories/records', {
		token: tokens.traveler,
		body: { trip: fixture.tripId, day: fixture.dayId2, author: fixture.memberIds.traveler }
	});
	recordResult('memories', 'empty_create', 'traveler', 'deny', classifyWrite(empty.status), empty.status);

	// 4. CLEAR-BOTH update backstop — the fixture memory is thought-only; the
	//    author PATCHing thought:'' would empty the record → deny (the app
	//    composer deletes instead; a direct API clear-both must be rejected).
	const clear = await pbRequest('PATCH', `/api/collections/memories/records/${fixture.memoryId}`, {
		token: tokens.owner,
		body: { thought: '' }
	});
	recordResult('memories', 'clear_both_update', 'owner', 'deny', classifyWrite(clear.status), clear.status);
}

function printMemoriesReport() {
	console.log('\n[#269 memories — cap (day,author), at-least-one-of hook, photo multipart]');
	for (const r of results.filter((x) => MEMORIES_OPS.includes(x.op))) {
		const mark = r.passed ? 'PASS' : 'FAIL';
		console.log(`  ${mark} ${r.collection}.${r.op} as ${r.role}: expected=${r.expected} actual=${r.actual}/${r.status}`);
	}
}

// #337 — the champion-only edit/delete gate (scenarios.pb.js). The fixed matrix's
// SELF_ONLY on the OWNER-championed fixture proves "only the champion edits", but
// it conflates champion with owner — a co_owner/traveler denial there could be a
// role denial, not a non-champion denial. These cases disambiguate on a
// TRAVELER-championed scenario:
//   - the traveler-champion CAN edit + delete their own pitch (a non-owner
//     champion has full authority over it);
//   - the OWNER (a non-champion, despite outranking the traveler) CANNOT edit or
//     delete it — "fork instead of edit-war" holds even for owners.
const SCENARIO_CHAMPION_OPS = [
	'champion_edit_own',
	'nonchampion_owner_edit_denied',
	'nonchampion_owner_delete_denied',
	'champion_delete_own'
];

async function runScenarioChampionNovelCases(tokens) {
	// The traveler champions a fresh scenario (create is rule-legal: champion.user =
	// auth && role != "viewer").
	let fixture = await setupFixture();
	let made = await pbRequest('POST', '/api/collections/scenarios/records', {
		token: tokens.traveler,
		body: {
			trip: fixture.tripId,
			title: 'Traveler-championed pitch (#337)',
			champion: fixture.memberIds.traveler,
			status: 'candidate'
		}
	});
	let scenId = made.data?.id;

	// 1. Champion edits their own pitch → allow.
	const editOwn = await pbRequest('PATCH', `/api/collections/scenarios/records/${scenId}`, {
		token: tokens.traveler,
		body: { pitch: 'Champion refines their own pitch' }
	});
	recordResult('scenarios', 'champion_edit_own', 'traveler', 'allow', classifyWrite(editOwn.status), editOwn.status);

	// 2. The OWNER (non-champion) edits the traveler's pitch → deny (fork, don't edit-war).
	const ownerEdit = await pbRequest('PATCH', `/api/collections/scenarios/records/${scenId}`, {
		token: tokens.owner,
		body: { pitch: 'Owner tries to overwrite someone else’s pitch' }
	});
	recordResult('scenarios', 'nonchampion_owner_edit_denied', 'owner', 'deny', classifyWrite(ownerEdit.status), ownerEdit.status);

	// 3. The OWNER (non-champion) deletes the traveler's pitch → deny.
	const ownerDel = await pbRequest('DELETE', `/api/collections/scenarios/records/${scenId}`, {
		token: tokens.owner
	});
	recordResult('scenarios', 'nonchampion_owner_delete_denied', 'owner', 'deny', classifyWrite(ownerDel.status), ownerDel.status);

	// 4. The champion deletes their own pitch → allow. Fresh fixture so the delete
	//    is independent of the edits above.
	fixture = await setupFixture();
	made = await pbRequest('POST', '/api/collections/scenarios/records', {
		token: tokens.traveler,
		body: {
			trip: fixture.tripId,
			title: 'Traveler pitch to delete (#337)',
			champion: fixture.memberIds.traveler,
			status: 'candidate'
		}
	});
	scenId = made.data?.id;
	const champDel = await pbRequest('DELETE', `/api/collections/scenarios/records/${scenId}`, {
		token: tokens.traveler
	});
	recordResult('scenarios', 'champion_delete_own', 'traveler', 'allow', classifyWrite(champDel.status), champDel.status);
}

function printScenarioChampionReport() {
	console.log('\n[#337 scenarios — champion-only edit/delete (non-champion owner denied; fork, don’t edit-war)]');
	for (const r of results.filter((x) => SCENARIO_CHAMPION_OPS.includes(x.op))) {
		const mark = r.passed ? 'PASS' : 'FAIL';
		console.log(`  ${mark} ${r.collection}.${r.op} as ${r.role}: expected=${r.expected} actual=${r.actual}/${r.status}`);
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

	console.log('#248 cases: suggestion_votes (cast, cannot-vote-own, ownership-via-parent, non-member denied)');
	await runSuggestionVotesNovelCases(tokens);

	console.log('#103 cases: co-traveler users cross-read (name+avatar, no email/secrets)');
	fixture = await setupFixture();
	await runUsersCrossReadCases(tokens, fixture);

	console.log('#122 cases: suggestions member-read (comment visible to co-member, sort=created)');
	fixture = await setupFixture();
	await runSuggestionsMemberReadCases(tokens, fixture);

	console.log('#133/#238 cases: removal disposition (member-with-data tombstones; zero-ref purges)');
	await runMemberRemovalNovelCases(tokens);

	console.log('#238 case: member-relation schema drift (purge reference set is complete)');
	await runMemberRelationDriftCase();

	console.log('#279 cases: trip_members role gate (block escalation, gate cross-member delete, self-leave, sole-owner cap)');
	await runMemberRoleGateNovelCases(tokens);

	console.log('#280 cases: trips lifecycle/publishing gate (protected fields owner·co_owner only; ordinary edits + reconcile unaffected)');
	await runTripsGateNovelCases(tokens);

	console.log('#281 cases: money_units edit/delete gate (unit-member or owner·co_owner; no unilateral self-add)');
	await runMoneyUnitNovelCases(tokens);

	console.log('#283 cases: checklists/tasks write gate (viewers blocked, traveler+ allowed)');
	await runChecklistTaskNovelCases(tokens);

	console.log('#118 cases: shared join link (role cap, join-at-role, revoke/expiry, clamp, tombstone)');
	await runJoinLinkNovelCases(tokens);

	console.log('#226 cases: self-assign exception (member toggles only their own assigned_to)');
	await runSelfAssignNovelCases(tokens);

	console.log('#219 cases: creator-edit exception (member edits their own item; cannot delete it)');
	await runCreatorEditNovelCases(tokens);

	console.log('#217 cases: last-phase delete block (deny removing the only phase)');
	await runLastPhaseDeleteCases(tokens);

	console.log('#269 cases: memories (unique (day,author) cap, at-least-one-of, photo multipart)');
	await runMemoriesNovelCases(tokens);

	console.log('#337 cases: scenarios champion-only edit/delete (non-champion owner denied)');
	await runScenarioChampionNovelCases(tokens);

	printReport();
	printNovelReport();
	printSuggestionVotesReport();
	printUsersCrossReadReport();
	printSuggestionsReport();
	printMemberRemovalReport();
	printMemberRelationDriftReport();
	printMemberRoleGateReport();
	printTripsGateReport();
	printMoneyUnitReport();
	printChecklistTaskReport();
	printJoinLinkReport();
	printSelfAssignReport();
	printCreatorEditReport();
	printLastPhaseDeleteReport();
	printMemoriesReport();
	printScenarioChampionReport();

	const failed = results.some((r) => !r.passed);
	exit(failed ? 1 : 0);
}

main().catch((err) => {
	console.error('harness crashed:', err);
	exit(2);
});
