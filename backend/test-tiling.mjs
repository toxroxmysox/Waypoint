#!/usr/bin/env node
// #411 — phase tiling (ADR-0021) enforced by PB, not only by the SvelteKit
// phases actions. After any phase create / start move / delete over REST, and
// after any trip date change, a trip's phases tile it: sorted by start, each
// end = the next phase's start, last ends at the trip end, first starts at the
// trip start, order = position. Invalid starts are refused with the messages of
// validateNewPhaseStart / validateMovePhaseStart; client end_date/order ignored.
//
//   bash scripts/backend-harnesses.sh tiling
//
// Exit 0 on green, 1 on any failure.

import { exit } from 'node:process';

const PB_URL = process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090';
const OWNER = 'rules-owner@e2e.test';

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
	if (r.status !== 200 && r.status !== 204) {
		console.error(`setup failed: ${label}: HTTP ${r.status}`, r.data);
		exit(2);
	}
	return r.data;
}

const D = (day) => `2026-08-${String(day).padStart(2, '0')} 00:00:00.000Z`;
const day10 = (s) => String(s || '').slice(0, 10);

let token;
let tripId;

const q = (f) => encodeURIComponent(f);
async function phases() {
	return must('list phases', await pb('GET', `/api/collections/phases/records?filter=${q(`trip="${tripId}"`)}&sort=start_date&perPage=200`, { token })).items;
}
async function trip() {
	return must('trip', await pb('GET', `/api/collections/trips/records/${tripId}`, { token }));
}

// The tiling invariant, checked against the trip's current dates.
async function tiles(name) {
	const t = await trip();
	const ps = await phases();
	const problems = [];
	if (ps.length === 0) problems.push('no phases');
	if (ps.length > 0 && day10(ps[0].start_date) !== day10(t.start_date)) problems.push(`first starts ${day10(ps[0].start_date)} not ${day10(t.start_date)}`);
	ps.forEach((p, i) => {
		const want = i < ps.length - 1 ? day10(ps[i + 1].start_date) : day10(t.end_date);
		if (day10(p.end_date) !== want) problems.push(`${p.name} ends ${day10(p.end_date)} not ${want}`);
		if (Number(p.order) !== i) problems.push(`${p.name} order ${p.order} not ${i}`);
	});
	assert(name, problems.length === 0, problems);
	return ps;
}

function rejects(name, r, message) {
	assert(name, r.status === 400 && r.data?.message === message, { status: r.status, message: r.data?.message });
}

const create = (name, start, extra = {}) =>
	pb('POST', '/api/collections/phases/records', {
		token,
		body: { trip: tripId, name, start_date: start, end_date: D(30), order: 77, ...extra }
	});
const move = (id, start) => pb('PATCH', `/api/collections/phases/records/${id}`, { token, body: { start_date: start } });

async function dayPhases(day) {
	const days = must('days', await pb('GET', `/api/collections/days/records?filter=${q(`trip="${tripId}" && date="${D(day)}"`)}`, { token })).items;
	return days[0]?.phases || [];
}

