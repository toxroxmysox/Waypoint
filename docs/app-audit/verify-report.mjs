// Load index.html via file://, confirm mermaid rendered + filters work, screenshot.
import { chromium } from '@playwright/test';

const url = 'file://' + new URL('./index.html', import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const diagrams = await page.locator('.diagram svg').count();
const cards = await page.locator('#cards .card').count();
const rows = await page.locator('#tptable tbody tr').count();
const imgs = await page.evaluate(() =>
  Array.from(document.images).map((i) => [i.src.split('/').pop(), i.naturalWidth > 0])
);
// test a filter: click P1 → count visible cards
await page.locator('#ff button[data-val="P1"]').click();
await page.waitForTimeout(200);
const visP1 = await page.locator('#cards .card:visible').count();

await page.screenshot({ path: new URL('./screenshots/zz-report-top.png', import.meta.url).pathname });
console.log(JSON.stringify({ diagramsRendered: diagrams, findingCards: cards, taskpathRows: rows, p1Visible: visP1, images: imgs, pageErrors: errors }, null, 1));
await browser.close();
