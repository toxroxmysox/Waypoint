#!/usr/bin/env node
// #542 — goja smoke test of the REAL digest run (digest.pb.js → digest-core.js).
//
// Vitest drives runDigest with fakes (src/lib/digest/digest-run.test.ts); that
// can't catch goja-only behaviour — require() from the hook, DateTime/Timezone,
// Go slices from getStringSlice, the JSON-field shape of digest_state. This hits
// the dev-guarded POST /api/digest/run on a fresh PB.
//
// DRY RUNS ONLY — it never sends email and never lets the run write state; the
// "already baselined" state is set directly as superuser.
//
// Run against a fresh PB:  bash scripts/backend-harnesses.sh digest
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

const run = (body) => pb('POST', '/api/digest/run', { body: { dry_run: true, ...body } });

async function main() {
	console.log(`PB: ${PB_URL}`);
	const admin = must(
		'superuser auth',
		await pb('POST', '/api/collections/_superusers/auth-with-password', {
			body: { identity: 'admin@e2e.test', password: 'e2eAdminPass123' }
		})
	).token;
	const fx = must(
		'rules-fixture',
		await pb('POST', '/api/dev/rules-fixture', { body: { emails: EMAILS } })
	);
	const trip = must(
		'fixture trip',
		await pb('GET', `/api/collections/trips/records/${fx.tripId}`, { token: admin })
	);

	console.log('\n— a never-digested trip is baselined, not emailed');
	const first = must('dry run 1', await run({ force: true }));
	assert('the run reports no errors', first.errors.length === 0, first.errors);
	assert('fixture trip is baselined (dry)', first.baselined.includes(trip.slug + ' (dry)'), first);
	assert('nothing is composed', first.emails.length === 0, first.emails);

	console.log('\n— a baselined trip with a new item composes one email per member');
	// Baseline with no items + a real IANA zone (exercises goja Timezone).
	must(
		'set baseline',
		await pb('PATCH', `/api/collections/trips/records/${fx.tripId}`, {
			token: admin,
			body: { digest_state: {}, timezone: 'America/Detroit' }
		})
	);
	const members = must(
		'members',
		await pb(
			'GET',
			`/api/collections/trip_members/records?filter=${encodeURIComponent(`trip="${fx.tripId}"`)}`,
			{ token: admin }
		)
	).items;
	const ownerMember = members.find((m) => m.user === fx.userIds.owner);
	const owner = must(
		'auth owner',
		await pb('POST', '/api/dev/auth-bypass', { body: { email: EMAILS.owner } })
	).token;
	const days = must(
		'days',
		await pb(
			'GET',
			`/api/collections/days/records?filter=${encodeURIComponent(`trip="${fx.tripId}"`)}&sort=date`,
			{ token: admin }
		)
	).items;
	must(
		'item',
		await pb('POST', '/api/collections/items/records', {
			token: owner,
			body: {
				trip: fx.tripId,
				day: days[0].id,
				type: 'activity',
				title: 'Digest smoke item',
				status: 'planned',
				requires_booking: true,
				assigned_to: ownerMember ? [ownerMember.id] : []
			}
		})
	);

	const second = must('dry run 2', await run({ force: true }));
	assert('the run reports no errors', second.errors.length === 0, second.errors);
	const mine = second.emails.filter((e) => e.trips.includes(trip.slug));
	const to = mine.map((e) => e.original_recipient).sort();
	assert(
		'every active member gets one email',
		JSON.stringify(to) ===
			JSON.stringify([EMAILS.co_owner, EMAILS.owner, EMAILS.traveler, EMAILS.viewer].sort()),
		to
	);
	assert(
		'emails are dry and say what changed',
		mine.every(
			(e) =>
				e.dry_run === true &&
				e.subject === 'What changed on ' + trip.title &&
				e.text.includes('Digest smoke item')
		),
		mine.map((e) => ({ subject: e.subject, dry: e.dry_run }))
	);
	assert('no trip state was written', second.trips_updated.length === 0, second.trips_updated);

	const after = must(
		'trip after',
		await pb('GET', `/api/collections/trips/records/${fx.tripId}`, { token: admin })
	);
	assert(
		'digest_state still the baseline',
		JSON.stringify(after.digest_state) === '{}',
		after.digest_state
	);

	console.log('\n— without force, the trip is composed only at 8am trip-local');
	// The hour PB's run saw is the hour now; re-check it after so a run that
	// straddled the boundary is reported as such rather than as a failure.
	const detroitHour = () =>
		Number(
			new Intl.DateTimeFormat('en-US', {
				timeZone: 'America/Detroit',
				hour: 'numeric',
				hourCycle: 'h23'
			})
				.formatToParts(new Date())
				.find((x) => x.type === 'hour').value
		);
	const before = detroitHour();
	const unforced = must('dry run 3', await run({}));
	const hour = detroitHour();
	assert('the run reports no errors', unforced.errors.length === 0, unforced.errors);
	const composed = unforced.emails.some((e) => e.trips.includes(trip.slug));
	if (before !== hour) {
		console.log('  SKIP  window check (run straddled an hour boundary)');
	} else if (hour === 8) {
		assert('at 8am Detroit the fixture trip is composed', composed, unforced);
	} else {
		assert(
			'at ' + hour + 'h Detroit the fixture trip is not due',
			!composed && unforced.not_due >= 1,
			unforced
		);
	}

	console.log(`\n${pass} passed, ${fail} failed`);
	exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error(err);
	exit(1);
});
