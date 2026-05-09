#!/usr/bin/env node
// Waypoint M2b — invite endpoint integration tests.
//
// Exercises /api/invites/{create,lookup,accept} against the same fixture trip
// that test-rules.mjs uses. Verifies SPEC §3 invite role-gating, the lookup
// metadata payload, the accept flow's email-match guard, and the revoke
// (DELETE) hook gating.
//
// Prerequisites: same as test-rules.mjs (PB running, WAYPOINT_DEV_MODE=true,
// E2E_TEST_EMAILS set with the 5 rules-* addresses).
//
// Run: pnpm test:invites    (exit 0 on green, 1 on any failure)

import { exit } from 'node:process';

const PB_URL = process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090';

const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

let pass = 0;
let fail = 0;
const failures = [];

function assert(name, cond, detail) {
	if (cond) {
		pass++;
		console.log('  PASS  ' + name);
	} else {
		fail++;
		failures.push({ name, detail });
		console.log('  FAIL  ' + name + (detail ? ' — ' + JSON.stringify(detail) : ''));
	}
}

async function pb(method, path, opts = {}) {
	const headers = { 'Content-Type': 'application/json' };
	if (opts.token) headers.Authorization = opts.token;
	const init = { method, headers };
	if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
	const res = await fetch(PB_URL + path, init);
	let data = null;
	try {
		data = await res.json();
	} catch (_) {}
	return { status: res.status, data };
}

async function authBypass(email) {
	const { status, data } = await pb('POST', '/api/dev/auth-bypass', {
		body: { email }
	});
	if (status !== 200) {
		console.error(`auth-bypass failed for ${email}: HTTP ${status}`, data);
		exit(2);
	}
	return data.token;
}

async function setupFixture() {
	const { status, data } = await pb('POST', '/api/dev/rules-fixture', {
		body: { emails: EMAILS }
	});
	if (status !== 200) {
		console.error(`fixture setup failed: HTTP ${status}`, data);
		exit(2);
	}
	return data;
}

