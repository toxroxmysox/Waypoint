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
const COLLECTIONS = ['users', 'trips', 'trip_members', 'phases', 'days', 'items', 'checklist_items', 'pending_invites', 'votes', 'documents'];

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
	users: {
		list: SELF_ONLY,
		view: SELF_ONLY,
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

	printReport();

	const failed = results.some((r) => !r.passed);
	exit(failed ? 1 : 0);
}

main().catch((err) => {
	console.error('harness crashed:', err);
	exit(2);
});
