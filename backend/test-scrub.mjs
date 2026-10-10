#!/usr/bin/env node
// #449 — migration 0073 (scrub stored emails) against a fresh PB, the way the
// 3.0 deploy runs it: existing data first, then PB boots and applies 0073.
//
// This harness owns its PB (it has to seed BEFORE 0073 runs, which the shared
// runner's already-migrated PB can't give it):
//   1. copy every migration numbered below 0073 + a seed migration into a temp
//      dir, `migrate up` → the pre-deploy schema with pre-#415 rows in it;
//   2. add the real 0073+ migrations and `serve` → PB applies 0073 on boot,
//      exactly as on prod;
//   3. assert #409's acceptance (no "joined the trip" body and no tombstoned
//      display_name contains an "@"), and that every control row is unchanged
//      (content, and `updated` still equal to `created` = never re-saved);
//   4. add a renamed copy of 0073 and boot again → a SECOND run, which must
//      change nothing (every seeded row byte-identical, `updated` included).
//
// PB runs with an empty environment (PATH/HOME only): no .env.local, so no mail
// keys, whatever checkout this runs in.
//
// Run: bash scripts/backend-harnesses.sh scrub   (exit 0 green, 1 red, 2 setup)
// ENV: PB_BIN, PB_PORT (default 8097 + E2E_SLOT), PB_DIR (default
//      /tmp/pb-scrub-slot<E2E_SLOT>).

import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SLOT = Number(process.env.E2E_SLOT || 0);
const PB = process.env.PB_BIN || join(ROOT, 'backend/pocketbase');
const PORT = Number(process.env.PB_PORT || 8097 + SLOT);
const DIR = process.env.PB_DIR || `/tmp/pb-scrub-slot${SLOT}`;
const MIGS = `${DIR}-migrations`;
const REAL_MIGS = join(ROOT, 'backend/pb_migrations');
const HOOKS = join(ROOT, 'backend/pb_hooks');
const URL = `http://127.0.0.1:${PORT}`;
const PB_ENV = { PATH: process.env.PATH || '/usr/bin:/bin', HOME: process.env.HOME || '/tmp' };
const SCRUB_FILE = '0073_scrub_stored_emails.js';

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

function setupFail(msg, detail) {
	console.error('test-scrub setup failed: ' + msg, detail ?? '');
	stopPb();
	exit(2);
}

function pbCli(args) {
	const r = spawnSync(PB, args, { env: PB_ENV, encoding: 'utf8' });
	if (r.status !== 0) setupFail(`pocketbase ${args[0]} ${args[1] || ''}`, r.stderr || r.stdout);
	return r.stdout;
}

const migNumber = (f) => {
	const m = /^(\d+)_.*\.js$/.exec(f);
	return m ? Number(m[1]) : null;
};
const copyRealMigrations = (keep) => {
	for (const f of readdirSync(REAL_MIGS)) {
		const n = migNumber(f);
		if (n !== null && keep(n)) copyFileSync(join(REAL_MIGS, f), join(MIGS, f));
	}
};

let server = null;
async function startPb(logName) {
	const out = openSync(`${DIR}.${logName}.log`, 'w');
	server = spawn(
		PB,
		[
			'serve',
			'--dir',
			DIR,
			'--migrationsDir',
			MIGS,
			'--hooksDir',
			HOOKS,
			'--hooksWatch=false',
			'--http',
			`127.0.0.1:${PORT}`
		],
		{ env: PB_ENV, stdio: ['ignore', out, out] }
	);
	for (let i = 0; i < 60; i++) {
		try {
			const r = await fetch(`${URL}/api/health`);
			if (r.ok) return;
		} catch (_) {}
		if (server.exitCode !== null) break; // a migration threw → PB exited
		await new Promise((res) => setTimeout(res, 500));
	}
	setupFail(`PB did not come up on ${URL} (see ${DIR}.${logName}.log)`);
}
const pbLog = (logName) => {
	try {
		return readFileSync(`${DIR}.${logName}.log`, 'utf8');
	} catch (_) {
		return '';
	}
};
function stopPb() {
	if (server && server.exitCode === null) server.kill('SIGKILL');
	server = null;
}
process.on('exit', stopPb);

async function api(path, token) {
	const res = await fetch(URL + path, { headers: token ? { Authorization: token } : {} });
	let data = null;
	try {
		data = await res.json();
	} catch (_) {}
	return { status: res.status, data };
}

