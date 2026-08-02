#!/usr/bin/env node
// scripts/audit-duplicate-members.mjs — READ-ONLY audit for duplicate
// trip_members rows (issue #338).
//
// WHY THIS EXISTS
//   Two defects could put more than one active membership on a trip for the
//   same person, which downstream merge/settlement assumes cannot happen:
//
//   1. TOCTOU (#338) — claim + add-placeholder validated and wrote as separate
//      statements, so concurrent calls could both pass the duplicate check.
//      Measured pre-fix: 3 of 5 parallel claims of one placeholder returned 200.
//
//   2. Dead guard (bug-218) — add-placeholder's "a member with that email
//      already exists" check threw inside a try whose catch tested `err.code`.
//      PB's JSVM ApiError has no `code` (it is `status`; `code` is always
//      null), so the guard NEVER fired. Adding a placeholder for an email that
//      already belonged to an active member returned 200, created a duplicate,
//      and left claimable_by empty so the row could never be claimed.
//
//   Both are fixed, but rows created while they were live are still in the
//   database. Run this BEFORE adding a unique index on trip_members — a
//   partial unique index would fail to apply if duplicates already exist.
//
// WHAT IT CHECKS  (all scoped to removed_at = "" — #133 tombstones are not
//                  duplicates; a departed member may legitimately be re-added)
//   A. same user id, more than one active membership on one trip
//   B. same placeholder_email, more than one active row on one trip
//   C. an active placeholder whose email belongs to a user who is ALSO an
//      active member of that trip  <- the bug-218 signature
//
// SAFETY
//   Read-only. Issues GET requests only; never creates, updates, or deletes.
//   Safe to point at production. Prints the target host before doing anything.
//
// AUTH  superuser, via PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD (read from .env.local
//       then .env at the repo root, or the ambient environment).
//
// USAGE
//   node scripts/audit-duplicate-members.mjs
//   PUBLIC_PB_URL=http://127.0.0.1:8097 node scripts/audit-duplicate-members.mjs
//   node scripts/audit-duplicate-members.mjs --json     # machine-readable
//
//   On basecamp, where waypoint.env already holds PB_ADMIN_*:
//     PUBLIC_PB_URL=http://127.0.0.1:8091/pb node scripts/audit-duplicate-members.mjs
//
// EXIT  0 = clean, 1 = duplicates found, 2 = could not run (auth/network)

import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exit, argv, env } from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: resolve(ROOT, '.env.local'), quiet: true });
loadEnv({ path: resolve(ROOT, '.env'), quiet: true });

const args = new Set(argv.slice(2));
const AS_JSON = args.has('--json');

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

// --- superuser auth ----------------------------------------------------------
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

