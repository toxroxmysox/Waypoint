#!/usr/bin/env node
// M2c members harness: add-placeholder, auto-merge (claimable_by), claim,
// promote, remove, invariant enforcement.
//
// Requires:
//   PocketBase running on $PUBLIC_PB_URL (default http://127.0.0.1:8090)
//   WAYPOINT_DEV_MODE=true
//   E2E_TEST_EMAILS=rules-owner@e2e.test,rules-coowner@e2e.test,...
//
// Reuses the /api/dev/rules-fixture to get a fresh trip + role set so the
// harness is self-contained and repeatable.

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

const BASE = process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090';

const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

// ─── helpers ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function pass(label) {
	console.log('  PASS ', label);
	passed++;
}

function fail(label, detail) {
	console.error('  FAIL ', label, detail ? `(${detail})` : '');
	failed++;
}

async function bypass(email) {
	const res = await fetch(`${BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	if (!res.ok) throw new Error(`bypass failed for ${email}: ${res.status}`);
	const { token } = await res.json();
	return token;
}

async function api(method, path, body, token) {
	const res = await fetch(`${BASE}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: 'Bearer ' + token } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});
	let json = null;
	try {
		json = await res.json();
	} catch (_) {}
	return { status: res.status, json };
}

// ─── setup ──────────────────────────────────────────────────────────────────

const tokens = {};
for (const [role, email] of Object.entries(EMAILS)) {
	tokens[role] = await bypass(email);
}

// Create fresh fixture trip.
const fixtureRes = await api('POST', '/api/dev/rules-fixture', { emails: EMAILS }, tokens.owner);
if (fixtureRes.status !== 200) {
	console.error('FATAL: fixture creation failed', fixtureRes.status, fixtureRes.json);
	process.exit(1);
}
const fx = fixtureRes.json;
const tripId = fx.tripId;

console.log('\n[add-placeholder]');

// Owner can add a traveler placeholder.
{
	const r = await api('POST', '/api/members/add-placeholder', {
		trip_id: tripId,
		display_name: 'Jake Placeholder',
		role: 'traveler'
	}, tokens.owner);
	if (r.status === 200 && r.json?.member_id) {
		pass('owner adds traveler placeholder → 200');
		globalThis.jakePlaceholderId = r.json.member_id;
	} else {
		fail('owner adds traveler placeholder → 200', `got ${r.status}`);
	}
}

// Owner can add a co_owner placeholder.
{
	const r = await api('POST', '/api/members/add-placeholder', {
		trip_id: tripId,
		display_name: 'Co-Owner Placeholder',
		role: 'co_owner'
	}, tokens.owner);
	r.status === 200 ? pass('owner adds co_owner placeholder → 200') : fail('owner adds co_owner placeholder → 200', `got ${r.status}`);
	if (r.status === 200) globalThis.coOwnerPlaceholderId = r.json.member_id;
}

// Traveler can add a traveler placeholder.
{
	const r = await api('POST', '/api/members/add-placeholder', {
		trip_id: tripId,
		display_name: 'Traveler-Added Placeholder',
		role: 'traveler'
	}, tokens.traveler);
	if (r.status === 200) {
		pass('traveler adds traveler placeholder → 200');
		globalThis.travelerAddedId = r.json.member_id;
	} else {
		fail('traveler adds traveler placeholder → 200', `got ${r.status}`);
	}
}

// Traveler CANNOT add a co_owner placeholder.
{
	const r = await api('POST', '/api/members/add-placeholder', {
		trip_id: tripId,
		display_name: 'Nope',
		role: 'co_owner'
	}, tokens.traveler);
	r.status === 403 ? pass('traveler cannot add co_owner placeholder → 403') : fail('traveler cannot add co_owner placeholder → 403', `got ${r.status}`);
}

// Viewer CANNOT add any placeholder.
{
	const r = await api('POST', '/api/members/add-placeholder', {
		trip_id: tripId,
		display_name: 'Nope',
		role: 'viewer'
	}, tokens.viewer);
	r.status === 403 ? pass('viewer cannot add placeholder → 403') : fail('viewer cannot add placeholder → 403', `got ${r.status}`);
}

// Non-member cannot add.
{
	const r = await api('POST', '/api/members/add-placeholder', {
		trip_id: tripId,
		display_name: 'Nope',
		role: 'viewer'
	}, tokens.non_member);
	r.status === 403 ? pass('non-member cannot add placeholder → 403') : fail('non-member cannot add placeholder → 403', `got ${r.status}`);
}

// Anon cannot add.
{
	const r = await api('POST', '/api/members/add-placeholder', {
		trip_id: tripId,
		display_name: 'Nope',
		role: 'viewer'
	}, null);
	r.status === 401 ? pass('anon cannot add placeholder → 401') : fail('anon cannot add placeholder → 401', `got ${r.status}`);
}

