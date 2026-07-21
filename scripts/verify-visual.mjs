#!/usr/bin/env node
// scripts/verify-visual.mjs — one command that turns "screenshot this route at
// 375px" from a 20-minute setup into ~30 seconds.
//
//   pnpm verify:visual                          # trip overview, 375 + 768
//   pnpm verify:visual '/trips/{slug}/days/{day1}'
//   pnpm verify:visual '/trips/{slug}' '/trips/{slug}/today' --widths 375
//
// What it does, in order:
//   1. Reclaims :8097 and :5199 (kill -9 — a wedged PB ignores SIGTERM), then
//      stands up a disposable, migrated PocketBase on :8097 via
//      scripts/e2e-clean-pb.sh. The shared dogfood PB on :8090 is NEVER touched.
//   2. POSTs /api/dev/seed-visual-trip — a trip whose days cover the fullness
//      matrix (3 items+notes / 1 item+notes / 2 items / 1 item / 0 items+notes /
//      0 items). seed-baseline-trip seeds an EMPTY trip, which is why day-card
//      work kept shipping without pixel proof.
//   3. Boots `vite dev` on :5199 pointed at the isolated PB (dev, not build —
//      the whole point is that this is cheap enough to always run).
//   4. Logs in through /api/dev/login (real auth cookie) and screenshots each
//      route at each width into .visual/ (gitignored).
//   5. Kills everything. /tmp/pb67 is disposable, so there is nothing to clean.
//
// Route tokens: {slug} {tripId} {day1}..{day6} (day ids, 1-indexed).
// Flags: --widths 375,768  --viewport (no full-page)  --out DIR  --keep
//        --timeout SECONDS.  VISUAL_DEBUG=1 surfaces PB/vite stderr.
//
// Shots are full-page by default, which means position:fixed chrome (BottomNav,
// the FAB) is painted at its VIEWPORT offset and can sit over mid-page content.
// Use --viewport when you need what a phone actually shows above the fold.
//
// Seeding goes through PB/API on purpose — never drive the UI to build fixture
// data. AppShell renders +page.svelte TWICE (mobile + desktop, one CSS-hidden),
// so both Playwright locators and Browser-MCP refs can land on the hidden copy
// and silently no-op. See .wolf/cerebrum.md Do-Not-Repeat 2026-07-21.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: path.join(ROOT, '.env.local') });
loadEnv({ path: path.join(ROOT, '.env') });

const PB_PORT = Number(process.env.VISUAL_PB_PORT ?? 8097);
const APP_PORT = Number(process.env.VISUAL_APP_PORT ?? 5199);
const PB_URL = `http://127.0.0.1:${PB_PORT}`;
const APP_URL = `http://127.0.0.1:${APP_PORT}`;

// --- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const routes = [];
let widths = [375, 768];
let outDir = path.join(ROOT, '.visual');
let budgetMs = 240_000;
let keep = false;
let fullPage = true;

for (let i = 0; i < argv.length; i++) {
	const a = argv[i];
	if (a === '--widths') widths = argv[++i].split(',').map((w) => Number(w.trim()));
	else if (a === '--out') outDir = path.resolve(ROOT, argv[++i]);
	else if (a === '--timeout') budgetMs = Number(argv[++i]) * 1000;
	else if (a === '--keep') keep = true;
	else if (a === '--viewport') fullPage = false;
	else if (a.startsWith('-')) fail(`unknown flag: ${a}`);
	else routes.push(a);
}
if (routes.length === 0) routes.push('/trips/{slug}');

const EMAIL = process.env.E2E_TEST_EMAIL;
if (process.env.WAYPOINT_DEV_MODE !== 'true' || !EMAIL) {
	fail('WAYPOINT_DEV_MODE=true and E2E_TEST_EMAIL must be set (.env.local)');
}

// --- lifecycle --------------------------------------------------------------
const children = [];
let browser;
let cleanedUp = false;

// Standing rule (cerebrum): never let a harness hang unbounded. A wedged PB has
// eaten 46 minutes of a session before.
const watchdog = setTimeout(() => {
	console.error(`\n✗ verify:visual exceeded ${budgetMs / 1000}s — killing everything.`);
	cleanup();
	process.exit(1);
}, budgetMs);
watchdog.unref();

function cleanup() {
	if (cleanedUp) return;
	cleanedUp = true;
	if (browser) browser.close().catch(() => {});
	for (const child of children) {
		try {
			process.kill(-child.pid, 'SIGKILL');
		} catch {
			try {
				child.kill('SIGKILL');
			} catch {
				/* already gone */
			}
		}
	}
	reclaim(PB_PORT);
	reclaim(APP_PORT);
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) {
	process.on(sig, () => {
		cleanup();
		process.exit(130);
	});
}

function fail(msg) {
	console.error(`✗ ${msg}`);
	cleanup();
	process.exit(1);
}

// SIGKILL, not SIGTERM: a wedged :8097 PocketBase ignores SIGTERM, and
// e2e-clean-pb.sh's own reclaim then fails too (cerebrum 2026-06-30).
function reclaim(port) {
	try {
		const pids = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
			encoding: 'utf8'
		})
			.split('\n')
			.filter(Boolean);
		for (const pid of pids) {
			try {
				process.kill(Number(pid), 'SIGKILL');
			} catch {
				/* raced */
			}
		}
	} catch {
		// lsof exits 1 when nothing holds the port — that's the happy path.
	}
}

