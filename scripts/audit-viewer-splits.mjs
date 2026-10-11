#!/usr/bin/env node
// scripts/audit-viewer-splits.mjs — READ-ONLY audit for expenses that name a
// viewer as payer or split participant (issue #506).
//
// WHY THIS EXISTS
//   Before #506 the expense form offered every active member, viewers included,
//   so "Whole group" splits pulled viewers in and they ended up owing money.
//   The fix stops new ones (UI + expenses.pb.js), but rows written before it are
//   still in the database. This lists them so Scott can eyeball each one before
//   any data is changed (real-data hard stop).
//
// WHAT IT LISTS  (every expense where a CURRENT viewer is)
//   - paid_by
//   - in split_data.members (equal split)  → proposed fix: re-divide among the rest
//   - a key of split_data.amounts (by_amount) → proposed fix: manual
//   A member who was a traveler when the expense was logged and was later made a
//   viewer shows up too; the role history isn't stored, so judge those by eye.
//
// SAFETY  Read-only: GET requests only. Prints the target host first.
// AUTH    superuser via PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD (.env.local, .env, or env).
//
// USAGE
//   node scripts/audit-viewer-splits.mjs
//   node scripts/audit-viewer-splits.mjs --json
//   On basecamp: PUBLIC_PB_URL=http://127.0.0.1:8091/pb node scripts/audit-viewer-splits.mjs
//
// EXIT  0 = clean, 1 = matches found, 2 = could not run (auth/network)

import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exit, argv, env } from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: resolve(ROOT, '.env.local'), quiet: true });
loadEnv({ path: resolve(ROOT, '.env'), quiet: true });

const AS_JSON = new Set(argv.slice(2)).has('--json');
const PB_URL = (env.PUBLIC_PB_URL || 'http://127.0.0.1:8090').replace(/\/$/, '');
const ADMIN_EMAIL = env.PB_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = env.PB_ADMIN_PASSWORD || '';
const log = (...a) => {
	if (!AS_JSON) console.log(...a);
};

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
	console.error('\n  ✗ PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD are required (superuser).\n');
	exit(2);
}
log(`\n  Auditing ${PB_URL} (read-only)\n`);

let token = '';
try {
	const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD })
	});
	if (!res.ok) {
		console.error(`\n  ✗ superuser auth failed: ${res.status}\n`);
		exit(2);
	}
	token = (await res.json()).token;
} catch (err) {
	console.error(`\n  ✗ could not reach ${PB_URL}: ${err.message}\n`);
	exit(2);
}

async function fetchAll(collection, { filter = '', expand = '' } = {}) {
	const out = [];
	for (let page = 1; ; page++) {
		const qs = new URLSearchParams({ page: String(page), perPage: '500' });
		if (filter) qs.set('filter', filter);
		if (expand) qs.set('expand', expand);
		const res = await fetch(`${PB_URL}/api/collections/${collection}/records?${qs}`, {
			headers: { Authorization: token }
		});
		if (!res.ok) {
			console.error(`\n  ✗ ${collection} query failed: ${res.status}\n`);
			exit(2);
		}
		const body = await res.json();
		out.push(...body.items);
		if (page >= body.totalPages || body.items.length === 0) break;
	}
	return out;
}

const members = await fetchAll('trip_members', { expand: 'user,trip' });
const byId = new Map(members.map((m) => [m.id, m]));
const name = (id) => {
	const m = byId.get(id);
	if (!m) return `? (${id})`;
	return m.display_name || m.placeholder_name || m.expand?.user?.name || id;
};
const isViewer = (id) => byId.get(id)?.role === 'viewer';

const expenses = await fetchAll('expenses', { expand: 'trip' });
const hits = [];
for (const e of expenses) {
	const sd = e.split_data || {};
	const equal = Array.isArray(sd.members) ? sd.members : [];
	const amounts = sd.amounts && typeof sd.amounts === 'object' ? sd.amounts : {};
	const viewerPayer = isViewer(e.paid_by);
	const viewersInSplit =
		e.split_mode === 'by_amount'
			? Object.keys(amounts).filter(isViewer)
			: equal.filter(isViewer);
	if (!viewerPayer && viewersInSplit.length === 0) continue;
	const rest = equal.filter((id) => !isViewer(id));
	let fix;
	if (viewerPayer) fix = 'manual (viewer paid)';
	else if (e.split_mode === 'by_amount') fix = 'manual (by_amount)';
	else if (rest.length === 0) fix = 'manual (only viewers in split)';
	else fix = `re-divide equally among ${rest.map(name).join(', ')}`;
	hits.push({
		id: e.id,
		trip: e.expand?.trip ? `${e.expand.trip.title} [${e.expand.trip.slug}]` : e.trip,
		date: String(e.date).slice(0, 10),
		description: e.description,
		amount_usd: e.amount_usd,
		paid_by: name(e.paid_by),
		split_mode: e.split_mode,
		viewers: [...(viewerPayer ? [e.paid_by] : []), ...viewersInSplit].map(name),
		proposed_fix: fix
	});
}

if (AS_JSON) {
	console.log(JSON.stringify({ host: PB_URL, expenses: expenses.length, hits }, null, 2));
} else {
	log(`  ${expenses.length} expenses, ${members.length} memberships\n`);
	if (hits.length === 0) log('  ✓ no expense names a viewer\n');
	for (const h of hits) {
		log(`  • ${h.trip} — ${h.date} "${h.description}" $${h.amount_usd} (${h.split_mode}), paid by ${h.paid_by}`);
		log(`      viewers: ${h.viewers.join(', ')}  →  ${h.proposed_fix}   [${h.id}]`);
	}
	if (hits.length) log(`\n  ${hits.length} expense(s) to review.\n`);
}
exit(hits.length ? 1 : 0);
