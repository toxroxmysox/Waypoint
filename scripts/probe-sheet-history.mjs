// Diagnostic for #365's back-swallowing: does every sheet dismissal path leave
// the history stack clean?
//
// STATUS 2026-08-24: back-swallowing SHIPS DISABLED. `swallowBack` defaults to
// false in BottomSheet.svelte until #383 is fixed, so no sheet pushes an entry
// and this probe's assertions are trivially satisfied — it proves nothing while
// the flag is off. It is kept because it is the instrument that found the dead
// tap in the first place. Re-run it, and believe it again, in the same change
// that flips `swallowBack` back to true.
//
// WHY THIS EXISTS. The bug class here is invisible to `pnpm check`, unit tests,
// e2e and screenshots alike: the sheet closes correctly and the page looks
// right, but a history entry is left behind and the user's NEXT back press does
// nothing (the #235 dead tap). Two separate implementations shipped green with
// that defect in them. This drives each close path in a real browser and asserts
// the property a user actually feels.
//
//   pnpm exec node scripts/probe-sheet-history.mjs
//
// Boots the same isolated stack verify-visual uses (PB :8097 + vite :5199,
// seeded via /api/dev/seed-visual-trip) and tears it down. Never touches :8090.
//
// THE ASSERTIONS, and why they are shaped this way:
//   - Direct paths: sentinel /trips -> /expenses -> open -> close -> ONE back
//     must reach /trips. If the entry leaked, that press is spent walking a dead
//     entry and you stay on /expenses.
//   - AddSheet (close + goto): every back press must CHANGE something. That
//     catches both failure modes at once — a press that does nothing, and a
//     press that skips a page (an earlier fix walked twice and jumped /now).
//
// A path that measures nothing must never report success: an empty run exits 1.
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = process.env.PROBE_ROOT ?? process.cwd();
const PB_PORT = Number(process.env.PROBE_PB_PORT ?? 8097);
const APP_PORT = Number(process.env.PROBE_APP_PORT ?? 5199);
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
  const c = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(c);
  c.stdout.on('data', () => {});
  c.stderr.on('data', (b) => process.env.PROBE_DEBUG && process.stderr.write(b));
};
async function waitFor(url, ms, ok = (r) => r.ok) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (ok(await fetch(url))) return; } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`never came up: ${url}`);
}

let failures = 0;
let measured = 0;

