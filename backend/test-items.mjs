#!/usr/bin/env node
// #411 — item validity enforced by items.pb.js on every save (REST and admin),
// not only by the SvelteKit item actions:
//   - day / phase / parent_item belong to the item's trip
//   - no day on a trip with phases → a phase is required
//   - a note can't be booked (meals can: #462 reservations)
//   - end_date needs a day, falls after that day, and on/before the trip's end
//   - no day + status "planned" is stored as "unplanned"
// Also proves the model hook covers admin saves (an owner's auto-approved
// suggestion, saved by suggestions.pb.js in admin context).
//
// Fixture trip (rules-fixture) runs 2026-06-01..03 with two phases; a second
// trip from the same owner supplies the foreign day/phase/item.
//
//   bash scripts/backend-harnesses.sh items
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

// 400 carrying exactly this message.
function rejects(name, r, message) {
	assert(name, r.status === 400 && r.data?.message === message, { status: r.status, message: r.data?.message });
}
function accepts(name, r) {
	assert(name, r.status === 200, { status: r.status, data: r.data });
}

async function main() {
	console.log(`PB: ${PB_URL}`);
	const fx = must('rules-fixture', await pb('POST', '/api/dev/rules-fixture', { body: { emails: EMAILS } }));
	const owner = must('auth owner', await pb('POST', '/api/dev/auth-bypass', { body: { email: EMAILS.owner } })).token;

	// Second trip, same owner: the source of foreign day / phase / item ids.
	const other = await pb('POST', '/api/collections/trips/records', {
		token: owner,
		body: {
			title: 'Items harness other trip',
			slug: 'items-harness-other',
			created_by: fx.userIds.owner,
			timezone: 'UTC',
			start_date: '2026-07-01 00:00:00.000Z',
			end_date: '2026-07-03 00:00:00.000Z'
		}
	});
	if (other.status !== 200) {
		console.error('setup failed: other trip', other);
		exit(2);
	}
	const otherTrip = other.data.id;
	const otherDays = must(
		'other days',
		await pb('GET', `/api/collections/days/records?filter=${encodeURIComponent(`trip="${otherTrip}"`)}&sort=date`, { token: owner })
	).items;
	const otherPhases = must(
		'other phases',
		await pb('GET', `/api/collections/phases/records?filter=${encodeURIComponent(`trip="${otherTrip}"`)}`, { token: owner })
	).items;
	const otherItem = must(
		'other item',
		await pb('POST', '/api/collections/items/records', {
			token: owner,
			body: { trip: otherTrip, day: otherDays[0].id, type: 'activity', title: 'Other trip item', status: 'planned' }
		})
	);

	const base = { trip: fx.tripId, type: 'activity', title: 'Harness item' };
	const create = (body, token = owner) => pb('POST', '/api/collections/items/records', { token, body: { ...base, ...body } });
	const patch = (id, body, token = owner) => pb('PATCH', `/api/collections/items/records/${id}`, { token, body });

	console.log('\n[create]');
	accepts('valid day item', await create({ day: fx.dayId, status: 'planned' }));
	rejects('foreign day', await create({ day: otherDays[0].id }), "That day isn't on this trip.");
	rejects('foreign phase', await create({ day: fx.dayId, phase: otherPhases[0].id }), "That phase isn't on this trip.");
	rejects('no day, no phase on a phased trip', await create({}), 'Pick a phase for an unscheduled item, or assign it to a day.');
	accepts('no day, own phase', await create({ phase: fx.phaseId }));
	accepts('booked meal (a reservation, #462)', await create({ day: fx.dayId, type: 'meal', booked: true }));
	rejects('booked note', await create({ day: fx.dayId, type: 'note', booked: true }), 'Note items cannot be marked as booked.');
	accepts('booked activity', await create({ day: fx.dayId, booked: true }));
	rejects(
		'end_date without a day',
		await create({ phase: fx.phaseId, type: 'lodging', end_date: '2026-06-03 00:00:00.000Z' }),
		'Pick a start day before setting an end date.'
	);
	rejects(
		'end_date on the start day',
		await create({ day: fx.dayId, type: 'lodging', end_date: '2026-06-01 00:00:00.000Z' }),
		'End date must be after the start day.'
	);
	rejects(
		'end_date after trip end',
		await create({ day: fx.dayId, type: 'lodging', end_date: '2026-06-04 00:00:00.000Z' }),
		'End date is after the trip ends.'
	);
	accepts('lodging spanning to trip end', await create({ day: fx.dayId, type: 'lodging', end_date: '2026-06-03 00:00:00.000Z' }));
	accepts('red-eye flight next day', await create({ day: fx.dayId, type: 'flight', end_date: '2026-06-02 00:00:00.000Z' }));
	rejects('flight landing after trip end', await create({ day: fx.dayId2, type: 'flight', end_date: '2026-06-05 00:00:00.000Z' }), 'End date is after the trip ends.');
	rejects('foreign parent_item', await create({ day: fx.dayId, parent_item: otherItem.id }), "That item isn't on this trip.");
	accepts('own parent_item', await create({ day: fx.dayId, parent_item: fx.itemId }));
	accepts('empty-string relations treated as absent', await create({ day: fx.dayId, phase: '', parent_item: '' }));

	const unplanned = await create({ phase: fx.phaseId, status: 'planned' });
	assert('no day + planned stored as unplanned', unplanned.data?.status === 'unplanned', unplanned.data?.status);

	console.log('\n[update]');
	const item = (await create({ day: fx.dayId, status: 'planned' })).data;
	rejects('move to a foreign day', await patch(item.id, { day: otherDays[0].id }), "That day isn't on this trip.");
	rejects('unschedule without a phase', await patch(item.id, { day: '' }), 'Pick a phase for an unscheduled item, or assign it to a day.');
	const moved = await patch(item.id, { day: '', phase: fx.phaseId });
	accepts('unschedule into a phase', moved);
	assert('unscheduled planned item becomes unplanned', moved.data?.status === 'unplanned', moved.data?.status);
	rejects('end_date past trip end', await patch(item.id, { day: fx.dayId, end_date: '2026-06-09 00:00:00.000Z' }), 'End date is after the trip ends.');
	accepts('title-only edit', await patch(item.id, { title: 'Renamed' }));

	// An owner's suggestion auto-approves: suggestions.pb.js builds the item and
	// saves it in admin context (e.app.save), where request hooks don't fire.
	console.log('\n[admin saves]');
	const suggest = (payload) =>
		pb('POST', '/api/suggestions/create', { token: owner, body: { trip_id: fx.tripId, payload: { title: 'Admin-path item', ...payload } } });
	accepts('admin save: valid item', await suggest({ day: fx.dayId, type: 'activity' }));
	rejects('admin save: booked note', await suggest({ day: fx.dayId, type: 'note', booked: true }), 'Note items cannot be marked as booked.');

	// Trip shrink (trips.pb.js) unschedules the pruned days' items in admin
	// context. They must stay valid: keep a phase, drop the span, go unplanned.
	console.log('\n[trip shrink]');
	const days = must(
		'fixture days',
		await pb('GET', `/api/collections/days/records?filter=${encodeURIComponent(`trip="${fx.tripId}"`)}&sort=date`, { token: owner })
	).items;
	const lastDay = days[days.length - 1];
	const stranded = (await create({ day: lastDay.id, status: 'planned' })).data;
	const shrink = await pb('PATCH', `/api/collections/trips/records/${fx.tripId}`, {
		token: owner,
		body: { end_date: days[days.length - 2].date }
	});
	accepts('owner shrinks the trip by a day', shrink);
	const after = await pb('GET', `/api/collections/items/records/${stranded.id}`, { token: owner });
	assert(
		'pruned day item is unscheduled into a phase',
		after.status === 200 && after.data.day === '' && after.data.phase !== '' && after.data.status === 'unplanned',
		after.data && { day: after.data.day, phase: after.data.phase, status: after.data.status }
	);

	console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass}/${pass + fail}`);
	exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error('harness crashed:', err);
	exit(2);
});
