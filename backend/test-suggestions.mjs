#!/usr/bin/env node
// M2d suggestions harness.
// Tests: create (auto-approve paths), list, review (approve, reject).
// Requires: PocketBase on $PUBLIC_PB_URL, WAYPOINT_DEV_MODE=true, E2E_TEST_EMAILS set.

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

let passed = 0;
let failed = 0;

function pass(label) { console.log('  PASS ', label); passed++; }
function fail(label, detail) { console.error('  FAIL ', label, detail ? `(${detail})` : ''); failed++; }

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
	try { json = await res.json(); } catch (_) {}
	return { status: res.status, json };
}

// ─── setup ──────────────────────────────────────────────────────────────────

const tokens = {};
for (const [role, email] of Object.entries(EMAILS)) {
	tokens[role] = await bypass(email);
}

const fixtureRes = await api('POST', '/api/dev/rules-fixture', { emails: EMAILS }, tokens.owner);
if (fixtureRes.status !== 200) {
	console.error('FATAL: fixture creation failed', fixtureRes.status, fixtureRes.json);
	process.exit(1);
}
const { trip_id: tripId } = fixtureRes.json;

// ─── helpers ────────────────────────────────────────────────────────────────

const samplePayload = {
	title: 'Test suggestion item',
	type: 'activity',
	slot: 'morning',
	description: 'A test suggestion'
};

// ─── 1. Viewer cannot suggest ────────────────────────────────────────────────

console.log('\n1. Viewer blocked from suggesting');
{
	const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: samplePayload }, tokens.viewer);
	r.status === 403
		? pass('viewer create → 403')
		: fail('viewer create → 403', `got ${r.status}`);
}

// ─── 2. Non-member cannot suggest ────────────────────────────────────────────

console.log('\n2. Non-member blocked');
{
	const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: samplePayload }, tokens.non_member);
	r.status === 403
		? pass('non-member create → 403')
		: fail('non-member create → 403', `got ${r.status}`);
}

// ─── 3. Missing title → 400 ───────────────────────────────────────────────────

console.log('\n3. Validation: missing title');
{
	const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { type: 'activity' } }, tokens.traveler);
	r.status === 400
		? pass('missing title → 400')
		: fail('missing title → 400', `got ${r.status}`);
}

// ─── 4. Owner suggestion → auto-approved ─────────────────────────────────────

console.log('\n4. Owner suggestion auto-approved');
{
	const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'Owner suggestion' } }, tokens.owner);
	r.status === 200 && r.json.status === 'approved'
		? pass('owner create → auto-approved')
		: fail('owner create → auto-approved', `${r.status} ${JSON.stringify(r.json)}`);
	r.json.item_id
		? pass('owner create → item created')
		: fail('owner create → item created', 'no item_id returned');
}

// ─── 5. Co-owner suggestion → auto-approved ──────────────────────────────────

console.log('\n5. Co-owner suggestion auto-approved');
{
	const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'Co-owner suggestion' } }, tokens.co_owner);
	r.status === 200 && r.json.status === 'approved'
		? pass('co_owner create → auto-approved')
		: fail('co_owner create → auto-approved', `${r.status} ${JSON.stringify(r.json)}`);
}

// ─── 6. Traveler with auto_approve=true → auto-approved ──────────────────────

console.log('\n6. Traveler + auto_approve=true → auto-approved');
{
	const adminToken = (await api('POST', '/api/admins/auth-with-password',
		{ identity: process.env.PB_ADMIN_EMAIL || 'admin@waypoint.local', password: process.env.PB_ADMIN_PASSWORD || 'adminpassword123' },
		null)).json?.token;

	if (adminToken) {
		const updateRes = await fetch(`${BASE}/api/collections/trips/records/${tripId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
			body: JSON.stringify({ auto_approve_suggestions: true })
		});
		if (updateRes.ok) {
			const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'Traveler auto-approve' } }, tokens.traveler);
			r.status === 200 && r.json.status === 'approved'
				? pass('traveler + auto_approve=true → auto-approved')
				: fail('traveler + auto_approve=true → auto-approved', `${r.status} ${JSON.stringify(r.json)}`);
			r.json.item_id
				? pass('traveler auto-approve → item created')
				: fail('traveler auto-approve → item created', 'no item_id');

			await fetch(`${BASE}/api/collections/trips/records/${tripId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
				body: JSON.stringify({ auto_approve_suggestions: false })
			});
		} else {
			fail('traveler + auto_approve=true → auto-approved', 'could not enable auto_approve on trip');
		}
	} else {
		console.log('  SKIP traveler auto-approve (no admin credentials — set PB_ADMIN_EMAIL + PB_ADMIN_PASSWORD in .env.local)');
	}
}

// ─── 7. Traveler with auto_approve=false → pending ───────────────────────────

