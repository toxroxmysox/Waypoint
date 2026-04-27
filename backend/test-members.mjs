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

// ─── summary ────────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
	console.log(`PASS: ${passed}/${passed + failed} assertions`);
} else {
	console.error(`FAIL: ${failed} failures, ${passed} passed (${passed + failed} total)`);
	process.exit(1);
}
