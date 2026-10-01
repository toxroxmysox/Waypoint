// #365 SKIP-DOOR PROBE — where does the wedge actually come from?
//
// Two patches have already failed (release on `onNavigate`; release on
// `popstate`), both confirmed present in the built bundle, and
// `trip-mode-skip-door.spec.ts` stayed red with
//   <html data-transition="drill-up"> intercepts pointer events
// So this script MEASURES the flow instead of patching it a third time.
//
// It replays the spec's real sequence — Now → Add sheet → "Add item to today"
// (a sheet that closes programmatically and orphans its history entry) → item
// form → submit → redirect back to Now — with swallowBack ENABLED, and records
// an ordered event log of everything that touches history, navigation and the
// view transition:
//
//   pushState / replaceState / history.back()  (with stack traces elided)
//   popstate (capture phase, i.e. before the router sees it)
//   startViewTransition + when its callback returned + how `finished` settled
//   every mutation of <html data-transition>
//
// PRIMARY QUESTION: at the moment the page becomes unclickable, is there a
// transition whose callback never returned (a HANG — no rejection handler can
// help), or one that finished while the attribute was left behind by a LATER
// writer (a cleanup-ordering bug)? Those need different fixes.
//
// Isolated ports on purpose: :8098/:5198, so it can run while another agent
// holds the usual :8097/:4173/:5199.
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = process.env.PROBE_ROOT ?? process.cwd();
const PB_PORT = Number(process.env.PROBE_PB_PORT ?? 8098);
const APP_PORT = Number(process.env.PROBE_APP_PORT ?? 5198);
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

