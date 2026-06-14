// #116 audit — capture problem-surface screenshots against the running preview server.
// Usage: node docs/app-audit/capture-screens.mjs [baseURL]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const ACTIVE = '/trips/e2e-active-trip';
const UPCOMING = '/trips/dnd-test-seville-imported-2v6c';

const SHOTS = [
  ['01-trips-list', '/trips'],
  ['02-overview-active', ACTIVE],
  ['03-now', `${ACTIVE}/now`],
  ['04-today', `${ACTIVE}/today`],
  ['05-documents', `${ACTIVE}/documents`],
  ['06-more', `${ACTIVE}/more`],
  ['07-settings-archive', `${ACTIVE}/settings`],
  ['08-overview-upcoming-chip', UPCOMING],
  ['09-today-on-upcoming-trip', `${UPCOMING}/today`],
  ['10-error-bad-slug', '/trips/nonexistent-slug-xyz'],
  ['11-members', `${ACTIVE}/members`],
  ['12-phases-swipe-entry', `${ACTIVE}/phases`]
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });

// Dev login (sets PB cookie, redirects /claim → /trips)
await page.goto(`${BASE}/api/dev/login`, { waitUntil: 'networkidle' });

for (const [name, path] of SHOTS) {
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(400);
    if (name === '07-settings-archive') {
      // scroll the archive section into view
      await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('code')).find(c => c.textContent?.includes('/archive/'));
        el?.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(200);
    }
    await page.screenshot({ path: `${OUT}${name}.png` });
    console.log(`ok ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`);
  }
}

await browser.close();
console.log('done');