async function main() {
	console.log(`PB: ${PB_URL}`);

	const tokens = {};
	for (const role of Object.keys(EMAILS)) {
		tokens[role] = await authBypass(EMAILS[role]);
	}

	let fixture = await setupFixture();

	// ---------- /api/invites/create role-gating (SPEC §3) ----------
	console.log('\n[create: role-gating per SPEC §3]');

	// Owner can invite at any role.
	for (const role of ['co_owner', 'traveler', 'viewer']) {
		fixture = await setupFixture();
		const r = await pb('POST', '/api/invites/create', {
			token: tokens.owner,
			body: { trip_id: fixture.tripId, email: `unique-${role}-${Date.now()}@e2e.test`, role }
		});
		assert(`owner invites ${role}`, r.status === 200, { status: r.status, data: r.data });
	}

	// Co-owner can invite at any role.
	for (const role of ['co_owner', 'traveler', 'viewer']) {
		fixture = await setupFixture();
		const r = await pb('POST', '/api/invites/create', {
			token: tokens.co_owner,
			body: { trip_id: fixture.tripId, email: `unique-co-${role}-${Date.now()}@e2e.test`, role }
		});
		assert(`co_owner invites ${role}`, r.status === 200, { status: r.status, data: r.data });
	}

	// Traveler can invite traveler/viewer but NOT co_owner.
	fixture = await setupFixture();
	{
		const r = await pb('POST', '/api/invites/create', {
			token: tokens.traveler,
			body: { trip_id: fixture.tripId, email: `traveler-invitee-${Date.now()}@e2e.test`, role: 'traveler' }
		});
		assert('traveler invites traveler', r.status === 200, { status: r.status });
	}
	{
		fixture = await setupFixture();
		const r = await pb('POST', '/api/invites/create', {
			token: tokens.traveler,
			body: { trip_id: fixture.tripId, email: `viewer-invitee-${Date.now()}@e2e.test`, role: 'viewer' }
		});
		assert('traveler invites viewer', r.status === 200, { status: r.status });
	}
	{
		const r = await pb('POST', '/api/invites/create', {
			token: tokens.traveler,
			body: { trip_id: fixture.tripId, email: `coowner-bad-${Date.now()}@e2e.test`, role: 'co_owner' }
		});
		assert('traveler CANNOT invite co_owner', r.status === 403, { status: r.status });
	}

	// Viewer cannot invite at all.
	for (const role of ['co_owner', 'traveler', 'viewer']) {
		const r = await pb('POST', '/api/invites/create', {
			token: tokens.viewer,
			body: { trip_id: fixture.tripId, email: `viewer-cant-${role}-${Date.now()}@e2e.test`, role }
		});
		assert(`viewer CANNOT invite ${role}`, r.status === 403, { status: r.status });
	}

	// Non-member cannot invite.
	{
		const r = await pb('POST', '/api/invites/create', {
			token: tokens.non_member,
			body: { trip_id: fixture.tripId, email: `nm-${Date.now()}@e2e.test`, role: 'viewer' }
		});
		assert('non_member CANNOT invite', r.status === 403, { status: r.status });
	}

	// Anon cannot invite.
	{
		const r = await pb('POST', '/api/invites/create', {
			body: { trip_id: fixture.tripId, email: `anon-${Date.now()}@e2e.test`, role: 'viewer' }
		});
		assert('anon CANNOT invite (401)', r.status === 401, { status: r.status });
	}

	// ---------- /api/invites/create payload validation ----------
	console.log('\n[create: payload validation]');
	fixture = await setupFixture();
	{
		const r = await pb('POST', '/api/invites/create', {
			token: tokens.owner,
			body: { trip_id: fixture.tripId, email: '', role: 'viewer' }
		});
		assert('reject missing email', r.status === 400, { status: r.status });
	}
	{
		const r = await pb('POST', '/api/invites/create', {
			token: tokens.owner,
			body: { trip_id: fixture.tripId, email: 'foo@bar.com', role: 'owner' }
		});
		assert('reject role=owner (not invitable)', r.status === 400, { status: r.status });
	}
	{
		const r = await pb('POST', '/api/invites/create', {
			token: tokens.owner,
			body: { trip_id: fixture.tripId, email: 'not-an-email', role: 'viewer' }
		});
		assert('reject malformed email', r.status === 400, { status: r.status });
	}

	// Already-member rejection (invite the owner's own email back).
	{
		const r = await pb('POST', '/api/invites/create', {
			token: tokens.owner,
			body: { trip_id: fixture.tripId, email: EMAILS.owner, role: 'viewer' }
		});
		assert('reject already-member email', r.status === 400, { status: r.status });
	}

	// Duplicate (trip, email): create one, then try the same again.
	fixture = await setupFixture();
	{
		const dupEmail = `dup-${Date.now()}@e2e.test`;
		const first = await pb('POST', '/api/invites/create', {
			token: tokens.owner,
			body: { trip_id: fixture.tripId, email: dupEmail, role: 'viewer' }
		});
		assert('first invite for dup email succeeds', first.status === 200, { status: first.status });
		const second = await pb('POST', '/api/invites/create', {
			token: tokens.owner,
			body: { trip_id: fixture.tripId, email: dupEmail, role: 'viewer' }
		});
		assert('duplicate invite for same email rejected', second.status === 400, {
			status: second.status
		});
	}

	// ---------- /api/invites/lookup ----------
	console.log('\n[lookup]');
	fixture = await setupFixture();
	{
		const r = await pb('POST', '/api/invites/lookup', {
			body: { code: fixture.pendingInviteCode }
		});
		assert('anon lookup of valid code → 200', r.status === 200, { status: r.status });
		assert('lookup returns email', r.data?.email === 'fixture-invitee@e2e.test', r.data);
		assert('lookup returns role', r.data?.role === 'viewer', r.data);
		assert(
			'lookup returns trip_title',
			r.data?.trip_title === 'E2E Rules Test Trip',
			r.data
		);
		assert('lookup returns expired=false', r.data?.expired === false, r.data);
	}
	{
		const r = await pb('POST', '/api/invites/lookup', {
			body: { code: 'no-such-code-' + Date.now() }
		});
		assert('lookup of unknown code → 404', r.status === 404, { status: r.status });
	}
	{
		const r = await pb('POST', '/api/invites/lookup', { body: {} });
		assert('lookup with no code → 400', r.status === 400, { status: r.status });
	}

	// ---------- /api/invites/accept ----------
	console.log('\n[accept]');

	// Email-mismatch: accepting with a token whose email != invite.email → 403.
	fixture = await setupFixture();
	{
		const r = await pb('POST', '/api/invites/accept', {
			token: tokens.non_member, // rules-nonmember@e2e.test, doesn't match fixture-invitee
			body: { code: fixture.pendingInviteCode }
		});
		assert('accept with wrong email → 403', r.status === 403, { status: r.status });
	}

	// Anon accept → 401.
	{
		const r = await pb('POST', '/api/invites/accept', {
			body: { code: fixture.pendingInviteCode }
		});
		assert('anon accept → 401', r.status === 401, { status: r.status });
	}

	// Unknown code → 400.
	{
		const r = await pb('POST', '/api/invites/accept', {
			token: tokens.non_member,
			body: { code: 'no-such-code-' + Date.now() }
		});
		assert('accept with unknown code → 400', r.status === 400, { status: r.status });
	}

	// Happy path: create an invite addressed to non_member, then accept as
	// non_member. They become a viewer.
	fixture = await setupFixture();
	{
		const create = await pb('POST', '/api/invites/create', {
			token: tokens.owner,
			body: { trip_id: fixture.tripId, email: EMAILS.non_member, role: 'viewer' }
		});
		assert('happy: invite created', create.status === 200, { status: create.status });

		const code = create.data?.code;
		const acc = await pb('POST', '/api/invites/accept', {
			token: tokens.non_member,
			body: { code }
		});
		assert('happy: accept succeeds', acc.status === 200, { status: acc.status, data: acc.data });
		assert('happy: trip_id returned', acc.data?.trip_id === fixture.tripId, acc.data);
		assert('happy: not flagged as already_member', acc.data?.already_member === false, acc.data);

		// Verify the invite was deleted.
		const lookup = await pb('POST', '/api/invites/lookup', { body: { code } });
		assert('happy: invite deleted after accept', lookup.status === 404, {
			status: lookup.status
		});

		// Re-accepting the same code → 400 (invite gone).
		const reAcc = await pb('POST', '/api/invites/accept', {
			token: tokens.non_member,
			body: { code }
		});
		assert('happy: re-accept same code → 400', reAcc.status === 400, { status: reAcc.status });
	}

	// Idempotent already-member path: invite an existing member, accept as
	// them, expect already_member=true.
	fixture = await setupFixture();
	{
		// Manually create a pending_invites row addressed to the owner. We
		// can't go through /api/invites/create (it rejects already-members);
		// use the dev rules-fixture's seeded invite for this scenario by
		// auth'ing as the seeded fixture-invitee. But that user isn't in the
		// whitelist, so instead: invite traveler (already a member won't work
		// either — they're in the trip). Use a different angle: direct DB
		// insert isn't available from the harness. Skip this case; documented
		// as backend-only behavior (the accept hook handles it) and exercised
		// by manual verification.
		console.log(
			'  SKIP  already_member idempotent path (needs admin-context invite seed; behavior covered by hook)'
		);
	}

	// ---------- DELETE (revoke) gating ----------
	console.log('\n[revoke: SPEC §3 gating via hook]');
	fixture = await setupFixture();
	{
		const r = await pb('DELETE', `/api/collections/pending_invites/records/${fixture.pendingInviteId}`, {
			token: tokens.viewer
		});
		assert('viewer CANNOT revoke (403)', r.status === 403, { status: r.status });
	}
	{
		const r = await pb('DELETE', `/api/collections/pending_invites/records/${fixture.pendingInviteId}`, {
			token: tokens.traveler
		});
		assert(
			'traveler CANNOT revoke invite they did not send (403)',
			r.status === 403,
			{ status: r.status }
		);
	}
	{
		const r = await pb('DELETE', `/api/collections/pending_invites/records/${fixture.pendingInviteId}`, {
			token: tokens.co_owner
		});
		assert('co_owner CAN revoke (204)', r.status === 204, { status: r.status });
	}

	// Traveler revoking their own invite → ALLOW.
	fixture = await setupFixture();
	{
		// Traveler creates an invite. invited_by = traveler's member id, so
		// the revoke hook's "you sent it" branch should pass.
		const created = await pb('POST', '/api/invites/create', {
			token: tokens.traveler,
			body: {
				trip_id: fixture.tripId,
				email: `traveler-self-revoke-${Date.now()}@e2e.test`,
				role: 'viewer'
			}
		});
		assert('traveler creates invite', created.status === 200, { status: created.status });

		const r = await pb('DELETE', `/api/collections/pending_invites/records/${created.data.id}`, {
			token: tokens.traveler
		});
		assert('traveler CAN revoke their own invite (204)', r.status === 204, {
			status: r.status
		});
	}

	// ---------- Report ----------
	console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + `: ${pass}/${pass + fail} assertions`);
	if (fail > 0) {
		console.log('\n[FAILURES]');
		for (const f of failures) {
			console.log('  ' + f.name + ': ' + JSON.stringify(f.detail));
		}
	}
	exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error('test-invites crashed:', err);
	exit(2);
});