// One ordered log of every history / navigation / transition event.
const INSTRUMENT = () => {
	const t0 = performance.now();
	const at = () => Math.round(performance.now() - t0);
	window.__log = [];
	window.__vt = [];
	const push = (kind, detail) => window.__log.push({ t: at(), kind, ...detail });

	const ps = history.pushState.bind(history);
	history.pushState = (s, ti, u) => {
		push('pushState', { url: String(u ?? ''), sheet: s && s.sheet, sheetId: s && s.sheetId });
		return ps(s, ti, u);
	};
	const rs = history.replaceState.bind(history);
	history.replaceState = (s, ti, u) => {
		push('replaceState', { url: String(u ?? ''), sheet: s && s.sheet, sheetId: s && s.sheetId });
		return rs(s, ti, u);
	};
	const bk = history.back.bind(history);
	history.back = () => {
		push('history.back()', { by: (new Error().stack || '').split('\n')[2]?.trim().slice(0, 90) });
		return bk();
	};
	window.addEventListener('popstate', (e) => push('popstate(capture)', { state: JSON.stringify(e.state ?? null).slice(0, 80) }), true);
	window.addEventListener('popstate', () => push('popstate(bubble)', {}), false);

	// Watch the attribute that ends up intercepting pointer events. An init script
	// runs BEFORE <html> exists, and observing null throws — which used to kill
	// the rest of this function, including the transition wrapper below.
	const watchAttr = () => {
		if (!document.documentElement) return false;
		new MutationObserver((ms) => {
			for (const m of ms) {
				if (m.attributeName === 'data-transition')
					push('attr', { value: document.documentElement.dataset.transition ?? '(removed)' });
			}
		}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-transition'] });
		return true;
	};
	if (!watchAttr()) document.addEventListener('readystatechange', watchAttr, { once: true });

	const orig = document.startViewTransition && document.startViewTransition.bind(document);
	if (!orig) return;
	let n = 0;
	document.startViewTransition = (cb) => {
		const id = ++n;
		const s = performance.now();
		const rec = { id, capture: null, window: null, cbEnd: null, ready: 'pending', updateDone: 'pending', finished: 'pending' };
		window.__vt.push(rec);
		push('startViewTransition', { id });
		const t = orig(async () => {
			rec.capture = Math.round(performance.now() - s);
			try {
				await cb();
				rec.cbEnd = 'returned';
			} catch (e) {
				rec.cbEnd = 'threw: ' + (e && e.message);
				throw e;
			} finally {
				rec.window = Math.round(performance.now() - s);
				push('vt.callbackReturned', { id, cbEnd: rec.cbEnd, ms: rec.window });
			}
		});
		const tag = (p, k) =>
			p.then(
				() => {
					rec[k] = 'resolved';
					push(`vt.${k}`, { id, r: 'resolved' });
				},
				(e) => {
					rec[k] = 'rejected: ' + (e && e.message);
					push(`vt.${k}`, { id, r: 'rejected' });
				}
			);
		tag(t.ready, 'ready');
		tag(t.updateCallbackDone, 'updateDone');
		tag(t.finished, 'finished');
		return t;
	};
};

const DUMP = () => ({
	attr: document.documentElement.dataset.transition ?? null,
	path: location.pathname,
	// Is the page actually dead? elementFromPoint returns <html> for every probe
	// point when the ::view-transition overlay is eating hit-testing.
	hits: [
		[187, 120],
		[187, 300],
		[187, 500],
		[187, 700]
	].map(([x, y]) => {
		const el = document.elementFromPoint(x, y);
		return el ? el.tagName.toLowerCase() : 'null';
	}),
	vt: window.__vt,
	log: window.__log
});

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
	console.log(`-> seeded trip ${seed.slug}`);

	console.log(`-> vite dev on :${APP_PORT}`);
	launch('pnpm', ['exec', 'vite', 'dev', '--host', '127.0.0.1', '--port', String(APP_PORT), '--strictPort'], {
		PUBLIC_PB_URL: PB_URL,
		PB_INTERNAL_URL: PB_URL,
		WAYPOINT_DEV_MODE: 'true'
	});
	await waitFor(`${APP_URL}/`, 90_000, () => true);

	const browser = await chromium.launch();
	const ctx = await browser.newContext({
		viewport: { width: 375, height: 812 },
		hasTouch: true,
		isMobile: true,
		reducedMotion: 'no-preference'
	});
	const page = await ctx.newPage();
	await page.addInitScript(INSTRUMENT);
	page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

	await page.goto(`${APP_URL}/api/dev/login?email=${encodeURIComponent(EMAIL)}`, { waitUntil: 'networkidle' });
	await page.goto(`${APP_URL}/trips/${seed.slug}/now`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(600);
	await page.evaluate(() => {
		window.__log.length = 0;
		window.__vt.length = 0;
	});

	console.log('\n-> STEP 1: open the Add sheet (pushes a swallowBack history entry)');
	await page.locator('.md-desktop\\:hidden button[aria-label="Add"]').click();
	await page.waitForTimeout(500);

	console.log('-> STEP 2: "Add item to today" — sheet closes programmatically + goto');
	await page.getByText('Add item to today').click();
	await page.waitForURL(/\/items\/new/, { timeout: 15_000 });
	await page.waitForTimeout(700);

	console.log('-> STEP 3: submit the item — redirect back to /now (the drill-up)');
	await page.locator('button:has-text("Activity"):visible').first().click();
	const title = page.locator('input[name="title"]:visible').first();
	await title.fill('Probe item');
	await title.press('Enter');
	await page.waitForURL(/\/now/, { timeout: 15_000 });
	await page.waitForTimeout(2500);

	const d = await page.evaluate(DUMP);
	const dead = d.hits.every((h) => h === 'html' || h === 'null');
	console.log(`\n=== AFTER THE FLOW ===`);
	console.log(`path=${d.path}  data-transition=${d.attr ?? '(none)'}  hit-test=${d.hits.join(',')}  ${dead ? 'PAGE IS DEAD' : 'page is clickable'}`);
	console.log('\ntransitions:');
	for (const v of d.vt)
		console.log(`  #${v.id} capture=${v.capture ?? '-'}ms callbackReturned=${v.window ?? 'NEVER'}ms cbEnd=${v.cbEnd ?? 'NEVER (hung)'} finished=${v.finished} updateDone=${v.updateDone}`);
	console.log('\nordered event log:');
	for (const e of d.log) {
		const { t, kind, ...rest } = e;
		console.log(`  ${String(t).padStart(6)}ms  ${kind.padEnd(22)} ${JSON.stringify(rest)}`);
	}

	// ── PHASE 2: the #235 walk-back-out sequence ────────────────────────────
	// sheet-gestures.spec.ts:244 hangs for 30s here and the snapshot doesn't say
	// where. Replay the same shape, logging what each back press actually does,
	// and use an in-page history.back() (NOT page.goBack(), which waits for a
	// navigation that a SHALLOW pop never performs).
	console.log('\n-> PHASE 2: AddSheet flow, then walk back out');
	await page.goto(`${APP_URL}/trips/${seed.slug}/now`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(400);
	await page.evaluate(() => {
		window.__log.length = 0;
		window.__vt.length = 0;
	});
	await page.locator('.md-desktop\\:hidden button[aria-label="Add"]').click();
	await page.waitForTimeout(500);
	console.log(`   sheet open at ${new URL(page.url()).pathname}`);
	await page.getByText('Add item to today').click();
	await page.waitForURL(/\/items\/new/, { timeout: 15_000 });
	await page.waitForTimeout(600);

	const seen = [new URL(page.url()).pathname];
	for (let i = 0; i < 3; i++) {
		const before = new URL(page.url()).pathname;
		const t = Date.now();
		// In-page back: resolves whether or not a navigation follows.
		await page.evaluate(() => history.back());
		await page.waitForTimeout(900);
		const after = new URL(page.url()).pathname;
		const st = await page.evaluate(() => JSON.stringify(history.state && history.state.sheet ? { sheet: history.state.sheet } : {}));
		console.log(`   back ${i + 1}: ${before} -> ${after} ${after === before ? '  *** DEAD TAP ***' : ''} (${Date.now() - t}ms, state=${st})`);
		seen.push(after);
	}
	const p2 = await page.evaluate(DUMP);
	console.log('   history events during phase 2:');
	for (const e of p2.log.filter((x) => x.kind.startsWith('history') || x.kind.startsWith('popstate') || x.kind === 'pushState'))
		console.log(`     ${String(e.t).padStart(6)}ms  ${e.kind.padEnd(20)} ${JSON.stringify({ ...e, t: undefined, kind: undefined })}`);

	// ── PHASE 3: page.goBack() vs in-page history.back(), FRESH context ──────
	// Phase 2 reused phase 1's history, so its back presses walked entries from
	// the earlier flow — inconclusive. This runs the flow in a clean context and
	// asks the one question that matters: does the spec's own `page.goBack()`
	// hang where an in-page `history.back()` does not? A SHALLOW pop performs no
	// navigation, and page.goBack() waits for one.
	console.log('\n-> PHASE 3: fresh context — page.goBack() vs history.back()');
	for (const mode of ['page.goBack', 'history.back']) {
		const c2 = await browser.newContext({
			viewport: { width: 375, height: 812 },
			hasTouch: true,
			isMobile: true,
			reducedMotion: 'no-preference'
		});
		const p2 = await c2.newPage();
		await p2.addInitScript(INSTRUMENT);
		await p2.goto(`${APP_URL}/api/dev/login?email=${encodeURIComponent(EMAIL)}`, { waitUntil: 'networkidle' });
		await p2.goto(`${APP_URL}/trips/${seed.slug}`, { waitUntil: 'networkidle' });
		await p2.goto(`${APP_URL}/trips/${seed.slug}/now`, { waitUntil: 'networkidle' });
		await p2.waitForTimeout(400);
		await p2.locator('.md-desktop\\:hidden button[aria-label="Add"]').click();
		await p2.waitForTimeout(500);
		await p2.getByText('Add item to today').click();
		await p2.waitForURL(/\/items\/new/, { timeout: 15_000 });
		await p2.waitForTimeout(600);

		console.log(`  [${mode}] start at ${new URL(p2.url()).pathname}`);
		for (let i = 0; i < 2; i++) {
			const before = new URL(p2.url()).pathname;
			const t = Date.now();
			let note = '';
			try {
				if (mode === 'page.goBack') await p2.goBack({ timeout: 8000 });
				else await p2.evaluate(() => history.back());
			} catch (err) {
				note = `  <<< ${String(err.message).split('\n')[0].slice(0, 60)}`;
			}
			await p2.waitForTimeout(900);
			const after = new URL(p2.url()).pathname;
			console.log(`  [${mode}] back ${i + 1}: ${before} -> ${after} (${Date.now() - t}ms)${after === before ? '  *** URL UNCHANGED ***' : ''}${note}`);
		}
		await c2.close();
	}

	// ── PHASE 4: what does the spec's own locator actually resolve to? ───────
	// sheet-gestures.spec.ts:256 uses `[data-sheet-panel] a, [data-sheet-panel]
	// button` WITHOUT a visible filter, then `.first()`. AppShell renders every
	// page twice (one CSS-hidden), so `.first()` can be the hidden copy — and a
	// click on it waits for visibility until the 30s test timeout.
	console.log('\n-> PHASE 4: the spec locator, counted');
	{
		const c3 = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
		const p3 = await c3.newPage();
		await p3.goto(`${APP_URL}/api/dev/login?email=${encodeURIComponent(EMAIL)}`, { waitUntil: 'networkidle' });
		await p3.goto(`${APP_URL}/trips/${seed.slug}/now`, { waitUntil: 'networkidle' });
		await p3.waitForTimeout(400);
		await p3.locator('[aria-label="Add"]:visible').first().click();
		await p3.waitForTimeout(600);

		const panels = await p3.locator('[data-sheet-panel]').count();
		const panelsVisible = await p3.locator('[data-sheet-panel]').filter({ visible: true }).count();
		const choices = p3.locator('[data-sheet-panel] a, [data-sheet-panel] button').filter({ hasText: /expense|item|idea|note/i });
		const n = await choices.count();
		console.log(`   [data-sheet-panel]: ${panels} total, ${panelsVisible} visible`);
		console.log(`   spec's choice locator matches: ${n}`);
		for (let i = 0; i < n; i++) {
			const el = choices.nth(i);
			console.log(`     #${i} visible=${await el.isVisible()} text=${JSON.stringify((await el.innerText()).replace(/\s+/g, ' ').trim().slice(0, 40))}`);
		}
		await c3.close();
	}

	console.log('\n-> STEP 4: can the user actually click the card overflow now?');
	try {
		await page
			.locator('.relative.rounded-xl')
			.filter({ visible: true })
			.first()
			.getByRole('button', { name: 'Item actions' })
			.click({ timeout: 4000 });
		console.log('   click SUCCEEDED — not wedged');
	} catch (e) {
		console.log('   click FAILED —', String(e.message).split('\n')[0]);
	}

	await ctx.close();
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
