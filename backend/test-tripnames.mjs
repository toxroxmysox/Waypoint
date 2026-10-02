#!/usr/bin/env node
// #395 — trip names: slug dedupe across users + the same-name heads-up.
//
// 1. The trips create hook resolves slug collisions with app privileges, so a
//    second user creating "Thailand" gets `thailand-1` even though they can't
//    see the first trip (it used to 400 → a 500 page).
// 2. GET /api/trips/same-name reports a same-name CURRENT trip that is the
//    caller's own or a co-traveler's — never a stranger's, never an ended or
//    archived one, never via a tombstoned membership.
//
// Needs a FRESH PB (memberships below assume nothing else exists):
//   bash scripts/backend-harnesses.sh tripnames
//
// Exit 0 on green, 1 on any failure.

import { exit } from 'node:process';

const PB_URL = process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090';

// A, B share a trip (co-travelers). C shared one with A but was REMOVED from it.
// D shares nothing with anyone.
const EMAILS = {
	A: 'rules-owner@e2e.test',
	B: 'rules-traveler@e2e.test',
	C: 'rules-coowner@e2e.test',
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

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10) + ' 00:00:00.000Z';
const plusDays = (n) => new Date(today.getTime() + n * 86400000);

async function createTrip(token, ownerId, title, slug, extra = {}) {
	return pb('POST', '/api/collections/trips/records', {
		token,
		body: { title, slug, created_by: ownerId, timezone: 'UTC', ...extra }
	});
}