// Placeholder with email — non_member already has a user account (created by
// the bypass at setup). add-placeholder sets claimable_by immediately when
// the user exists and is not yet a member. This covers the "person already has
// an account" path; the onRecordAfterCreateSuccess hook covers the
// "person signs up later" path.
const claimEmail = EMAILS.non_member;
{
	const r = await api('POST', '/api/members/add-placeholder', {
		trip_id: tripId,
		display_name: 'Future Claimer',
		placeholder_email: claimEmail,
		role: 'viewer'
	}, tokens.owner);
	r.status === 200 ? pass('owner adds placeholder with email → 200') : fail('owner adds placeholder with email → 200', `got ${r.status}`);
	if (r.status === 200) globalThis.emailPlaceholderId = r.json.member_id;
}

// Duplicate placeholder email rejected.
{
	const r = await api('POST', '/api/members/add-placeholder', {
		trip_id: tripId,
		display_name: 'Dupe',
		placeholder_email: claimEmail,
		role: 'viewer'
	}, tokens.owner);
	r.status === 400 ? pass('duplicate placeholder email → 400') : fail('duplicate placeholder email → 400', `got ${r.status}`);
}

console.log('\n[auto-merge / claimable_by]');

// non_member's placeholder was created with their email → add-placeholder
// found the existing user and set claimable_by immediately.
{
	const claimToken = tokens.non_member;

	// /api/members/my-claims should return our placeholder.
	const r = await api('GET', '/api/members/my-claims', null, claimToken);
	if (r.status === 200 && Array.isArray(r.json?.claims)) {
		const match = r.json.claims.find((c) => c.member_id === globalThis.emailPlaceholderId);
		if (match) {
			pass('my-claims returns claimable placeholder (user already existed at add-placeholder time)');
			pass('claim entry has trip_title: ' + (match.trip_title ? 'yes' : 'MISSING'));
			pass('claim entry has placeholder_name: ' + (match.placeholder_name ? 'yes' : 'MISSING'));
			globalThis.claimToken = claimToken;
		} else {
			fail('my-claims: expected placeholder not in list', JSON.stringify(r.json.claims));
		}
	} else {
		fail('my-claims → 200 with claims array', `got ${r.status}`);
	}
}

// my-claims requires auth.
{
	const r = await api('GET', '/api/members/my-claims', null, null);
	r.status === 401 ? pass('my-claims anon → 401') : fail('my-claims anon → 401', `got ${r.status}`);
}

console.log('\n[claim]');

{
	// Accept the claim.
	const r = await api('POST', '/api/members/claim', {
		member_id: globalThis.emailPlaceholderId,
		display_name: 'Jake Claimed'
	}, globalThis.claimToken);
	if (r.status === 200 && r.json?.ok) {
		pass('claim accept → 200');
	} else {
		fail('claim accept → 200', `got ${r.status} ${JSON.stringify(r.json)}`);
	}
}

// Re-claiming already-claimed member → 400.
{
	const r = await api('POST', '/api/members/claim', {
		member_id: globalThis.emailPlaceholderId
	}, globalThis.claimToken);
	r.status === 400 ? pass('re-claim already claimed → 400') : fail('re-claim already claimed → 400', `got ${r.status}`);
}

// my-claims now empty for this user.
{
	const r = await api('GET', '/api/members/my-claims', null, globalThis.claimToken);
	const empty = r.status === 200 && r.json?.claims?.length === 0;
	empty ? pass('my-claims empty after claim') : fail('my-claims empty after claim', `got ${r.status} ${JSON.stringify(r.json)}`);
}

// Claim with wrong user → 403.
{
	const r = await api('POST', '/api/members/claim', {
		member_id: globalThis.emailPlaceholderId
	}, tokens.owner);
	r.status === 403 ? pass('claim wrong user → 403') : fail('claim wrong user → 403', `got ${r.status}`);
}

// Claim requires auth.
{
	const r = await api('POST', '/api/members/claim', { member_id: globalThis.emailPlaceholderId }, null);
	r.status === 401 ? pass('claim anon → 401') : fail('claim anon → 401', `got ${r.status}`);
}

console.log('\n[promote]');

// Owner promotes Jake placeholder (traveler) to co_owner.
const promoteTarget = globalThis.jakePlaceholderId;
{
	const r = await api('POST', '/api/members/promote', { member_id: promoteTarget }, tokens.owner);
	r.status === 200 ? pass('owner promotes traveler → 200') : fail('owner promotes traveler → 200', `got ${r.status}`);
}