async function main() {
	console.log(`PB: ${PB_URL}`);
	const auth = must('auth', await pb('POST', '/api/dev/auth-bypass', { body: { email: OWNER } }));
	token = auth.token;
	const t = must(
		'trip',
		await pb('POST', '/api/collections/trips/records', {
			token,
			body: {
				title: 'Tiling harness',
				slug: 'tiling-harness-' + Date.now(),
				created_by: auth.record.id,
				timezone: 'UTC',
				start_date: D(1),
				end_date: D(10)
			}
		})
	);
	tripId = t.id;
	const [p1] = await phases();

	console.log('\n[create]');
	const b = await create('B', D(4));
	assert('create B (junk end/order)', b.status === 200, b);
	assert('B response already tiled', day10(b.data?.end_date) === '2026-08-10' && Number(b.data?.order) === 1, b.data && { end: b.data.end_date, order: b.data.order });
	const c = await create('C', D(7));
	assert('create C', c.status === 200, c);
	await tiles('3 phases tile the trip');
	rejects('create on an existing boundary', await create('X', D(4)), 'A phase already starts on that day.');
	rejects('create on the trip start', await create('X', D(1)), 'A new phase must start after the trip begins.');
	rejects('create on the trip end', await create('X', D(10)), 'A new phase must start before the trip ends.');

	console.log('\n[move]');
	rejects('move B past C', await move(b.data.id, D(8)), 'This phase must start between 2026-08-01 and 2026-08-07.');
	rejects('move the first phase', await move(p1.id, D(2)), 'The first phase must start when the trip begins.');
	assert('move B to the 5th', (await move(b.data.id, D(5))).status === 200);
	await tiles('tiled after a move');
	const d5 = await dayPhases(5);
	const d6 = await dayPhases(6);
	assert('boundary day 5 holds both phases', d5.length === 2 && d5.includes(p1.id) && d5.includes(b.data.id), d5);
	assert('day 6 holds only B', d6.length === 1 && d6[0] === b.data.id, d6);

	const before = await phases();
	await pb('PATCH', `/api/collections/phases/records/${c.data.id}`, { token, body: { name: 'C renamed' } });
	const after = await phases();
	const untouched = before.filter((p) => p.id !== c.data.id).every((p) => after.find((a) => a.id === p.id)?.updated === p.updated);
	assert('no-op edit leaves siblings untouched', untouched);
	const junk = await pb('PATCH', `/api/collections/phases/records/${c.data.id}`, { token, body: { end_date: D(9), order: 9 } });
	assert('client end_date/order on update are ignored', junk.status === 200 && day10(junk.data?.end_date) === '2026-08-10' && Number(junk.data?.order) === 2, junk.data && { end: junk.data.end_date, order: junk.data.order });

	console.log('\n[delete]');
	must('delete B', await pb('DELETE', `/api/collections/phases/records/${b.data.id}`, { token }));
	await tiles('middle delete: predecessor extends');
	must('delete first', await pb('DELETE', `/api/collections/phases/records/${p1.id}`, { token }));
	const afterFirst = await tiles('first delete: next phase starts at the trip start');
	assert('C is now first', afterFirst[0]?.id === c.data.id, afterFirst.map((p) => p.name));

	console.log('\n[trip dates]');
	const e = must('create E', await create('E', D(5)));
	const f = must('create F', await create('F', D(8)));
	const idea = must(
		'idea in F',
		await pb('POST', '/api/collections/items/records', { token, body: { trip: tripId, phase: f.id, type: 'activity', title: 'Idea in F' } })
	);
	const list = must(
		'checklist in F',
		await pb('POST', '/api/collections/checklists/records', { token, body: { trip: tripId, phase: f.id, title: 'F list', kind: 'manual' } })
	);
	// An item on a pruned day with no phase of its own takes the day's phase —
	// which must be a surviving one, not the merged-away F (#411 review M5).
	const d10 = must('day 10', await pb('GET', `/api/collections/days/records?filter=${q(`trip="${tripId}" && date="${D(10)}"`)}`, { token })).items[0];
	const lateItem = must(
		'item on day 10',
		await pb('POST', '/api/collections/items/records', { token, body: { trip: tripId, day: d10.id, type: 'activity', title: 'Day 10 plan', status: 'planned' } })
	);
	must('shrink end to the 8th', await pb('PATCH', `/api/collections/trips/records/${tripId}`, { token, body: { end_date: D(8) } }));
	const shrunk = await tiles('shrink: a phase starting on the new end merges into its predecessor');
	assert('F is gone', !shrunk.find((p) => p.id === f.id), shrunk.map((p) => p.name));
	const ideaAfter = (await pb('GET', `/api/collections/items/records/${idea.id}`, { token })).data;
	assert('F idea re-homed to E', ideaAfter?.phase === e.id, ideaAfter?.phase);
	const listAfter = await pb('GET', `/api/collections/checklists/records/${list.id}`, { token });
	const lateAfter = (await pb('GET', `/api/collections/items/records/${lateItem.id}`, { token })).data;
	assert('pruned-day item lands in a surviving phase', lateAfter?.day === '' && lateAfter?.phase === e.id, lateAfter && { day: lateAfter.day, phase: lateAfter.phase });
	assert('F checklist re-homed to E', listAfter.status === 200 && listAfter.data?.phase === e.id, { status: listAfter.status, phase: listAfter.data?.phase });

	const cIdea = must(
		'idea in C',
		await pb('POST', '/api/collections/items/records', { token, body: { trip: tripId, phase: c.data.id, type: 'activity', title: 'Idea in C' } })
	);
	must('move trip start past E', await pb('PATCH', `/api/collections/trips/records/${tripId}`, { token, body: { start_date: D(6) } }));
	const moved = await tiles('later start: the first phase is pinned, earlier phases merge');
	assert('E is the only phase', moved.length === 1 && moved[0].id === e.id, moved.map((p) => p.name));
	const cIdeaAfter = (await pb('GET', `/api/collections/items/records/${cIdea.id}`, { token })).data;
	assert('C idea re-homed to E', cIdeaAfter?.phase === e.id, cIdeaAfter?.phase);

	must('extend end to the 12th', await pb('PATCH', `/api/collections/trips/records/${tripId}`, { token, body: { end_date: '2026-08-12 00:00:00.000Z' } }));
	await tiles('extend: last phase grows to the new end');
	const d12 = must('day 12', await pb('GET', `/api/collections/days/records?filter=${q(`trip="${tripId}" && date="2026-08-12 00:00:00.000Z"`)}`, { token })).items;
	assert('new day bucketed into the last phase', d12[0]?.phases?.includes(e.id), d12[0]?.phases);

	console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass}/${pass + fail}`);
	exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error('harness crashed:', err);
	exit(2);
});