async function sameName(token, title) {
	return pb('GET', '/api/trips/same-name?title=' + encodeURIComponent(title), { token });
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
		const d = must('auth-bypass ' + email, await pb('POST', '/api/dev/auth-bypass', { body: { email } }));
		tok[k] = d.token;
		id[k] = d.record.id;
		must('name ' + k, await pb('PATCH', `/api/collections/users/records/${id[k]}`, { token: admin, body: { name: 'User ' + k } }));
	}

	// Shared trip: A owns, B is an active traveler → A and B are co-travelers.
	const shared = must('shared trip', await createTrip(tok.A, id.A, 'Shared base', 'shared-base'));
	must('B joins shared', await pb('POST', '/api/collections/trip_members/records', {
		token: admin,
		body: { trip: shared.id, user: id.B, role: 'traveler' }
	}));
	// Former trip: A owns, C was a member but is tombstoned → NOT co-travelers.
	const former = must('former trip', await createTrip(tok.A, id.A, 'Former base', 'former-base'));
	must('C tombstoned', await pb('POST', '/api/collections/trip_members/records', {
		token: admin,
		body: { trip: former.id, user: id.C, role: 'traveler', removed_at: iso(plusDays(-1)) }
	}));

	console.log('\n— slug dedupe across users');
	const a1 = await createTrip(tok.A, id.A, 'Thailand', 'thailand');
	assert('A creates "Thailand" → slug thailand', a1.status === 200 && a1.data?.slug === 'thailand', a1);
	const d1 = await createTrip(tok.D, id.D, 'Thailand!', 'thailand');
	assert('D (cannot see A’s trip) creates same slug → 200 thailand-1', d1.status === 200 && d1.data?.slug === 'thailand-1', d1);
	const d2 = await createTrip(tok.D, id.D, 'Thailand', 'thailand');
	assert('third create → thailand-2', d2.status === 200 && d2.data?.slug === 'thailand-2', d2);
	const unique = await createTrip(tok.D, id.D, 'Unique place', 'unique-place');
	assert('non-colliding slug is left alone', unique.data?.slug === 'unique-place', unique);

	console.log('\n— same-name heads-up');
	let r = await sameName(tok.B, 'Thailand!');
	assert(
		'co-traveler B sees A’s trip by name (punctuation ignored)',
		r.status === 200 &&
			r.data.mine.length === 0 &&
			r.data.co_travelers.length === 1 &&
			r.data.co_travelers[0].name === 'User A' &&
			r.data.co_travelers[0].title === 'Thailand',
		r
	);
	assert('response never carries an email', !JSON.stringify(r.data).includes('@'), r.data);

	r = await sameName(tok.A, '  THAILAND ');
	assert('A sees own trip as "mine" (case/space-insensitive)', r.data?.mine?.[0]?.slug === 'thailand' && r.data.co_travelers.length === 0, r);

	r = await sameName(tok.C, 'Thailand');
	assert('C (tombstoned on A’s trip) sees nothing of A’s', r.data?.mine?.length === 0 && r.data.co_travelers.length === 0, r);

	// D owns thailand-1/-2 themself, so D's own trips show; A's never does.
	r = await sameName(tok.D, 'Thailand');
	assert(
		'stranger D sees only their own trips, never A’s',
		r.data?.mine?.length === 2 && r.data.co_travelers.length === 0,
		r
	);

	r = await sameName(tok.B, 'Thailand 2027');
	assert('a different name matches nothing', r.data?.mine?.length === 0 && r.data.co_travelers.length === 0, r);

	must('ended trip', await createTrip(tok.A, id.A, 'Peru', 'peru', { start_date: iso(plusDays(-30)), end_date: iso(plusDays(-20)) }));
	r = await sameName(tok.B, 'Peru');
	assert('an ENDED co-traveler trip is ignored', r.data?.co_travelers?.length === 0, r);

	must('current dated trip', await createTrip(tok.A, id.A, 'Chile', 'chile', { start_date: iso(plusDays(-1)), end_date: iso(plusDays(5)) }));
	r = await sameName(tok.B, 'chile');
	assert('a CURRENT dated co-traveler trip is reported', r.data?.co_travelers?.length === 1, r);

	const arch = must('archived trip', await createTrip(tok.A, id.A, 'Iceland', 'iceland'));
	must('archive it', await pb('PATCH', `/api/collections/trips/records/${arch.id}`, { token: tok.A, body: { archived: true } }));
	r = await sameName(tok.B, 'Iceland');
	assert('an ARCHIVED co-traveler trip is ignored', r.data?.co_travelers?.length === 0, r);

	r = await sameName(tok.B, '!!!');
	assert('an all-punctuation title matches nothing', r.status === 200 && r.data.mine.length === 0 && r.data.co_travelers.length === 0, r);

	r = await sameName(null, 'Thailand');
	assert('unauthenticated → 401', r.status === 401, r.status);

	console.log('\n— request an invite (never self-serve: notifies owner + co-owners only)');
	const thai = a1.data.id;
	r = await sameName(tok.B, 'Thailand');
	assert('same-name hands the co-traveler an opaque trip_id', r.data?.co_travelers?.[0]?.trip_id === thai, r.data);

	const request = (token, tripId) => pb('POST', '/api/trips/request-invite', { token, body: { trip_id: tripId } });
	const ownerNotes = async () => {
		const ownerMember = (
			await pb('GET', `/api/collections/trip_members/records?filter=${encodeURIComponent(`trip = "${thai}" && role = "owner"`)}`, { token: admin })
		).data.items[0];
		return (
			await pb('GET', `/api/collections/notifications/records?filter=${encodeURIComponent(`recipient = "${ownerMember.id}" && type = "invite_requested"`)}`, { token: admin })
		).data.items;
	};

	r = await request(tok.B, thai);
	assert('co-traveler B requests → 200, one notification sent', r.status === 200 && r.data?.sent === 1, r);
	assert('response names the owner B knows + the trip title', r.data?.name === 'User A' && r.data?.title === 'Thailand', r.data);
	let notes = await ownerNotes();
	assert(
		'owner gets “User B asked to join “Thailand”” linking to Members',
		notes.length === 1 && notes[0].body.startsWith('User B asked to join “Thailand”') && notes[0].link.startsWith('/trips/thailand/members'),
		notes
	);
	r = await request(tok.B, thai);
	notes = await ownerNotes();
	assert('a repeat while unread is not re-sent', r.status === 200 && r.data?.sent === 0 && notes.length === 1, { r, n: notes.length });

	const memberCount = async () =>
		(await pb('GET', `/api/collections/trip_members/records?filter=${encodeURIComponent(`trip = "${thai}" && user = "${id.B}"`)}`, { token: admin })).data.items.length;
	assert('requesting does NOT add B to the trip', (await memberCount()) === 0);

	r = await request(tok.D, thai);
	assert('stranger D (forged trip_id) → 403', r.status === 403, r);
	r = await request(tok.C, thai);
	assert('tombstoned C → 403', r.status === 403, r);
	r = await request(tok.A, thai);
	assert('a member asking to join their own trip → 400', r.status === 400, r);
	r = await request(tok.B, arch.id);
	assert('archived trip → 400', r.status === 400, r);
	r = await request(null, thai);
	assert('unauthenticated → 401', r.status === 401, r.status);

	console.log('\n— only actionable links; never after a removal; lenient last day');
	const yesterday = iso(plusDays(-1));
	must('Laos (ended yesterday UTC)', await createTrip(tok.A, id.A, 'Laos', 'laos', { start_date: iso(plusDays(-5)), end_date: yesterday }));
	r = await sameName(tok.B, 'Laos');
	assert('a trip whose last day was yesterday (UTC) still counts — west-of-UTC grace', r.data?.co_travelers?.length === 1, r);
	must('Cuba (ended 2 days ago)', await createTrip(tok.A, id.A, 'Cuba', 'cuba', { start_date: iso(plusDays(-6)), end_date: iso(plusDays(-2)) }));
	r = await sameName(tok.B, 'Cuba');
	assert('…but two days ago is over', r.data?.co_travelers?.length === 0, r);

	// Bali: A owns it; B was a member and got REMOVED. B still shares "Shared base" with A.
	const bali = must('Bali', await createTrip(tok.A, id.A, 'Bali', 'bali'));
	must('B on Bali, removed', await pb('POST', '/api/collections/trip_members/records', {
		token: admin,
		body: { trip: bali.id, user: id.B, role: 'traveler', removed_at: iso(plusDays(-1)) }
	}));
	r = await sameName(tok.B, 'Bali');
	assert('a trip B was removed from is never offered back', r.data?.co_travelers?.length === 0 && r.data?.mine?.length === 0, r);
	r = await request(tok.B, bali.id);
	assert('…and B can’t request to rejoin it → 403', r.status === 403, r);

	// Kenya: D owns it, A is only a TRAVELER there. B's only link is via A, who
	// can't invite — a request would be a dead end, so it isn't offered.
	const kenya = must('Kenya', await createTrip(tok.D, id.D, 'Kenya', 'kenya'));
	must('A travels on Kenya', await pb('POST', '/api/collections/trip_members/records', {
		token: admin,
		body: { trip: kenya.id, user: id.A, role: 'traveler' }
	}));
	r = await sameName(tok.B, 'Kenya');
	assert('a trip reached only via a plain traveler is not offered', r.data?.co_travelers?.length === 0, r);
	r = await request(tok.B, kenya.id);
	assert('…and requesting it (forged id) → 403', r.status === 403, r);

	console.log(`\n${pass} passed, ${fail} failed`);
	exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error(err);
	exit(1);
});