try {
  reclaim(PB_PORT); reclaim(APP_PORT);
  console.log(`-> isolated PocketBase on :${PB_PORT}`);
  launch('bash', [path.join(ROOT, 'scripts', 'e2e-clean-pb.sh')], { PB_PORT: String(PB_PORT) });
  await waitFor(`${PB_URL}/api/health`, 45_000);

  const seed = await (await fetch(`${PB_URL}/api/dev/seed-visual-trip`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
  })).json();

  console.log(`-> vite dev on :${APP_PORT}`);
  launch('pnpm', ['exec', 'vite', 'dev', '--host', '127.0.0.1', '--port', String(APP_PORT), '--strictPort'], {
    PUBLIC_PB_URL: PB_URL, PB_INTERNAL_URL: PB_URL, WAYPOINT_DEV_MODE: 'true'
  });
  await waitFor(`${APP_URL}/`, 90_000, () => true);

  const browser = await chromium.launch();
  const EXP = `/trips/${seed.slug}/expenses`;

  // Fresh context per case: history and page.state must not leak between paths.
  async function fresh() {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, reducedMotion: 'no-preference'
    });
    const page = await ctx.newPage();
    await page.goto(`${APP_URL}/api/dev/login?email=${encodeURIComponent(EMAIL)}`, { waitUntil: 'networkidle' });
    await page.goto(`${APP_URL}/trips`, { waitUntil: 'networkidle' });
    await page.goto(`${APP_URL}${EXP}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    return { ctx, page };
  }

  async function testPath(name, close, { fill = false } = {}) {
    const { ctx, page } = await fresh();
    try {
      await page.locator('[aria-label="Add expense"]:visible').first().click();
      await page.waitForTimeout(700);
      if (fill) {
        await page.locator('[data-sheet-panel] input[name="amount_usd"]:visible').first().fill('9.00');
        await page.locator('[data-sheet-panel] input[name="description"]:visible').first().fill('probe');
      }
      await close(page);
      await page.waitForTimeout(1600);
      const closed = (await page.locator('[data-sheet-panel]').count()) === 0;
      await page.goBack();
      await page.waitForTimeout(1200);
      const landed = await page.evaluate(() => location.pathname);
      const ok = closed && landed === '/trips';
      measured++;
      if (!ok) failures++;
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(30)} closed=${closed}  one back -> ${landed}${ok ? '' : '   <-- entry left behind'}`);
    } finally { await ctx.close(); }
  }

  console.log('\nDIRECT PATHS: after closing, ONE back press must reach /trips\n');
  await testPath('X button', (p) => p.locator('[data-sheet-panel] button[aria-label="Close"]:visible').first().click());
  await testPath('Escape', (p) => p.keyboard.press('Escape'));
  await testPath('backdrop tap', (p) => p.mouse.click(188, 60));
  await testPath('drag-to-dismiss', async (p) => {
    const box = await p.locator('[data-sheet-panel]').boundingBox();
    const x = box.x + box.width / 2, y = box.y + 20;
    await p.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      const mk = (ty, cy) => new TouchEvent(ty, {
        bubbles: true, cancelable: true,
        touches: ty === 'touchend' ? [] : [new Touch({ identifier: 1, target: el, clientX: x, clientY: cy })],
        changedTouches: [new Touch({ identifier: 1, target: el, clientX: x, clientY: cy })]
      });
      el.dispatchEvent(mk('touchstart', y));
      el.dispatchEvent(mk('touchmove', y + 150));
      el.dispatchEvent(mk('touchmove', y + 320));
      el.dispatchEvent(mk('touchend', y + 320));
    }, { x, y });
  });
  await testPath('enhance submit (no nav)', (p) => p.locator('[data-sheet-panel] button[type="submit"]:visible').first().click(), { fill: true });

  console.log('\nADDSHEET (close + goto): every back press must change something\n');
  {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, reducedMotion: 'no-preference'
    });
    const page = await ctx.newPage();
    await page.goto(`${APP_URL}/api/dev/login?email=${encodeURIComponent(EMAIL)}`, { waitUntil: 'networkidle' });
    await page.goto(`${APP_URL}/trips`, { waitUntil: 'networkidle' });
    await page.goto(`${APP_URL}/trips/${seed.slug}/now`, { waitUntil: 'networkidle' });
    await page.locator('[aria-label="Add"]:visible').first().click();
    await page.waitForTimeout(700);
    await page.locator('[data-sheet-panel] a, [data-sheet-panel] button')
      .filter({ hasText: /expense|item|idea|note/i }).first().click();
    await page.waitForTimeout(1800);
    let prev = await page.evaluate(() => location.pathname);
    console.log(`    landed on ${prev}`);
    let dead = 0;
    for (let i = 1; i <= 2; i++) {
      await page.goBack().catch(() => {});
      await page.waitForTimeout(1200);
      const now = await page.evaluate(() => location.pathname);
      if (now === prev) { dead++; console.log(`    back#${i} -> ${now}   <-- DEAD TAP`); }
      else console.log(`    back#${i} -> ${now}`);
      prev = now;
    }
    measured++;
    if (dead) failures++;
    console.log(`  ${dead ? 'FAIL' : 'PASS'}  AddSheet close+goto — ${dead} dead tap(s)`);
    await ctx.close();
  }

  // A run that measured nothing is not a pass. This harness once printed a
  // confident green having driven zero controls, because dev login had bounced.
  console.log('\n' + '='.repeat(60));
  if (measured === 0) { console.log('INCONCLUSIVE — measured nothing.'); failures = 1; }
  else console.log(failures ? `${failures} BROKEN PATH(S)` : `ALL ${measured} PATHS CLEAN`);

  await browser.close();
} finally {
  for (const c of children) { try { process.kill(-c.pid, 'SIGKILL'); } catch {} }
  reclaim(PB_PORT); reclaim(APP_PORT);
}

process.exit(failures ? 1 : 0);