async function waitFor(url, label, timeoutMs, ok = (r) => r.ok) {
	const deadline = Date.now() + timeoutMs;
	let last = '';
	while (Date.now() < deadline) {
		try {
			const res = await fetch(url);
			if (ok(res)) return;
			last = `status ${res.status}`;
		} catch (err) {
			last = err.message;
		}
		await new Promise((r) => setTimeout(r, 400));
	}
	fail(`${label} did not come up at ${url} within ${timeoutMs / 1000}s (last: ${last})`);
}

function launch(label, cmd, args, env) {
	const child = spawn(cmd, args, {
		cwd: ROOT,
		env: { ...process.env, ...env },
		detached: true, // own process group, so SIGKILL takes the whole tree
		stdio: ['ignore', 'pipe', 'pipe']
	});
	children.push(child);
	child.on('exit', (code) => {
		if (!cleanedUp && code !== 0) console.error(`  ${label} exited (${code})`);
	});
	// Keep the pipes drained; surface stderr so a boot failure isn't silent.
	child.stdout.on('data', () => {});
	child.stderr.on('data', (b) => process.env.VISUAL_DEBUG && process.stderr.write(b));
	return child;
}

// --- run --------------------------------------------------------------------
const t0 = Date.now();

reclaim(PB_PORT);
reclaim(APP_PORT);

console.log(`→ isolated PocketBase on :${PB_PORT}`);
launch('pocketbase', 'bash', [path.join(ROOT, 'scripts', 'e2e-clean-pb.sh')], {
	PB_PORT: String(PB_PORT)
});
await waitFor(`${PB_URL}/api/health`, 'PocketBase', 45_000);

console.log('→ seeding populated trip');
const seedRes = await fetch(`${PB_URL}/api/dev/seed-visual-trip`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: '{}'
});
if (!seedRes.ok) fail(`seed-visual-trip failed (${seedRes.status}): ${await seedRes.text()}`);
const seed = await seedRes.json();
for (const d of seed.days) {
	console.log(
		`   ${d.date}  ${String(d.itemCount).padStart(2)} item(s)  ${d.hasNotes ? 'notes' : '—'}  ${d.id}`
	);
}

// PUBLIC_PB_URL is read via Vite's loadEnv, where process.env wins over
// .env.local — so this points the app at :8097 instead of the dogfood :8090.
// PB_INTERNAL_URL does the same for SSR-side PB calls (src/lib/shell/pb.ts).
console.log(`→ vite dev on :${APP_PORT}`);
// --host 127.0.0.1: Vite's default `localhost` bind can end up IPv6-only, and
// Node's fetch to 127.0.0.1 then fails with a bare "fetch failed".
launch(
	'vite',
	'pnpm',
	['exec', 'vite', 'dev', '--host', '127.0.0.1', '--port', String(APP_PORT), '--strictPort'],
	{
		PORT: String(APP_PORT),
		PUBLIC_PB_URL: PB_URL,
		PB_INTERNAL_URL: PB_URL,
		WAYPOINT_DEV_MODE: 'true'
	}
);
// Any HTTP answer means the server is listening; the first request also pays
// the dev-server compile, so a 4xx/5xx here is still "up".
await waitFor(`${APP_URL}/`, 'vite dev', 90_000, () => true);

const resolve = (route) =>
	route
		.replaceAll('{slug}', seed.slug)
		.replaceAll('{tripId}', seed.tripId)
		.replace(/\{day(\d+)\}/g, (m, n) => seed.days[Number(n) - 1]?.id ?? m);

if (!keep) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

try {
	browser = await chromium.launch();
} catch (err) {
	if (/Executable doesn't exist/.test(err.message)) {
		fail('Playwright browsers are missing — run `pnpm exec playwright install chromium`');
	}
	throw err;
}
const shots = [];
for (const width of widths) {
	const context = await browser.newContext({
		viewport: { width, height: width < 500 ? 812 : 1024 },
		deviceScaleFactor: 2,
		isMobile: width < 500,
		hasTouch: width < 500,
		// Match playwright.config: the app gates its transitions on
		// prefers-reduced-motion, so this stops a screenshot catching a sheet
		// mid-flight.
		reducedMotion: 'reduce'
	});
	const page = await context.newPage();

	// Real auth cookie via the PB bypass. Redirects to /claim on success.
	await page.goto(`${APP_URL}/api/dev/login?email=${encodeURIComponent(EMAIL)}`, {
		waitUntil: 'networkidle'
	});
	if (page.url().includes('/login')) fail('dev login bounced to the login page');

	for (const route of routes) {
		const url = APP_URL + resolve(route);
		const res = await page.goto(url, { waitUntil: 'networkidle' });
		// Name from the UNRESOLVED route: record ids are regenerated on every
		// run, so resolved names would never diff against the previous run's.
		// Braces are stripped — they're shell brace-expansion in zsh/bash.
		const stem = route.replace(/^\//, '').replace(/[^a-zA-Z0-9-]+/g, '_') || 'root';
		const file = path.join(outDir, `${stem}@${width}.png`);
		await page.screenshot({ path: file, fullPage: fullPage });
		shots.push({ file, status: res?.status() ?? 0, url });
	}
	await context.close();
}
await browser.close();
browser = undefined;

const rel = path.relative(ROOT, outDir);
console.log(`\n✓ ${shots.length} screenshot(s) in ${rel}/  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
let bad = 0;
for (const s of shots) {
	const flag = s.status >= 400 ? ` ← HTTP ${s.status}` : '';
	if (s.status >= 400) bad++;
	console.log(`   ${path.relative(ROOT, s.file)}${flag}`);
}

cleanup();
clearTimeout(watchdog);
process.exit(bad > 0 ? 1 : 0);