// Trying to promote again (now co_owner) → 400.
{
	const r = await api('POST', '/api/members/promote', { member_id: promoteTarget }, tokens.owner);
	r.status === 400 ? pass('promote non-traveler → 400') : fail('promote non-traveler → 400', `got ${r.status}`);
}

// Traveler cannot promote.
{
	const r = await api('POST', '/api/members/promote', { member_id: globalThis.travelerAddedId }, tokens.traveler);
	r.status === 403 ? pass('traveler cannot promote → 403') : fail('traveler cannot promote → 403', `got ${r.status}`);
}

// Viewer cannot promote.
{
	const r = await api('POST', '/api/members/promote', { member_id: globalThis.travelerAddedId }, tokens.viewer);
	r.status === 403 ? pass('viewer cannot promote → 403') : fail('viewer cannot promote → 403', `got ${r.status}`);
}

// Non-member cannot promote.
{
	const r = await api('POST', '/api/members/promote', { member_id: globalThis.travelerAddedId }, tokens.non_member);
	r.status === 403 ? pass('non-member cannot promote → 403') : fail('non-member cannot promote → 403', `got ${r.status}`);
}

// Anon cannot promote.
{
	const r = await api('POST', '/api/members/promote', { member_id: globalThis.travelerAddedId }, null);
	r.status === 401 ? pass('anon cannot promote → 401') : fail('anon cannot promote → 401', `got ${r.status}`);
}

console.log('\n[remove]');

// Owner removes the traveler-added placeholder.
{
	const r = await api('POST', '/api/members/remove', { member_id: globalThis.travelerAddedId }, tokens.owner);
	r.status === 200 ? pass('owner removes traveler placeholder → 200') : fail('owner removes traveler placeholder → 200', `got ${r.status}`);
}

// Co-owner removes the promoted-to-co_owner placeholder.
{
	const r = await api('POST', '/api/members/remove', { member_id: globalThis.coOwnerPlaceholderId }, tokens.co_owner);
	r.status === 200 ? pass('co_owner removes co_owner placeholder → 200') : fail('co_owner removes co_owner placeholder → 200', `got ${r.status}`);
}

// Traveler cannot remove.
{
	const r = await api('POST', '/api/members/remove', { member_id: promoteTarget }, tokens.traveler);
	r.status === 403 ? pass('traveler cannot remove → 403') : fail('traveler cannot remove → 403', `got ${r.status}`);
}

// Viewer cannot remove.
{
	const r = await api('POST', '/api/members/remove', { member_id: promoteTarget }, tokens.viewer);
	r.status === 403 ? pass('viewer cannot remove → 403') : fail('viewer cannot remove → 403', `got ${r.status}`);
}

// Non-member cannot remove.
{
	const r = await api('POST', '/api/members/remove', { member_id: promoteTarget }, tokens.non_member);
	r.status === 403 ? pass('non-member cannot remove → 403') : fail('non-member cannot remove → 403', `got ${r.status}`);
}

// Anon cannot remove.
{
	const r = await api('POST', '/api/members/remove', { member_id: promoteTarget }, null);
	r.status === 401 ? pass('anon cannot remove → 401') : fail('anon cannot remove → 401', `got ${r.status}`);
}

// Cannot remove sole owner.
{
	const r = await api('POST', '/api/members/remove', { member_id: fx.memberIds.owner }, tokens.owner);
	r.status === 400 ? pass('cannot remove sole owner → 400') : fail('cannot remove sole owner → 400', `got ${r.status}`);
}

// ─── #338: concurrent read-check-then-write ─────────────────────────────────
// The claim + add-placeholder handlers used to validate and write as separate
// statements, so two simultaneous calls could both pass the "no duplicate"
// check. Both are now wrapped in e.app.runInTransaction. These fire N requests
// in parallel and assert exactly ONE winner and exactly ONE resulting row.
//
// Measured against the pre-fix handler: the CLAIM race reproduces reliably
// (3 of 5 parallel claims returned 200). The add-placeholder race did NOT
// reproduce at 5x concurrency — SQLite's single writer happens to serialize
// those inserts far enough apart — so treat that case as an invariant guard
// rather than proof of the transaction. The claim case is the teeth.

console.log('\n[#338 concurrency]');

// A FRESH fixture trip: the suite above consumed non_member (they claimed a
// placeholder), and these cases need a trip where they are not yet a member.
const raceFxRes = await api('POST', '/api/dev/rules-fixture', { emails: EMAILS }, tokens.owner);
if (raceFxRes.status !== 200) {
	console.error('FATAL: race fixture creation failed', raceFxRes.status, raceFxRes.json);
	process.exit(1);
}
const raceTripId = raceFxRes.json.tripId;