// --- Seed rows (fixed 15-char ids). Pre-#415 shapes with addresses, controls
// without, and rows that hold an "@" legitimately (outside the scrub's scope).
const T = '2026-09-01 10:00:00.000Z';
const SEED = {
	// Scrubbed: the two pre-#415 email fallbacks.
	joinEmail: { c: 'notifications', f: { type: 'member_joined', body: 'joiner-449@e2e.test joined the trip' } },
	tombEmail: { c: 'trip_members', f: { display_name: 'gone-449@e2e.test', role: 'traveler', removed_at: T } },
	// Scrubbed, odd data: would fail validation on a normal save (empty required
	// `type`; empty required `role` + a trip that no longer exists).
	joinOdd: { c: 'notifications', f: { type: '', body: 'nameless-449@e2e.test joined the trip' }, odd: true },
	tombOdd: { c: 'trip_members', f: { display_name: 'odd-449@e2e.test', role: '', removed_at: T }, odd: true },
	// Controls: no "@".
	ctlJoin: { c: 'notifications', f: { type: 'member_joined', body: 'Olive joined the trip' } },
	ctlComment: { c: 'notifications', f: { type: 'comment_added', body: 'Olive commented on Dinner' } },
	ctlFormer: { c: 'trip_members', f: { display_name: 'Former member', role: 'traveler', removed_at: T } },
	ctlNamed: { c: 'trip_members', f: { display_name: 'Dana', role: 'viewer', removed_at: T } },
	// Out of scope: an "@" someone typed, and live member data.
	keepNote: {
		c: 'notifications',
		f: { type: 'suggestion_rejected', body: 'Your idea wasn’t approved: ask ops-449@e2e.test' }
	},
	keepPlaceholder: {
		c: 'trip_members',
		f: { display_name: 'Pat', placeholder_name: 'Pat', placeholder_email: 'pat-449@e2e.test', role: 'traveler' }
	},
	keepActiveNick: { c: 'trip_members', f: { display_name: 'Sam @ HQ', role: 'traveler' } }
};
const ids = {};
Object.keys(SEED).forEach((k, i) => {
	ids[k] = ('scrub449row' + String(i).padStart(4, '0')).slice(0, 15);
});

function seedMigration() {
	const rows = Object.entries(SEED).map(([k, s]) => ({ id: ids[k], c: s.c, f: s.f, odd: !!s.odd }));
	return `/// <reference path="../pb_data/types.d.ts" />
// test-scrub.mjs seed (temp dir only — never shipped).
migrate((app) => {
	const users = app.findCollectionByNameOrId('users');
	const u = new Record(users);
	u.set('id', 'scrub449user001');
	u.setEmail('owner-449@e2e.test');
	u.setPassword('scrubPass449x!');
	u.set('name', 'Olive');
	app.save(u);

	const trip = new Record(app.findCollectionByNameOrId('trips'));
	trip.set('id', 'scrub449trip001');
	trip.set('title', 'Scrub 449');
	trip.set('slug', 'scrub-449');
	trip.set('created_by', u.id);
	trip.set('timezone', 'UTC');
	trip.set('start_date', '2026-09-01 00:00:00.000Z');
	trip.set('end_date', '2026-09-03 00:00:00.000Z');
	app.save(trip);

	const owner = new Record(app.findCollectionByNameOrId('trip_members'));
	owner.set('id', 'scrub449ownermm');
	owner.set('trip', trip.id);
	owner.set('user', u.id);
	owner.set('role', 'owner');
	app.save(owner);

	const rows = ${JSON.stringify(rows)};
	for (const r of rows) {
		const rec = new Record(app.findCollectionByNameOrId(r.c));
		rec.set('id', r.id);
		if (r.c === 'notifications') {
			rec.set('trip', trip.id);
			rec.set('recipient', owner.id);
		} else {
			rec.set('trip', r.odd ? 'nosuchtrip0001' : trip.id);
		}
		for (const k of Object.keys(r.f)) rec.set(k, r.f[k]);
		if (r.odd) app.saveNoValidate(rec);
		else app.save(rec);
	}
}, (app) => {});
`;
}

async function readAll(token) {
	const out = {};
	for (const [k, s] of Object.entries(SEED)) {
		const r = await api(`/api/collections/${s.c}/records/${ids[k]}`, token);
		if (r.status !== 200) setupFail(`read ${k}`, r);
		out[k] = r.data;
	}
	return out;
}
const fieldOf = (s) => (s.c === 'notifications' ? 'body' : 'display_name');

async function adminToken() {
	const res = await fetch(`${URL}/api/collections/_superusers/auth-with-password`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ identity: 'admin@e2e.test', password: 'e2eAdminPass123' })
	});
	const d = await res.json().catch(() => null);
	if (res.status !== 200) setupFail('superuser auth', d);
	return d.token;
}

async function listAll(c, filter, token) {
	const r = await api(
		`/api/collections/${c}/records?perPage=500&filter=${encodeURIComponent(filter)}`,
		token
	);
	if (r.status !== 200) setupFail(`list ${c}`, r);
	return r.data.items;
}

