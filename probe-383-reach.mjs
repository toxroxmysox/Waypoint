// #383 REACHABILITY PROBE v2 — is the view-transition wedge reachable WITHOUT
// #365's orphan walk?
//
// v1 finding that reshaped this: SvelteKit runs `onNavigate` LATE — after
// `load_route` resolves, at client.js ~1907 — so "back during a slow load"
// cannot wedge anything: no transition exists yet while the data is in flight.
// The only window in which a navigation can be superseded WITH a transition
// live is [startViewTransition() .. navigation.complete settles], which is
// snapshot-capture + render + 2 ticks. So: measure that window, then sweep a
// back press across it, with and without CPU throttling (a mobile PWA's real
// operating condition, and what widens the window on a phone).
//
// PRIMARY SIGNAL: a transition record whose `finished` is still 'pending'
// seconds later. `cbEnd` separates the shapes:
//   cbEnd === null       -> the await HUNG; no rejection handler can help
//   cbEnd === 'threw: …' -> navigation.complete REJECTED; a 2-arg then catches it
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = process.env.PROBE_ROOT ?? '/Users/Scott/waypoint-w3a';
const PB_PORT = 8097;
const APP_PORT = 5199;
const PB_URL = `http://127.0.0.1:${PB_PORT}`;
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const EMAIL = process.env.E2E_TEST_EMAIL;
const children = [];

if (!EMAIL) {
	console.error('E2E_TEST_EMAIL must be set (it is in .env.local).');
	process.exit(1);
}

const reclaim = (p) => {
	try {
		const x = execSync(`lsof -ti tcp:${p} || true`).toString().trim();
		if (x) execSync(`echo "${x}" | xargs kill -9`);
	} catch {}
};
const launch = (cmd, args, env) => {
	const c = spawn(cmd, args, {
		cwd: ROOT,
		env: { ...process.env, ...env },
		detached: true,
		stdio: ['ignore', 'pipe', 'pipe']
	});
	children.push(c);
	c.stdout.on('data', () => {});
	c.stderr.on('data', (b) => process.env.PROBE_DEBUG && process.stderr.write(b));
};
async function waitFor(url, ms, ok = (r) => r.ok) {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		try {
			if (ok(await fetch(url))) return;
		} catch {}
		await new Promise((r) => setTimeout(r, 400));
	}
	throw new Error(`never came up: ${url}`);
}

const INSTRUMENT = () => {
	window.__vt = [];
	const orig = document.startViewTransition && document.startViewTransition.bind(document);
	if (!orig) return;
	let n = 0;
	document.startViewTransition = (cb) => {
		const t0 = performance.now();
		const rec = {
			id: ++n,
			t0,
			capture: null, // ms from call to callback invocation (snapshot capture)
			window: null, // ms from call to callback return (the supersede window)
			cbEnd: null,
			ready: 'pending',
			updateDone: 'pending',
			finished: 'pending'
		};
		window.__vt.push(rec);
		const t = orig(async () => {
			rec.capture = Math.round(performance.now() - t0);
			try {
				await cb();
				rec.cbEnd = 'returned';
			} catch (e) {
				rec.cbEnd = 'threw: ' + (e && e.message);
				throw e;
			} finally {
				rec.window = Math.round(performance.now() - t0);
			}
		});
		const tag = (p, k) =>
			p.then(
				() => (rec[k] = 'resolved'),
				(e) => (rec[k] = 'rejected: ' + (e && e.message))
			);
		tag(t.ready, 'ready');
		tag(t.updateCallbackDone, 'updateDone');
		tag(t.finished, 'finished');
		return t;
	};
};

const PROBE_WEDGE = () => {
	const pts = [
		[187, 120],
		[187, 300],
		[187, 500],
		[80, 700],
		[300, 700]
	];
	const hits = pts.map(([x, y]) => {
		const el = document.elementFromPoint(x, y);
		return el ? el.tagName.toLowerCase() : 'null';
	});
	return {
		attr: document.documentElement.dataset.transition ?? null,
		hits,
		allRoot: hits.every((h) => h === 'html' || h === 'null'),
		vt: window.__vt,
		path: location.pathname
	};
};