async function countActive(filter) {
	const res = await fetch(
		`${BASE}/api/collections/trip_members/records?perPage=200&filter=${encodeURIComponent(filter)}`,
		{ headers: { Authorization: 'Bearer ' + tokens.owner } }
	);
	const json = await res.json();
	return Array.isArray(json?.items) ? json.items.length : -1;
}

// Concurrent add-placeholder with the SAME email → one row, not N.
{
	const email = `dupe-race-${Date.now()}@e2e.test`;
	const attempts = 5;
	const results = await Promise.all(
		Array.from({ length: attempts }, (_, i) =>
			api('POST', '/api/members/add-placeholder', {
				trip_id: raceTripId,
				display_name: `Race Placeholder ${i}`,
				placeholder_email: email,
				role: 'traveler'
			}, tokens.owner)
		)
	);

	const created = results.filter((r) => r.status === 200);
	const rejected = results.filter((r) => r.status === 400);

	created.length === 1
		? pass('concurrent add-placeholder (same email) → exactly 1 accepted')
		: fail('concurrent add-placeholder (same email) → exactly 1 accepted',
			`got ${created.length} of ${attempts}: [${results.map((r) => r.status).join(',')}]`);

	rejected.length === attempts - 1
		? pass('concurrent add-placeholder → the rest rejected as duplicates')
		: fail('concurrent add-placeholder → the rest rejected as duplicates',
			`got ${rejected.length}, statuses [${results.map((r) => r.status).join(',')}]`);

	// The durable check: the database holds exactly one active row.
	const rows = await countActive(
		`trip="${raceTripId}" && placeholder_email="${email}" && removed_at=""`
	);
	rows === 1
		? pass('concurrent add-placeholder → exactly 1 active row in trip_members')
		: fail('concurrent add-placeholder → exactly 1 active row in trip_members', `got ${rows}`);
}

// #338 regression: adding a placeholder for an email that already belongs to an
// ACTIVE member must 400. This guard existed but was dead — it threw inside a
// try whose catch tested `err.code`, which is always null on PB's JSVM, so the
// error was swallowed and a duplicate membership was created instead.
{
	const r = await api('POST', '/api/members/add-placeholder', {
		trip_id: raceTripId,
		display_name: 'Owner Duplicate',
		placeholder_email: EMAILS.owner,
		role: 'traveler'
	}, tokens.owner);
	r.status === 400
		? pass('add-placeholder for an existing active member’s email → 400')
		: fail('add-placeholder for an existing active member’s email → 400', `got ${r.status}`);

	// The stray row the dead guard used to create was a PLACEHOLDER (user empty),
	// so counting the owner's user id would miss it — count by email instead.
	const strays = await countActive(
		`trip="${raceTripId}" && placeholder_email="${EMAILS.owner}" && removed_at=""`
	);
	strays === 0
		? pass('rejected duplicate created no stray placeholder row')
		: fail('rejected duplicate created no stray placeholder row', `got ${strays}`);
}

// Concurrent claim of the SAME placeholder → one winner, one membership.
{
	// Seed a placeholder addressed to the non-member so it is claimable by them.
	const seed = await api('POST', '/api/members/add-placeholder', {
		trip_id: raceTripId,
		display_name: 'Claim Race Target',
		placeholder_email: EMAILS.non_member,
		role: 'traveler'
	}, tokens.owner);

	if (seed.status !== 200) {
		fail('seed claimable placeholder for claim race', `got ${seed.status}`);
	} else {
		const targetId = seed.json.member_id;
		const attempts = 5;
		const results = await Promise.all(
			Array.from({ length: attempts }, () =>
				api('POST', '/api/members/claim', { member_id: targetId }, tokens.non_member)
			)
		);

		const won = results.filter((r) => r.status === 200);
		won.length === 1
			? pass('concurrent claim of one placeholder → exactly 1 accepted')
			: fail('concurrent claim of one placeholder → exactly 1 accepted',
				`got ${won.length} of ${attempts}: [${results.map((r) => r.status).join(',')}]`);

		// And the claimer ends up with exactly one active membership on the trip.
		// The user id comes from the PB JWT payload — `users.emailVisibility` is
		// off, so a `user.email=` filter would not resolve here.
		const claimerUserId = JSON.parse(
			Buffer.from(tokens.non_member.split('.')[1], 'base64').toString('utf8')
		).id;
		const claimerRows = await countActive(
			`trip="${raceTripId}" && user="${claimerUserId}" && removed_at=""`
		);
		claimerRows === 1
			? pass('claim race → claimer holds exactly 1 active membership')
			: fail('claim race → claimer holds exactly 1 active membership', `got ${claimerRows}`);
	}
}

// ─── summary ────────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
	console.log(`PASS: ${passed}/${passed + failed} assertions`);
} else {
	console.error(`FAIL: ${failed} failures, ${passed} passed (${passed + failed} total)`);
	process.exit(1);
}
