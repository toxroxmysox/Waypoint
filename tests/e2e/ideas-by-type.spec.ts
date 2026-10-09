import { test, expect, type Browser, type Page } from '@playwright/test';
import { E2E_BASE } from './e2e-env';

// #424 — ideas grouped by type. Headings (icon + plural label) in a fixed order,
// idea cards with a `place · cost` sub-line and no type icon, no grip handle, and
// a mouse drag of a whole card onto the day plans the idea.

const BASE = E2E_BASE;
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';
const SLUG = 'e2e-ideas-424';
let dayId = '';
let phaseId = '';

async function seed() {
	const res = await fetch(`${PB_BASE}/api/dev/seed-visual-trip`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ slug: SLUG, ideas: true })
	});
	if (!res.ok) throw new Error(`seed failed (${res.status}): ${await res.text()}`);
	const body = await res.json();
	dayId = body.days[0].id;
	phaseId = body.phaseId;
}

async function open(page: Page, width: number) {
	await page.setViewportSize({ width, height: 1000 });
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(process.env.E2E_TEST_EMAIL!)}`);
	await page.waitForURL(/\/trips|\/claim/, { timeout: 15000 });
	await page.goto(`${BASE}/trips/${SLUG}/days/${dayId}`, { waitUntil: 'networkidle' });
}

const HEADINGS = ['Lodging', 'Flights', 'Transportation', 'Activities', 'Meals', 'Notes'];

test.describe('Ideas grouped by type (#424)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');
	test.beforeAll(seed);
	// The seed is destructive per slug and the drag test plans an idea.
	test.describe.configure({ mode: 'serial' });

	test('375px: headings in fixed order, sub-line, no grip, no type icon on the card', async ({ page }) => {
		await open(page, 375);
		await page.locator('button[aria-expanded]:visible', { hasText: /ideas?/ }).click();
		const zone = page.locator('[data-parking-zone]').filter({ visible: true });
		await expect(zone.locator('[data-idea-heading]')).toHaveText(HEADINGS);
		await expect(zone.getByText('Sheboygan · $120')).toBeVisible();
		await expect(zone.getByLabel(/Drag to/)).toHaveCount(0);
		// A card's body (link area) carries no glyph: only the heading does.
		const card = zone.locator('p[title="Whistling Straits tour"]').locator('xpath=..');
		await expect(card.locator('svg')).toHaveCount(0);
		// In a group the favourite (most votes) is on top.
		await expect(zone.locator('p[title]').filter({ hasText: /Whistling|Kohler Waters|lakefront/ })).toHaveText([
			'Whistling Straits tour',
			'Kohler Waters Spa',
			'Sheboygan lakefront walk'
		]);
	});

	test('1280px: the Ideas panel uses the same headings', async ({ page }) => {
		await open(page, 1280);
		const rail = page.locator('h3:visible', { hasText: 'Ideas' }).locator('xpath=..');
		await expect(rail.locator('[data-idea-heading]')).toHaveText(HEADINGS);
	});

	test('Phase Detail groups the phase ideas the same way', async ({ page }) => {
		await open(page, 768);
		await page.goto(`${BASE}/trips/${SLUG}/phases/${phaseId}`);
		await expect(page.locator('[data-phase-ideas]:visible [data-idea-heading]')).toHaveText(HEADINGS);
	});

	test('mouse: dragging a whole idea card onto the day plans it', async ({ page }) => {
		await open(page, 768);
		await page.locator('button[aria-expanded]:visible', { hasText: /ideas?/ }).click();
		const idea = page.locator('[data-parking-zone]:visible').getByRole('listitem', { name: 'The American Club' });
		const target = page.locator('[data-day-timeline]:visible > div').first();
		const from = (await idea.boundingBox())!;
		const to = (await target.boundingBox())!;
		const planned = page.waitForResponse(
			(r) => r.request().method() === 'POST' && r.url().includes('?/pullToPlan') && r.ok(),
			{ timeout: 10000 }
		);
		await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
		await page.mouse.down();
		await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 20, { steps: 4 });
		await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
		await page.mouse.up();
		await planned;
		await page.reload({ waitUntil: 'networkidle' });
		await expect(page.locator('[data-day-timeline]:visible').getByText('The American Club')).toBeVisible();
	});

	test('touch: a long-press anywhere on the card drags it onto the day', async ({ browser }: { browser: Browser }) => {
		const ctx = await browser.newContext({ viewport: { width: 375, height: 2400 }, hasTouch: true, isMobile: true });
		const page = await ctx.newPage();
		await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(process.env.E2E_TEST_EMAIL!)}`);
		await page.waitForURL(/\/trips|\/claim/, { timeout: 15000 });
		await page.goto(`${BASE}/trips/${SLUG}/days/${dayId}`, { waitUntil: 'networkidle' });
		const cdp = await ctx.newCDPSession(page);
		await page.locator('button[aria-expanded]:visible', { hasText: /ideas?/ }).click();
		const idea = page.locator('[data-parking-zone]:visible').getByRole('listitem', { name: 'Rental car, 3 days' });
		const target = page.locator('[data-day-timeline]:visible > div').first();
		const f = (await idea.boundingBox())!;
		const t = (await target.boundingBox())!;
		// The title row: the vote pills (#425) sit lower and take their own taps.
		const from = { x: f.x + 60, y: f.y + 18 };
		const to = { x: t.x + t.width / 2, y: t.y + t.height / 2 };
		const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]) =>
			cdp.send('Input.dispatchTouchEvent', {
				type,
				touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i, radiusX: 1, radiusY: 1, force: 1 }))
			});
		const planned = page.waitForResponse(
			(r) => r.request().method() === 'POST' && r.url().includes('?/pullToPlan') && r.ok(),
			{ timeout: 10000 }
		);
		await touch('touchStart', [from]);
		await page.waitForTimeout(400);
		for (let i = 1; i <= 14; i++) {
			await touch('touchMove', [{ x: from.x + ((to.x - from.x) * i) / 14, y: from.y + ((to.y - from.y) * i) / 14 }]);
			await page.waitForTimeout(16);
		}
		await page.waitForTimeout(120);
		await touch('touchEnd', []);
		await planned;
		await ctx.close();
	});
});