// --- fetch every active membership + the trips/users they point at -----------
async function fetchAll(collection, { filter = '', expand = '', fields = '' } = {}) {
	const out = [];
	for (let page = 1; ; page++) {
		const qs = new URLSearchParams({ page: String(page), perPage: '500' });
		if (filter) qs.set('filter', filter);
		if (expand) qs.set('expand', expand);
		if (fields) qs.set('fields', fields);
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

// removed_at = "" keeps #133 tombstones out of every check.
const members = await fetchAll('trip_members', {
	filter: 'removed_at = ""',
	expand: 'trip'
});

// Users are needed only to resolve placeholder_email -> user id for check C.
const users = await fetchAll('users', { fields: 'id,email' });
const userIdByEmail = new Map();
for (const u of users) {
	if (u.email) userIdByEmail.set(String(u.email).toLowerCase(), u.id);
}

log(`  ${members.length} active memberships across ${new Set(members.map((m) => m.trip)).size} trips`);
log(`  ${users.length} users\n`);

const tripLabel = (m) => {
	const t = m.expand?.trip;
	return t ? `${t.title || '(untitled)'} [${t.slug || m.trip}]` : m.trip;
};

// --- group by trip -----------------------------------------------------------
const byTrip = new Map();
for (const m of members) {
	if (!byTrip.has(m.trip)) byTrip.set(m.trip, []);
	byTrip.get(m.trip).push(m);
}

const findings = { duplicateUser: [], duplicateEmail: [], placeholderShadowsMember: [] };

for (const [tripId, rows] of byTrip) {
	const label = tripLabel(rows[0]);

	// A. same user, >1 active membership on this trip
	const byUser = new Map();
	for (const r of rows) {
		if (!r.user) continue;
		if (!byUser.has(r.user)) byUser.set(r.user, []);
		byUser.get(r.user).push(r);
	}
	for (const [userId, dupes] of byUser) {
		if (dupes.length > 1) {
			findings.duplicateUser.push({
				trip: tripId,
				tripLabel: label,
				user: userId,
				count: dupes.length,
				memberIds: dupes.map((d) => d.id),
				roles: dupes.map((d) => d.role)
			});
		}
	}

	// B. same placeholder_email, >1 active row on this trip
	const byEmail = new Map();
	for (const r of rows) {
		const email = String(r.placeholder_email || '').toLowerCase();
		if (!email) continue;
		if (!byEmail.has(email)) byEmail.set(email, []);
		byEmail.get(email).push(r);
	}
	for (const [email, dupes] of byEmail) {
		if (dupes.length > 1) {
			findings.duplicateEmail.push({
				trip: tripId,
				tripLabel: label,
				email,
				count: dupes.length,
				memberIds: dupes.map((d) => d.id)
			});
		}
	}

	// C. bug-218 signature: an active placeholder addressed to someone who is
	//    ALREADY an active member of this trip.
	const activeUserIds = new Set(rows.filter((r) => r.user).map((r) => r.user));
	for (const [email, rowsForEmail] of byEmail) {
		const ownerId = userIdByEmail.get(email);
		if (!ownerId || !activeUserIds.has(ownerId)) continue;
		for (const r of rowsForEmail) {
			if (r.user) continue; // the real membership, not a shadow placeholder
			findings.placeholderShadowsMember.push({
				trip: tripId,
				tripLabel: label,
				email,
				placeholderMemberId: r.id,
				placeholderName: r.placeholder_name || r.display_name || '',
				shadowsUser: ownerId,
				claimableBy: r.claimable_by || ''
			});
		}
	}
}

const total =
	findings.duplicateUser.length +
	findings.duplicateEmail.length +
	findings.placeholderShadowsMember.length;

if (AS_JSON) {
	console.log(JSON.stringify({ target: PB_URL, total, findings }, null, 2));
	exit(total === 0 ? 0 : 1);
}

// --- report ------------------------------------------------------------------
function section(title, rows, render) {
	console.log(`  ${rows.length === 0 ? '✓' : '✗'} ${title}: ${rows.length}`);
	for (const r of rows) console.log(`      ${render(r)}`);
	if (rows.length) console.log('');
}

section(
	'A. same user with >1 active membership on one trip',
	findings.duplicateUser,
	(r) => `${r.tripLabel} — user ${r.user} x${r.count} (${r.memberIds.join(', ')}) roles=${r.roles.join('/')}`
);
section(
	'B. same placeholder_email with >1 active row on one trip',
	findings.duplicateEmail,
	(r) => `${r.tripLabel} — ${r.email} x${r.count} (${r.memberIds.join(', ')})`
);
section(
	'C. active placeholder shadowing an existing member (bug-218)',
	findings.placeholderShadowsMember,
	(r) =>
		`${r.tripLabel} — "${r.placeholderName}" <${r.email}> member=${r.placeholderMemberId} shadows user ${r.shadowsUser}` +
		(r.claimableBy ? '' : ' (claimable_by EMPTY — unclaimable)')
);

if (total === 0) {
	console.log('\n  Clean. Safe to add a unique index on trip_members.\n');
	exit(0);
}

console.log(
	`\n  ${total} finding(s). Resolve these BEFORE adding a unique index — the\n` +
		'  migration would fail to apply while duplicates exist.\n' +
		'  Nothing was modified; this script is read-only.\n'
);
exit(1);
