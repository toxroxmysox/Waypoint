#!/usr/bin/env node
// #411 — secret fields hidden per caller (secrets.pb.js, onRecordEnrich):
//   - trip_members.soft_token: every non-superuser (only the poll hooks use it,
//     in admin context)
//   - join_tokens.token: viewers (non-viewers manage join links, #152)
//   - trips.public_share_token: viewers
// Checked on list, view and through expand (items?expand=trip), per role.
// Superusers see all three.
//
//   bash scripts/backend-harnesses.sh secrets
//
// Exit 0 on green, 1 on any failure.

import { exit } from 'node:process';

const PB_URL = process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090';
const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};
const ROLES = ['owner', 'co_owner', 'traveler', 'viewer'];

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

// The field is present with its real value, or absent (hidden), as expected.
function shows(name, record, field, value, visible) {
	const has =
		record != null &&
		Object.prototype.hasOwnProperty.call(record, field) &&
		record[field] === value;
	const absent = record != null && !Object.prototype.hasOwnProperty.call(record, field);
	assert(name, visible ? has : absent, record ? { [field]: record[field] } : 'no record');
}

async function main() {
	console.log(`PB: ${PB_URL}`);
	const fx = must(
		'rules-fixture',
		await pb('POST', '/api/dev/rules-fixture', { body: { emails: EMAILS } })
	);
	const tokens = {};
	for (const role of ROLES) {
		tokens[role] = must(
			'auth ' + role,
			await pb('POST', '/api/dev/auth-bypass', { body: { email: EMAILS[role] } })
		).token;
	}
	const su = must(
		'superuser',
		await pb('POST', '/api/collections/_superusers/auth-with-password', {
			body: { identity: 'admin@e2e.test', password: 'e2eAdminPass123' }
		})
	).token;
	tokens.superuser = su;

	// Seed the three secrets (the share token as the owner: the trips gate has no
	// superuser bypass; the others as superuser).
	const shareToken = 'share-' + Date.now() + '-abcdefghij';
	must(
		'set share token',
		await pb('PATCH', `/api/collections/trips/records/${fx.tripId}`, {
			token: tokens.owner,
			body: { public_share_token: shareToken }
		})
	);
	const softToken = 'soft-' + Date.now() + '-abcdefghij';
	must(
		'set soft token',
		await pb('PATCH', `/api/collections/trip_members/records/${fx.memberIds.traveler}`, {
			token: su,
			body: { soft_token: softToken }
		})
	);
	const joinValue = 'join-' + Date.now() + '-abcdefghij';
	const join = must(
		'join token',
		await pb('POST', '/api/collections/join_tokens/records', {
			token: su,
			body: {
				trip: fx.tripId,
				role: 'traveler',
				token: joinValue,
				expires_at: '2099-01-01 00:00:00.000Z'
			}
		})
	);

	const q = (f) => encodeURIComponent(f);
	for (const role of [...ROLES, 'superuser']) {
		const t = tokens[role];
		const isSu = role === 'superuser';
		console.log(`\n[${role}]`);

		const trip = (await pb('GET', `/api/collections/trips/records/${fx.tripId}`, { token: t }))
			.data;
		shows(
			'trips.view public_share_token',
			trip,
			'public_share_token',
			shareToken,
			role !== 'viewer'
		);
		const trips = (
			await pb('GET', `/api/collections/trips/records?filter=${q(`id="${fx.tripId}"`)}`, {
				token: t
			})
		).data;
		shows(
			'trips.list public_share_token',
			trips?.items?.[0],
			'public_share_token',
			shareToken,
			role !== 'viewer'
		);
		const items = (
			await pb(
				'GET',
				`/api/collections/items/records?filter=${q(`trip="${fx.tripId}"`)}&expand=trip&perPage=1`,
				{ token: t }
			)
		).data;
		shows(
			'items?expand=trip public_share_token',
			items?.items?.[0]?.expand?.trip,
			'public_share_token',
			shareToken,
			role !== 'viewer'
		);

		const member = (
			await pb('GET', `/api/collections/trip_members/records/${fx.memberIds.traveler}`, {
				token: t
			})
		).data;
		shows('trip_members.view soft_token', member, 'soft_token', softToken, isSu);
		const members = (
			await pb(
				'GET',
				`/api/collections/trip_members/records?filter=${q(`id="${fx.memberIds.traveler}"`)}`,
				{ token: t }
			)
		).data;
		shows('trip_members.list soft_token', members?.items?.[0], 'soft_token', softToken, isSu);

		const jt = (await pb('GET', `/api/collections/join_tokens/records/${join.id}`, { token: t }))
			.data;
		shows('join_tokens.view token', jt, 'token', joinValue, role !== 'viewer');
		const jts = (
			await pb('GET', `/api/collections/join_tokens/records?filter=${q(`trip="${fx.tripId}"`)}`, {
				token: t
			})
		).data;
		shows(
			'join_tokens.list token',
			jts?.items?.find((x) => x.id === join.id),
			'token',
			joinValue,
			role !== 'viewer'
		);
	}

	console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass}/${pass + fail}`);
	exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error('harness crashed:', err);
	exit(2);
});