async function main() {
	console.log(`PB: ${URL}  dir: ${DIR}`);
	for (const d of [DIR, MIGS, `${MIGS}-nohooks`]) rmSync(d, { recursive: true, force: true });
	mkdirSync(MIGS, { recursive: true });

	// 1. Pre-deploy state: everything before 0073, plus pre-#415 rows.
	copyRealMigrations((n) => n < 73);
	writeFileSync(join(MIGS, '0072_zzzz_test_scrub_seed.js'), seedMigration());
	// No hooks while seeding (an empty hooks dir — never PB's default lookup).
	mkdirSync(`${MIGS}-nohooks`, { recursive: true });
	pbCli(['migrate', 'up', '--dir', DIR, '--migrationsDir', MIGS, '--hooksDir', `${MIGS}-nohooks`]);
	pbCli(['superuser', 'upsert', 'admin@e2e.test', 'e2eAdminPass123', '--dir', DIR]);

	// 2. Deploy: the real 0073+ land, PB boots and applies them.
	copyRealMigrations((n) => n >= 73);
	await startPb('run1');
	let token = await adminToken();
	const run1 = await readAll(token);

	console.log('\n[first run: the two pre-#415 fallbacks are scrubbed]');
	assert(
		'0073 ran on boot and reports its writes (2 bodies, 2 tombstones)',
		pbLog('run1').includes('0073_scrub_stored_emails: rewrote 2 notification bodies, 2 tombstone names'),
		pbLog('run1')
	);
	assert('joined body with an address → "Someone joined the trip"', run1.joinEmail.body === 'Someone joined the trip', run1.joinEmail.body);
	assert('tombstone name that was an address → "Former member"', run1.tombEmail.display_name === 'Former member', run1.tombEmail.display_name);
	assert('odd joined row (empty type) scrubbed without throwing', run1.joinOdd.body === 'Someone joined the trip', run1.joinOdd.body);
	assert('odd tombstone (empty role, dangling trip) scrubbed without throwing', run1.tombOdd.display_name === 'Former member', run1.tombOdd.display_name);

	console.log('\n[#409 acceptance, over every row in the database]');
	const joins = await listAll('notifications', 'type = "member_joined" || body ~ " joined the trip"', token);
	assert(
		`no "joined the trip" notification body contains an @ (${joins.length} rows)`,
		joins.length >= 3 && joins.every((n) => !n.body.includes('@')),
		joins.map((n) => n.body)
	);
	const tombs = await listAll('trip_members', 'removed_at != ""', token);
	assert(
		`no tombstoned display_name contains an @ (${tombs.length} rows)`,
		tombs.length >= 4 && tombs.every((m) => !m.display_name.includes('@')),
		tombs.map((m) => m.display_name)
	);

	console.log('\n[control rows are untouched]');
	for (const k of ['ctlJoin', 'ctlComment', 'ctlFormer', 'ctlNamed', 'keepNote', 'keepPlaceholder', 'keepActiveNick']) {
		const s = SEED[k];
		const row = run1[k];
		const sameContent = Object.entries(s.f).every(([f, v]) => row[f] === v);
		assert(`${k}: content unchanged`, sameContent, { want: s.f, got: row });
		assert(`${k}: never re-saved (updated == created)`, row.updated === row.created, {
			created: row.created,
			updated: row.updated
		});
	}

	// 3. Second run: a renamed copy of 0073 is a migration PB hasn't applied.
	stopPb();
	copyFileSync(join(REAL_MIGS, SCRUB_FILE), join(MIGS, '9999_test_scrub_rerun.js'));
	await startPb('run2');
	token = await adminToken();
	const run2 = await readAll(token);

	console.log('\n[second run is a no-op]');
	assert(
		'the copy of 0073 ran and wrote nothing',
		pbLog('run2').includes('0073_scrub_stored_emails: rewrote 0 notification bodies, 0 tombstone names'),
		pbLog('run2')
	);
	for (const k of Object.keys(SEED)) {
		const f = fieldOf(SEED[k]);
		assert(
			`${k}: ${f} + updated identical after the second run`,
			run2[k][f] === run1[k][f] && run2[k].updated === run1[k].updated,
			{ run1: [run1[k][f], run1[k].updated], run2: [run2[k][f], run2[k].updated] }
		);
	}

	stopPb();
	for (const d of [DIR, MIGS, `${MIGS}-nohooks`]) rmSync(d, { recursive: true, force: true });
	console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass}/${pass + fail} assertions`);
	exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error('test-scrub crashed:', err);
	stopPb();
	exit(2);
});