console.log('\n7. Traveler + auto_approve=false → pending');
let pendingSuggestionId = '';
{
	const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'Traveler pending suggestion' } }, tokens.traveler);
	r.status === 200 && r.json.status === 'pending'
		? pass('traveler + auto_approve=false → pending')
		: fail('traveler + auto_approve=false → pending', `${r.status} ${JSON.stringify(r.json)}`);
	!r.json.item_id
		? pass('traveler pending → no item created yet')
		: fail('traveler pending → no item created yet', 'item_id was returned unexpectedly');
	pendingSuggestionId = r.json.suggestion_id || '';
}

// ─── 8. List endpoint: owner sees pending ────────────────────────────────────

console.log('\n8. Owner can list pending suggestions');
{
	const r = await api('GET', `/api/suggestions/list?trip_id=${tripId}&status=pending`, null, tokens.owner);
	r.status === 200 && Array.isArray(r.json.items)
		? pass('owner list pending → 200 + items array')
		: fail('owner list pending → 200', `${r.status} ${JSON.stringify(r.json)}`);
	r.json.items?.some((s) => s.id === pendingSuggestionId)
		? pass('owner list → contains traveler pending suggestion')
		: fail('owner list → contains traveler pending suggestion', `items: ${JSON.stringify(r.json.items?.map(s => s.id))}`);
}

// ─── 9. Co-owner can list ────────────────────────────────────────────────────

console.log('\n9. Co-owner list');
{
	const r = await api('GET', `/api/suggestions/list?trip_id=${tripId}&status=pending`, null, tokens.co_owner);
	r.status === 200
		? pass('co_owner list → 200')
		: fail('co_owner list → 200', `got ${r.status}`);
}

// ─── 10. Review gating ───────────────────────────────────────────────────────

console.log('\n10. Review gating');
if (pendingSuggestionId) {
	const r = await api('POST', '/api/suggestions/review', { suggestion_id: pendingSuggestionId, action: 'approve' }, tokens.viewer);
	r.status === 403
		? pass('viewer review → 403')
		: fail('viewer review → 403', `got ${r.status}`);

	const r2 = await api('POST', '/api/suggestions/review', { suggestion_id: pendingSuggestionId, action: 'approve' }, tokens.traveler);
	r2.status === 403
		? pass('traveler review → 403')
		: fail('traveler review → 403', `got ${r2.status}`);
}

// ─── 11. Owner rejects a suggestion ──────────────────────────────────────────

console.log('\n11. Owner reject');
let rejectTargetId = '';
{
	const createRes = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'To be rejected' } }, tokens.traveler);
	rejectTargetId = createRes.json.suggestion_id || '';

	if (rejectTargetId) {
		const r = await api('POST', '/api/suggestions/review', { suggestion_id: rejectTargetId, action: 'reject' }, tokens.owner);
		r.status === 200 && r.json.status === 'rejected'
			? pass('owner reject → 200 + status=rejected')
			: fail('owner reject → 200', `${r.status} ${JSON.stringify(r.json)}`);
		!r.json.item_id
			? pass('reject → no item created')
			: fail('reject → no item created', 'item_id returned');

		const r2 = await api('POST', '/api/suggestions/review', { suggestion_id: rejectTargetId, action: 'reject' }, tokens.owner);
		r2.status === 400
			? pass('double-reject → 400')
			: fail('double-reject → 400', `got ${r2.status}`);
	} else {
		fail('owner reject → could not create target suggestion');
	}
}

// ─── 12. Owner approves a suggestion → item created ──────────────────────────

console.log('\n12. Owner approve → item created');
if (pendingSuggestionId) {
	const r = await api('POST', '/api/suggestions/review', { suggestion_id: pendingSuggestionId, action: 'approve' }, tokens.owner);
	r.status === 200 && r.json.status === 'approved'
		? pass('owner approve → 200 + status=approved')
		: fail('owner approve → 200', `${r.status} ${JSON.stringify(r.json)}`);
	r.json.item_id
		? pass('owner approve → item created')
		: fail('owner approve → item created', 'no item_id returned');
}

// ─── 13. Edit-and-approve: approve with modified payload ─────────────────────

console.log('\n13. Edit-and-approve (modified payload)');
{
	const createRes = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'Edit me' } }, tokens.traveler);
	const eid = createRes.json.suggestion_id || '';
	if (eid) {
		const modifiedPayload = { ...samplePayload, title: 'Edited by owner', description: 'Modified' };
		const r = await api('POST', '/api/suggestions/review', { suggestion_id: eid, action: 'approve', payload: modifiedPayload }, tokens.owner);
		r.status === 200 && r.json.item_id
			? pass('edit-and-approve → item created with modified payload')
			: fail('edit-and-approve → item created', `${r.status} ${JSON.stringify(r.json)}`);
	} else {
		fail('edit-and-approve → could not create target');
	}
}

// ─── summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Suggestions harness: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
