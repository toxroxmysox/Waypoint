#!/usr/bin/env node
// #397 — the invitee's side of email invites: list them in-app, decline them.
//
// GET  /api/invites/my-pending   every pending, unexpired invite for MY email,
//                                with trip title, inviter NAME (never an
//                                address), role, and needs_choice (the trip has
//                                unclaimed placeholders → accept on the invite
//                                page so the invitee can claim one).
// POST /api/invites/decline      only the invited address; deletes the invite.
//
// Fresh PB (the memberships below assume nothing else exists):
//   bash scripts/backend-harnesses.sh invitations
// Exit 0 on green, 1 on any failure.

import { exit } from 'node:process';

const PB_URL = process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090';

// A invites D. B is a bystander who must not be able to decline D's invites.
const EMAILS = {
	A: 'rules-owner@e2e.test',
	B: 'rules-traveler@e2e.test',
	D: 'rules-nonmember@e2e.test'
};

let pass = 0;
let fail = 0;
function assert(name, cond, detail) {
	if (cond) {
		pass++;
		console.log('  PASS  ' + name);
	} else {
		fail++;
		console.log('  FAIL  ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : ''));
	}
}

async function pb(method, path, { token, body } = {}) {
	const headers = { 'Content-Type': 'application/json' };
	if (token) headers.Authorization = token;
	const res = await fetch(PB_URL + path, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	let data = null;
	try {
		data = await res.json();
	} catch (_) {}
	return { status: res.status, data };
}

function must(label, r) {
	if (r.status !== 200) {
		console.error(`setup failed: ${label}: HTTP ${r.status}`, r.data);
		exit(2);
	}
	return r.data;
}

async function main() {
	console.log(`PB: ${PB_URL}`);
	const admin = must(
		'superuser auth',
		await pb('POST', '/api/collections/_superusers/auth-with-password', {
			body: { identity: 'admin@e2e.test', password: 'e2eAdminPass123' }
		})
	).token;

	const tok = {};
	const id = {};
	for (const [k, email] of Object.entries(EMAILS)) {
		const d = must(
			'auth-bypass ' + email,
			await pb('POST', '/api/dev/auth-bypass', { body: { email } })
		);
		tok[k] = d.token;
		id[k] = d.record.id;
		must(
			'name ' + k,
			await pb('PATCH', `/api/collections/users/records/${id[k]}`, {
				token: admin,
				body: { name: 'User ' + k }
			})
		);
	}

	const trip = async (title, slug) =>
		must(
			'trip ' + title,
			await pb('POST', '/api/collections/trips/records', {
				token: tok.A,
				body: { title, slug, created_by: id.A, timezone: 'UTC' }
			})
		);
	const lisbon = await trip('Lisbon', 'lisbon');
	const kyoto = await trip('Kyoto', 'kyoto');
	const oaxaca = await trip('Oaxaca', 'oaxaca');
	// Oaxaca has a name-only placeholder ("Abby") waiting to be claimed.
	must(
		'placeholder',
		await pb('POST', '/api/collections/trip_members/records', {
			token: admin,
			body: { trip: oaxaca.id, display_name: 'Abby', role: 'traveler' }
		})
	);

	const invite = async (t, role) =>
		must(
			'invite ' + t.title,
			await pb('POST', '/api/invites/create', {
				token: tok.A,
				body: { trip_id: t.id, email: EMAILS.D, role }
			})
		);
	await invite(lisbon, 'traveler');
	await invite(kyoto, 'co_owner');
	await invite(oaxaca, 'viewer');

	const pending = async (token) => pb('GET', '/api/invites/my-pending', { token });
	const byTitle = (list) => Object.fromEntries((list || []).map((i) => [i.trip_title, i]));

	console.log('\n— listing');
	let r = await pending(tok.D);
	let mine = byTitle(r.data?.invites);
	assert('D sees all 3 invites', r.status === 200 && r.data.invites.length === 3, r.data);
	assert(
		'each carries title, inviter NAME and role',
		mine.Lisbon?.inviter_name === 'User A' &&
			mine.Lisbon?.role === 'traveler' &&
			mine.Kyoto?.role === 'co_owner',
		mine
	);
	assert('no email address anywhere in the payload', !JSON.stringify(r.data).includes('@'), r.data);
	assert(
		'needs_choice only where a placeholder is unclaimed',
		mine.Oaxaca?.needs_choice === true && mine.Lisbon?.needs_choice === false,
		mine
	);
	r = await pending(tok.B);
	assert('B (not invited) sees none of them', r.data?.invites?.length === 0, r.data);

	console.log('\n— decline');
	r = await pb('POST', '/api/invites/decline', { token: tok.B, body: { code: mine.Kyoto.code } });
	assert('someone else can’t decline D’s invite → 403', r.status === 403, r);
	r = await pb('POST', '/api/invites/decline', { token: tok.D, body: { code: mine.Kyoto.code } });
	assert('D declines Kyoto → 200', r.status === 200, r);
	r = await pb(
		'GET',
		`/api/collections/pending_invites/records?filter=${encodeURIComponent(`code = "${mine.Kyoto.code}"`)}`,
		{
			token: admin
		}
	);
	assert('…and the invite is deleted', r.data?.items?.length === 0, r.data);
	r = await pb('POST', '/api/invites/decline', { token: tok.D, body: { code: mine.Kyoto.code } });
	assert('declining it again → 404', r.status === 404, r.status);
	r = await pb('POST', '/api/invites/decline', { token: null, body: { code: mine.Lisbon.code } });
	assert('unauthenticated decline → 401', r.status === 401, r.status);

	console.log('\n— accept, expiry');
	r = await pb('POST', '/api/invites/accept', { token: tok.D, body: { code: mine.Lisbon.code } });
	assert('D accepts Lisbon', r.status === 200, r);
	const oaxacaInvite = must(
		'oaxaca invite row',
		await pb(
			'GET',
			`/api/collections/pending_invites/records?filter=${encodeURIComponent(`code = "${mine.Oaxaca.code}"`)}`,
			{
				token: admin
			}
		)
	).items[0];
	must(
		'expire oaxaca',
		await pb('PATCH', `/api/collections/pending_invites/records/${oaxacaInvite.id}`, {
			token: admin,
			body: { expires_at: '2020-01-01 00:00:00.000Z' }
		})
	);
	r = await pending(tok.D);
	assert(
		'accepted + expired + declined are all gone from the list',
		r.data?.invites?.length === 0,
		r.data
	);
	r = await pending(null);
	assert('unauthenticated list → 401', r.status === 401, r.status);

	console.log(`\n${pass} passed, ${fail} failed`);
	exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error(err);
	exit(1);
});
