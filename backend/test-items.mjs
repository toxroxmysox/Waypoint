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
	assert(name, r.status === 400 && r.data?.message === message, {
		status: r.status,
		message: r.data?.message
	});
}
function accepts(name, r) {
	assert(name, r.status === 200, { status: r.status, data: r.data });
}

async function main() {
	console.log(`PB: ${PB_URL}`);
	const fx = must(
		'rules-fixture',
		await pb('POST', '/api/dev/rules-fixture', { body: { emails: EMAILS } })
	);
	const owner = must(
		'auth owner',
		await pb('POST', '/api/dev/auth-bypass', { body: { email: EMAILS.owner } })
	).token;

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
		await pb(
			'GET',
			`/api/collections/days/records?filter=${encodeURIComponent(`trip="${otherTrip}"`)}&sort=date`,
			{ token: owner }
		)
	).items;
	const otherPhases = must(
		'other phases',
		await pb(
			'GET',
			`/api/collections/phases/records?filter=${encodeURIComponent(`trip="${otherTrip}"`)}`,
			{ token: owner }
		)
	).items;
	const otherItem = must(
		'other item',
		await pb('POST', '/api/collections/items/records', {
			token: owner,
			body: {
				trip: otherTrip,
				day: otherDays[0].id,
				type: 'activity',
				title: 'Other trip item',
				status: 'planned'
			}
		})
	);

	const base = { trip: fx.tripId, type: 'activity', title: 'Harness item' };
	const create = (body, token = owner) =>
		pb('POST', '/api/collections/items/records', { token, body: { ...base, ...body } });
	const patch = (id, body, token = owner) =>
		pb('PATCH', `/api/collections/items/records/${id}`, { token, body });

	console.log('\n[create]');
	accepts('valid day item', await create({ day: fx.dayId, status: 'planned' }));
	rejects('foreign day', await create({ day: otherDays[0].id }), "That day isn't on this trip.");
	rejects(
		'foreign phase',
		await create({ day: fx.dayId, phase: otherPhases[0].id }),
		"That phase isn't on this trip."
	);
	rejects(
		'no day, no phase on a phased trip',
		await create({}),
		'Pick a phase for an unscheduled item, or assign it to a day.'
	);
	accepts('no day, own phase', await create({ phase: fx.phaseId }));
	accepts(
		'booked meal (a reservation, #462)',
		await create({ day: fx.dayId, type: 'meal', booked: true })
	);
	rejects(
		'booked note',
		await create({ day: fx.dayId, type: 'note', booked: true }),
		'Note items cannot be marked as booked.'
	);
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
	accepts(
		'lodging spanning to trip end',
		await create({ day: fx.dayId, type: 'lodging', end_date: '2026-06-03 00:00:00.000Z' })
	);
	accepts(
		'red-eye flight next day',
		await create({ day: fx.dayId, type: 'flight', end_date: '2026-06-02 00:00:00.000Z' })
	);
	rejects(
		'flight landing after trip end',
		await create({ day: fx.dayId2, type: 'flight', end_date: '2026-06-05 00:00:00.000Z' }),
		'End date is after the trip ends.'
	);
	rejects(
		'foreign parent_item',
		await create({ day: fx.dayId, parent_item: otherItem.id }),
		"That item isn't on this trip."
	);
	accepts('own parent_item', await create({ day: fx.dayId, parent_item: fx.itemId }));
	accepts(
		'empty-string relations treated as absent',
		await create({ day: fx.dayId, phase: '', parent_item: '' })
	);

	const unplanned = await create({ phase: fx.phaseId, status: 'planned' });
	assert(
		'no day + planned stored as unplanned',
		unplanned.data?.status === 'unplanned',
		unplanned.data?.status
	);

	console.log('\n[update]');
	const item = (await create({ day: fx.dayId, status: 'planned' })).data;
	rejects(
		'move to a foreign day',
		await patch(item.id, { day: otherDays[0].id }),
		"That day isn't on this trip."
	);
	rejects(
		'unschedule without a phase',
		await patch(item.id, { day: '' }),
		'Pick a phase for an unscheduled item, or assign it to a day.'
	);
	const moved = await patch(item.id, { day: '', phase: fx.phaseId });
	accepts('unschedule into a phase', moved);
	assert(
		'unscheduled planned item becomes unplanned',
		moved.data?.status === 'unplanned',
		moved.data?.status
	);
	rejects(
		'end_date past trip end',
		await patch(item.id, { day: fx.dayId, end_date: '2026-06-09 00:00:00.000Z' }),
		'End date is after the trip ends.'
	);
	accepts('title-only edit', await patch(item.id, { title: 'Renamed' }));

	// An owner's suggestion auto-approves: suggestions.pb.js builds the item and
	// saves it in admin context (e.app.save), where request hooks don't fire.
	console.log('\n[admin saves]');
	const suggest = (payload) =>
		pb('POST', '/api/suggestions/create', {
			token: owner,
			body: { trip_id: fx.tripId, payload: { title: 'Admin-path item', ...payload } }
		});
	accepts('admin save: valid item', await suggest({ day: fx.dayId, type: 'activity' }));
	rejects(
		'admin save: booked note',
		await suggest({ day: fx.dayId, type: 'note', booked: true }),
		'Note items cannot be marked as booked.'
	);

	// Trip shrink (trips.pb.js) unschedules the pruned days' items in admin
	// context. They must stay valid: keep a phase, drop the span, go unplanned.
	console.log('\n[trip shrink]');
	const days = must(
		'fixture days',
		await pb(
			'GET',
			`/api/collections/days/records?filter=${encodeURIComponent(`trip="${fx.tripId}"`)}&sort=date`,
			{ token: owner }
		)
	).items;
	const lastDay = days[days.length - 1];
	const stranded = (await create({ day: lastDay.id, status: 'planned' })).data;
	const stay = (await create({ day: days[0].id, type: 'lodging', end_date: lastDay.date })).data;
	const shrink = await pb('PATCH', `/api/collections/trips/records/${fx.tripId}`, {
		token: owner,
		body: { end_date: days[days.length - 2].date }
	});
	accepts('owner shrinks the trip by a day', shrink);
	const after = await pb('GET', `/api/collections/items/records/${stranded.id}`, { token: owner });
	assert(
		'pruned day item is unscheduled into a phase',
		after.status === 200 &&
			after.data.day === '' &&
			after.data.phase !== '' &&
			after.data.status === 'unplanned',
		after.data && { day: after.data.day, phase: after.data.phase, status: after.data.status }
	);

	const stayAfter = (await pb('GET', `/api/collections/items/records/${stay.id}`, { token: owner }))
		.data;
	assert(
		'a kept-day span is clamped to the new trip end',
		stayAfter?.end_date?.slice(0, 10) === days[days.length - 2].date.slice(0, 10),
		stayAfter?.end_date
	);

	// #576 — rating: only `done` items carry one; leaving done clears it.
	{
		const day0 = days[0];
		const r = (
			await pb('POST', '/api/collections/items/records', {
				token: owner,
				body: { ...base, day: day0.id, status: 'done' }
			})
		).data;
		const patch = (body) =>
			pb('PATCH', `/api/collections/items/records/${r.id}`, { token: owner, body });
		const read = async () =>
			(await pb('GET', `/api/collections/items/records/${r.id}`, { token: owner })).data?.rating;
		await patch({ rating: 'recommend' });
		assert('rating: set recommend on a done item', (await read()) === 'recommend', await read());
		await patch({ status: 'planned', rating: 'recommend' });
		assert('rating: set on a planned item is cleared', (await read()) === '', await read());
		await patch({ status: 'done', rating: 'not_recommend' });
		await patch({ status: 'considered' });
		assert('rating: done -> considered clears it', (await read()) === '', await read());
		await patch({ status: 'done' });
		assert('rating: considered -> done stays unrated', (await read()) === '', await read());
		const bad = await patch({ rating: 'meh' });
		assert('rating: bad value rejected', bad.status === 400, bad.status);
		const created = await pb('POST', '/api/collections/items/records', {
			token: owner,
			body: { ...base, day: day0.id, status: 'planned', rating: 'recommend' }
		});
		assert(
			'rating: create on a planned item is cleared',
			created.status === 200 && created.data.rating === '',
			created.data?.rating
		);
	}

	// #576 — closeout: once the trip has ended (archived, or end_date before
	// today in the trip's timezone) a traveler may resolve (status) and rate an
	// item, and add a done replacement. Nothing else; viewers never.
	console.log('\n[closeout]');
	{
		const traveler = must(
			'auth traveler',
			await pb('POST', '/api/dev/auth-bypass', { body: { email: EMAILS.traveler } })
		).token;
		const viewer = must(
			'auth viewer',
			await pb('POST', '/api/dev/auth-bypass', { body: { email: EMAILS.viewer } })
		).token;
		const admin = must(
			'auth admin',
			await pb('POST', '/api/collections/_superusers/auth-with-password', {
				body: { identity: 'admin@e2e.test', password: 'e2eAdminPass123' }
			})
		).token;
		// fx.tripId runs 2026-06 (ended). Mint an owner item on it per case.
		const day0 = days[0];
		const mk = async (status) =>
			(
				await pb('POST', '/api/collections/items/records', {
					token: owner,
					body: { ...base, day: day0.id, status }
				})
			).data;
		const read = async (id) =>
			(await pb('GET', `/api/collections/items/records/${id}`, { token: owner })).data;

		const a = await mk('planned');
		const r1 = await patch(a.id, { status: 'done', rating: 'recommend' }, traveler);
		const a2 = await read(a.id);
		assert(
			'closeout: traveler marks done + recommend',
			r1.status === 200 && a2?.status === 'done' && a2?.rating === 'recommend',
			{ status: r1.status, msg: r1.data?.message, got: a2 && [a2.status, a2.rating] }
		);

		const b = await mk('planned');
		const r2 = await patch(b.id, { status: 'considered' }, traveler);
		assert('closeout: traveler marks considered', r2.status === 200, {
			status: r2.status,
			msg: r2.data?.message
		});

		const r3 = await create({ day: day0.id, status: 'done', title: 'Replacement' }, traveler);
		assert('closeout: traveler adds a done replacement', r3.status === 200, {
			status: r3.status,
			msg: r3.data?.message
		});
		const r3b = await create({ day: day0.id, status: 'planned', title: 'Sneaky' }, traveler);
		assert('closeout: traveler cannot add a planned item', r3b.status === 403, r3b.status);

		const c = await mk('planned');
		const r4 = await patch(c.id, { title: 'Hacked', status: 'done' }, traveler);
		assert('closeout: traveler changes title after trip end', r4.status === 403, r4.status);

		const v = await mk('done');
		const r5 = await patch(v.id, { rating: 'recommend' }, viewer);
		assert('closeout: viewer sets rating', r5.status === 403, r5.status);
		const r5b = await create({ day: day0.id, status: 'done' }, viewer);
		assert('closeout: viewer adds a done item', r5b.status === 403, r5b.status);

		// Active trip (dates spanning today) with the traveler on it.
		const iso = (d) => d.toISOString().slice(0, 10) + ' 00:00:00.000Z';
		const now = Date.now();
		const mkTrip = async (slug, extra) => {
			const t = must(
				'trip ' + slug,
				await pb('POST', '/api/collections/trips/records', {
					token: owner,
					body: {
						title: 'Closeout ' + slug,
						slug,
						created_by: fx.userIds.owner,
						timezone: 'UTC',
						start_date: iso(new Date(now - 86400000)),
						end_date: iso(new Date(now + 86400000)),
						...extra
					}
				})
			);
			must(
				'traveler joins ' + slug,
				await pb('POST', '/api/collections/trip_members/records', {
					token: admin,
					body: { trip: t.id, user: fx.userIds.traveler, role: 'traveler' }
				})
			);
			const dayRows = must(
				'days ' + slug,
				await pb(
					'GET',
					`/api/collections/days/records?filter=${encodeURIComponent(`trip="${t.id}"`)}&sort=date`,
					{ token: owner }
				)
			).items;
			const it = must(
				'item ' + slug,
				await pb('POST', '/api/collections/items/records', {
					token: owner,
					body: { trip: t.id, type: 'activity', title: 'X', day: dayRows[0].id, status: 'planned' }
				})
			);
			return { t, it, day: dayRows[0].id };
		};
		const active = await mkTrip('closeout-active', {});
		const r6 = await patch(active.it.id, { status: 'done' }, traveler);
		assert('closeout: traveler sets done on an active trip', r6.status === 403, r6.status);
		const r6b = await pb('POST', '/api/collections/items/records', {
			token: traveler,
			body: { trip: active.t.id, type: 'activity', title: 'R', day: active.day, status: 'done' }
		});
		assert('closeout: traveler adds done on an active trip', r6b.status === 403, r6b.status);

		// Archived while dates still span today -> closed.
		const arch = await mkTrip('closeout-archived', {});
		must(
			'archive',
			await pb('PATCH', `/api/collections/trips/records/${arch.t.id}`, {
				token: owner,
				body: { archived: true }
			})
		);
		const r7 = await patch(arch.it.id, { status: 'done', rating: 'not_recommend' }, traveler);
		assert('closeout: traveler rates on an archived trip', r7.status === 200, {
			status: r7.status,
			msg: r7.data?.message
		});

		// end_date yesterday (UTC) in a UTC+14 zone is long past -> ended.
		const ahead = await mkTrip('closeout-ahead', {
			timezone: 'Pacific/Kiritimati',
			start_date: iso(new Date(now - 3 * 86400000)),
			end_date: iso(new Date(now - 86400000))
		});
		const r8 = await patch(ahead.it.id, { status: 'done' }, traveler);
		assert('closeout: ended per trip-local date (end yesterday)', r8.status === 200, r8.status);
		// end_date = today in UTC is the last day, not ended.
		const endsToday = await mkTrip('closeout-today', {
			timezone: 'UTC',
			start_date: iso(new Date(now - 3 * 86400000)),
			end_date: iso(new Date(now))
		});
		const r9 = await patch(endsToday.it.id, { status: 'done' }, traveler);
		assert('closeout: end_date today is not ended yet', r9.status === 403, r9.status);

		// Unplanned ideas are owner curation: a traveler can't resolve one.
		const idea = (
			await pb('POST', '/api/collections/items/records', {
				token: owner,
				body: { ...base, phase: fx.phaseId, status: 'unplanned' }
			})
		).data;
		const r11 = await patch(idea.id, { status: 'considered' }, traveler);
		assert('closeout: traveler resolves an unplanned idea', r11.status === 403, r11.status);

		// Replacement may not smuggle other fields.
		const r12 = await create(
			{ day: day0.id, status: 'done', created_by: fx.memberIds.traveler },
			traveler
		);
		assert('closeout: traveler done create with created_by', r12.status === 403, r12.status);
		const r13 = await create({ day: day0.id, status: 'done', cost_actual_usd: 50 }, traveler);
		assert('closeout: traveler done create with cost_actual_usd', r13.status === 403, r13.status);
		const r13b = await create(
			{ day: day0.id, status: 'done', assigned_to: [fx.memberIds.owner] },
			traveler
		);
		assert('closeout: traveler done create with assigned_to', r13b.status === 403, r13b.status);
		// The exact addReplacement payload still works.
		const r13c = await pb('POST', '/api/collections/items/records', {
			token: traveler,
			body: {
				trip: fx.tripId,
				day: day0.id,
				phase: '',
				type: 'activity',
				title: 'Swap',
				status: 'done',
				booked: false,
				sort_order: 999
			}
		});
		assert('closeout: addReplacement payload accepted', r13c.status === 200, {
			status: r13c.status,
			msg: r13c.data?.message
		});

		// Status change + assigning someone else is not a closeout step.
		const d = await mk('planned');
		const r14 = await patch(d.id, { status: 'done', assigned_to: [fx.memberIds.owner] }, traveler);
		assert('closeout: status change plus assigned_to other', r14.status === 403, r14.status);

		// Owner unaffected.
		const r10 = await patch(active.it.id, { status: 'done' }, owner);
		assert('closeout: owner unaffected on an active trip', r10.status === 200, r10.status);
	}

	console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass}/${pass + fail}`);
	exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error('harness crashed:', err);
	exit(2);
});
