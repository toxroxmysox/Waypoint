#!/usr/bin/env node
// scripts/clean-dev-trips.mjs — purge throwaway E2E / fixture trips from a dev
// PocketBase (issue #91). The Playwright suite and the dev-fixture endpoints
// (auth-bypass, seed-baseline-trip, rules-fixture) mint disposable trips on
// every run; against the shared dev PB on :8090 they accumulate forever.
//
// A trip is purged when EITHER:
//   - its slug starts with a known test prefix (e2e-, harness-, expand-test-), OR
//   - its owner (created_by) is a known test email — E2E_TEST_EMAIL,
//     anything in E2E_TEST_EMAILS, or any address @e2e.test (the rules-* users).
// Child records (trip_members, phases, days, items, …) are removed automatically
// by PocketBase's cascadeDelete relations, so we only delete the trip itself.
//
// SAFETY
//   - Refuses any non-localhost target unless --force (so it can't nuke prod).
//   - --dry-run lists what WOULD be deleted and changes nothing.
//   - Prints every trip it deletes, with a final tally.
//
// AUTH  superuser, via PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD (read from .env.local
//       then .env at the repo root).
//
// USAGE
//   node scripts/clean-dev-trips.mjs                 # delete from :8090
//   node scripts/clean-dev-trips.mjs --dry-run       # preview only
//   PUBLIC_PB_URL=http://127.0.0.1:8097 node scripts/clean-dev-trips.mjs
//   PUBLIC_PB_URL=https://… node scripts/clean-dev-trips.mjs --force   # override guard

import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exit, argv, env } from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Match the app: .env.local wins over .env. dotenv doesn't override already-set
// process.env, so the first load of a given key sticks.
loadEnv({ path: resolve(ROOT, '.env.local'), quiet: true });
loadEnv({ path: resolve(ROOT, '.env'), quiet: true });

const args = new Set(argv.slice(2));
const DRY_RUN = args.has('--dry-run') || args.has('-n');
const FORCE = args.has('--force');

const PB_URL = (env.PUBLIC_PB_URL || 'http://127.0.0.1:8090').replace(/\/$/, '');
const ADMIN_EMAIL = env.PB_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = env.PB_ADMIN_PASSWORD || '';

const SLUG_PREFIXES = ['e2e-', 'harness-', 'expand-test-'];

// --- localhost guard ---------------------------------------------------------
const host = (() => {
	try {
		return new URL(PB_URL).hostname;
	} catch {
		return '';
	}
})();
const isLocal = ['127.0.0.1', 'localhost', '::1', '0.0.0.0'].includes(host);
if (!isLocal && !FORCE) {
	console.error(
		`\n  ✗ REFUSING to run against a non-localhost target: ${PB_URL}\n` +
			`    This script deletes trips. Pointing it at a remote/production PB would\n` +
			`    destroy real data. If you are certain, re-run with --force.\n`
	);
	exit(1);
}
if (!isLocal && FORCE) {
	console.warn(`\n  ⚠ --force: deleting against NON-LOCAL target ${PB_URL}. You asked for this.\n`);
}

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
	console.error(
		'  ✗ PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD are not set (checked .env.local, .env).\n' +
			'    Superuser auth is required to bypass collection rules and delete trips.'
	);
	exit(1);
}

// --- helpers -----------------------------------------------------------------
async function pb(method, path, { token, body } = {}) {
	const headers = {};
	if (token) headers.Authorization = token;
	if (body !== undefined) headers['Content-Type'] = 'application/json';
	const res = await fetch(`${PB_URL}${path}`, {
		method,
		headers,
		body: body !== undefined ? JSON.stringify(body) : undefined
	});
	const text = await res.text();
	let json;
	try {
		json = text ? JSON.parse(text) : {};
	} catch {
		json = { raw: text };
	}
	if (!res.ok) {
		throw new Error(`${method} ${path} → ${res.status} ${text}`);
	}
	return json;
}

async function fetchAll(collection, token, fields) {
	const out = [];
	let page = 1;
	const perPage = 500;
	for (;;) {
		const q = new URLSearchParams({ page: String(page), perPage: String(perPage) });
		if (fields) q.set('fields', fields);
		const res = await pb('GET', `/api/collections/${collection}/records?${q}`, { token });
		out.push(...res.items);
		if (page >= res.totalPages || res.items.length === 0) break;
		page += 1;
	}
	return out;
}

// --- main --------------------------------------------------------------------
async function main() {
	console.log(`Target PB: ${PB_URL}${DRY_RUN ? '  (dry run)' : ''}`);

	const auth = await pb('POST', '/api/collections/_superusers/auth-with-password', {
		body: { identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }
	});
	const token = auth.token;

	// Test-owner email set: explicit env vars + anything @e2e.test.
	const testEmails = new Set();
	if (env.E2E_TEST_EMAIL) testEmails.add(env.E2E_TEST_EMAIL.trim());
	for (const raw of (env.E2E_TEST_EMAILS || '').split(',')) {
		const t = raw.trim();
		if (t) testEmails.add(t);
	}
	const isTestEmail = (email) =>
		!!email && (testEmails.has(email) || email.endsWith('@e2e.test'));

	// Map user id → email so we can match trips by owner.
	const users = await fetchAll('users', token, 'id,email');
	const emailById = new Map(users.map((u) => [u.id, u.email]));

	const trips = await fetchAll('trips', token, 'id,slug,title,created_by');

	const targets = trips
		.map((t) => {
			const slugHit = SLUG_PREFIXES.some((p) => (t.slug || '').startsWith(p));
			const ownerEmail = emailById.get(t.created_by) || '';
			const ownerHit = isTestEmail(ownerEmail);
			return { ...t, ownerEmail, reason: slugHit ? 'slug' : ownerHit ? 'owner' : null };
		})
		.filter((t) => t.reason);

	if (targets.length === 0) {
		console.log('No test trips found. Nothing to delete.');
		return;
	}

	console.log(`\nFound ${targets.length} test trip(s) of ${trips.length} total:\n`);
	for (const t of targets) {
		const why = t.reason === 'slug' ? `slug:${t.slug}` : `owner:${t.ownerEmail}`;
		console.log(`  ${DRY_RUN ? '[would delete]' : '[delete]'} ${t.id}  ${(t.slug || '—').padEnd(24)} ${why}`);
	}

	if (DRY_RUN) {
		console.log(`\nDry run — nothing deleted. Re-run without --dry-run to purge.`);
		return;
	}

	let ok = 0;
	let failed = 0;
	for (const t of targets) {
		try {
			await pb('DELETE', `/api/collections/trips/records/${t.id}`, { token });
			ok += 1;
		} catch (err) {
			failed += 1;
			console.error(`  ✗ failed to delete ${t.id} (${t.slug}): ${err.message}`);
		}
	}
	console.log(`\nDeleted ${ok} trip(s)${failed ? `, ${failed} failed` : ''} (children cascade automatically).`);
	if (failed) exit(1);
}

main().catch((err) => {
	console.error(`\n  ✗ ${err.message}`);
	exit(1);
});
