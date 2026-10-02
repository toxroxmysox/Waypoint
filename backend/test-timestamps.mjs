#!/usr/bin/env node
// #390 — every collection carries created/updated, and the notification bell
// is newest-first with real timestamps.
//
// 1. Schema guard: every non-system collection has `created` AND `updated`
//    autodate fields. Collections built with explicit `fields` arrays silently
//    drop them (0041, 0069); a sort on the missing field 400s, and loads that
//    swallow the error render empty. A new collection that forgets them fails
//    here instead of in the UI.
// 2. GET /api/notifications/list returns newest first with a non-empty
//    `created` (it used to sort by the random `-id` and return created: null).
//
// Run against a fresh PB:  bash scripts/backend-harnesses.sh timestamps
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

	console.log('\n— every collection has created + updated');
	const cols = must(
		'collections',
		await pb('GET', '/api/collections?perPage=500', { token: admin })
	).items;
	const missing = [];
	for (const c of cols) {
		if (c.system || c.type === 'view') continue;
		const names = c.fields.map((f) => f.name);
		for (const f of ['created', 'updated']) {
			const field = c.fields.find((x) => x.name === f);
			if (!names.includes(f) || field.type !== 'autodate') missing.push(`${c.name}.${f}`);
		}
	}
	assert(
		`all ${cols.filter((c) => !c.system).length} app collections have autodate created/updated`,
		missing.length === 0,
		missing
	);

	console.log('\n— notification bell: newest first, with timestamps');
	const fx = must(
		'rules fixture',
		await pb('POST', '/api/dev/rules-fixture', { body: { emails: EMAILS, slug: 'e2e-timestamps' } })
	);
	const ownerTok = must(
		'auth-bypass',
		await pb('POST', '/api/dev/auth-bypass', { body: { email: EMAILS.owner } })
	).token;
	// Eight, so a random order (the old `-id` sort) can't pass by luck (1/8!).
	const bodies = Array.from({ length: 8 }, (_, i) => `ts-${i}`);
	for (const body of bodies) {
		must(
			'notification ' + body,
			await pb('POST', '/api/collections/notifications/records', {
				token: admin,
				body: {
					trip: fx.tripId,
					recipient: fx.memberIds.owner,
					type: 'member_joined',
					body,
					link: ''
				}
			})
		);
		await new Promise((r) => setTimeout(r, 25));
	}
	const listed = must(
		'list',
		await pb('GET', '/api/notifications/list?limit=50', { token: ownerTok })
	);
	const list = listed.items;
	const ours = list.filter((n) => bodies.includes(n.body));
	assert('all eight come back', ours.length === 8, list);
	assert(
		'newest first',
		ours.map((n) => n.body).join(',') === [...bodies].reverse().join(','),
		ours.map((n) => n.body)
	);
	assert(
		'every item carries a parseable created timestamp',
		ours.every(
			(n) => typeof n.created === 'string' && !Number.isNaN(Date.parse(n.created.replace(' ', 'T')))
		),
		ours.map((n) => n.created)
	);

	// get('read_at') was a truthy DateTime even when empty → unread was always 0.
	assert('unread counts the unread ones', listed.unread >= 8, listed.unread);
	assert(
		'an unread item has read_at null',
		ours.every((n) => n.read_at === null),
		ours.map((n) => n.read_at)
	);

	const pend = await pb('GET', '/api/collections/pending_invites/records?sort=-created', {
		token: admin
	});
	assert('pending_invites accepts sort=-created (was a 400)', pend.status === 200, pend.status);

	console.log(`\n${pass} passed, ${fail} failed`);
	exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error(err);
	exit(1);
});