const rows = [];

try {
	reclaim(PB_PORT);
	reclaim(APP_PORT);
	console.log(`-> isolated PocketBase on :${PB_PORT}`);
	launch('bash', [path.join(ROOT, 'scripts', 'e2e-clean-pb.sh')], { PB_PORT: String(PB_PORT) });
	await waitFor(`${PB_URL}/api/health`, 45_000);

	const seed = await (
		await fetch(`${PB_URL}/api/dev/seed-visual-trip`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{}'
		})
	).json();

	console.log(`-> vite dev on :${APP_PORT}`);
	launch(
		'pnpm',
		['exec', 'vite', 'dev', '--host', '127.0.0.1', '--port', String(APP_PORT), '--strictPort'],
		{ PUBLIC_PB_URL: PB_URL, PB_INTERNAL_URL: PB_URL, WAYPOINT_DEV_MODE: 'true' }
	);
	await waitFor(`${APP_URL}/`, 90_000, () => true);

	const browser = await chromium.launch();

	async function fresh({ cpu = 1 } = {}) {
		const ctx = await browser.newContext({
			viewport: { width: 375, height: 812 },
			hasTouch: true,
			isMobile: true,
			reducedMotion: 'no-preference'
		});
		const page = await ctx.newPage();
		await page.addInitScript(INSTRUMENT);
		await page.goto(`${APP_URL}/api/dev/login?email=${encodeURIComponent(EMAIL)}`, {
			waitUntil: 'networkidle'
		});
		await page.goto(`${APP_URL}/trips/${seed.slug}`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(400);
		await page.locator('nav a:visible').nth(1).click(); // one client-side hop
		await page.waitForTimeout(1500);
		await page.evaluate(() => (window.__vt.length = 0));
		if (cpu > 1) {
			const cdp = await ctx.newCDPSession(page);
			await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
		}
		return { ctx, page };
	}

	async function verdict(page) {
		await page.waitForTimeout(2500);
		const r = await page.evaluate(PROBE_WEDGE);
		const pending = r.vt.filter((v) => v.finished === 'pending');
		return {
			wedged: pending.length > 0,
			hung: pending.some((v) => v.cbEnd === null),
			r,
			windows: r.vt.map((v) => v.window).filter((w) => w != null)
		};
	}

	function line(name, v) {
		const w = v.r.vt
			.map(
				(x) =>
					`#${x.id}(cap ${x.capture ?? '-'}ms, win ${x.window ?? 'NEVER'}ms, fin ${x.finished.split(':')[0]})`
			)
			.join(' ');
		console.log(
			`  ${v.wedged ? 'WEDGE' : '  ok '}  ${name.padEnd(42)} ${v.r.attr ? `attr="${v.r.attr}" ` : ''}${v.r.allRoot ? 'ALL-ROOT ' : ''}${w || '(no transition)'}`
		);
		rows.push({ name, ...v });
	}

	// ── 0: measure the supersede window on a plain tap ──────────────────────
	console.log('\n0. WINDOW MEASUREMENT — startViewTransition() -> callback returns\n');
	for (const cpu of [1, 4, 10]) {
		const { ctx, page } = await fresh({ cpu });
		await page.evaluate(() => {
			const as = [...document.querySelectorAll('nav a')].filter(
				(a) => a.getBoundingClientRect().width > 0
			);
			as[3].click();
		});
		const v = await verdict(page);
		line(`plain tap, cpu ${cpu}x`, v);
		await ctx.close();
	}

	// ── 1: back press swept across the whole plausible window ───────────────
	for (const cpu of [1, 6]) {
		console.log(`\n1. BACK PRESS AFTER A TAP — delay sweep, cpu ${cpu}x\n`);
		for (const d of [0, 20, 40, 60, 80, 120, 160, 220, 300, 400]) {
			const { ctx, page } = await fresh({ cpu });
			await page.evaluate(
				async (delay) => {
					const as = [...document.querySelectorAll('nav a')].filter(
						(a) => a.getBoundingClientRect().width > 0
					);
					as[3].click();
					await new Promise((r) => setTimeout(r, delay));
					history.back();
				},
				d
			);
			line(`back ${d}ms after tap`, await verdict(page));
			await ctx.close();
		}
	}

	// ── 2: double-tap two different links, swept ────────────────────────────
	for (const cpu of [1, 6]) {
		console.log(`\n2. DOUBLE-TAP TWO LINKS — delay sweep, cpu ${cpu}x\n`);
		for (const d of [0, 20, 40, 60, 80, 120, 160, 220, 300]) {
			const { ctx, page } = await fresh({ cpu });
			await page.evaluate(
				async (delay) => {
					const as = [...document.querySelectorAll('nav a')].filter(
						(a) => a.getBoundingClientRect().width > 0
					);
					as[2].click();
					await new Promise((r) => setTimeout(r, delay));
					as[3].click();
				},
				d
			);
			line(`2nd tap ${d}ms after 1st`, await verdict(page));
			await ctx.close();
		}
	}

	// ── 3: the adversarial case — back fired from INSIDE the window ─────────
	//     Not a user gesture; establishes whether the window is wedgeable AT ALL.
	console.log('\n3. ADVERSARIAL — history.back() fired from inside the capture window\n');
	for (const cpu of [1, 6]) {
		const ctx0 = await browser.newContext({
			viewport: { width: 375, height: 812 },
			hasTouch: true,
			isMobile: true,
			reducedMotion: 'no-preference'
		});
		const page = await ctx0.newPage();
		await page.addInitScript(INSTRUMENT);
		// fire back the instant a transition starts, i.e. dead centre of the window
		await page.addInitScript(() => {
			window.__armBackOnNextTransition = () => {
				const svt = document.startViewTransition.bind(document);
				document.startViewTransition = (cb) => {
					const t = svt(cb);
					history.back();
					document.startViewTransition = svt;
					return t;
				};
			};
		});
		await page.goto(`${APP_URL}/api/dev/login?email=${encodeURIComponent(EMAIL)}`, {
			waitUntil: 'networkidle'
		});
		await page.goto(`${APP_URL}/trips/${seed.slug}`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(400);
		await page.locator('nav a:visible').nth(1).click();
		await page.waitForTimeout(1500);
		await page.evaluate(() => (window.__vt.length = 0));
		if (cpu > 1) {
			const cdp = await ctx0.newCDPSession(page);
			await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
		}
		await page.evaluate(() => {
			window.__armBackOnNextTransition();
			const as = [...document.querySelectorAll('nav a')].filter(
				(a) => a.getBoundingClientRect().width > 0
			);
			as[3].click();
		});
		line(`back inside window, cpu ${cpu}x`, await verdict(page));
		await ctx0.close();
	}

	console.log('\n' + '='.repeat(72));
	const wedges = rows.filter((v) => v.wedged);
	const wins = rows.flatMap((v) => v.windows);
	if (wins.length)
		console.log(
			`supersede window observed: min ${Math.min(...wins)}ms  max ${Math.max(...wins)}ms  (n=${wins.length})`
		);
	if (wedges.length) {
		console.log(`REACHABLE — ${wedges.length}/${rows.length} runs wedged:`);
		for (const w of wedges) console.log(`  * ${w.name}  (${w.hung ? 'callback HUNG' : 'callback settled'})`);
	} else {
		console.log(`NOT reproduced in ${rows.length} runs.`);
	}

	await browser.close();
} finally {
	for (const c of children) {
		try {
			process.kill(-c.pid, 'SIGKILL');
		} catch {}
	}
	reclaim(PB_PORT);
	reclaim(APP_PORT);
}
