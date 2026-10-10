import { test, expect, type Browser } from '@playwright/test';
import { E2E_BASE } from './e2e-env';

// #394 — a parked idea's votes show on the day page. The parking divider
// (mobile) and the desktop ContextRail "Ideas" list both render a sentiment
// pill from votesByItem, but the day loader only fetched votes for the day's
// own items, so an idea's pill never rendered on either surface.

const BASE = E2E_BASE;
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';
const SLUG = 'e2e-parking-votes';
const IDEA = 'Kohler Design Center';
const IDEA2 = 'Sheboygan lakefront walk';

async function pb(path: string, init: { method?: string; token?: string; body?: unknown } = {}) {
	const res = await fetch(PB_BASE + path, {
		method: init.method ?? 'GET',
		headers: {
			'Content-Type': 'application/json',
			...(init.token ? { Authorization: init.token } : {})
		},
		body: init.body === undefined ? undefined : JSON.stringify(init.body)
	});
	const data = await res.json();
	expect(res.ok, `${init.method ?? 'GET'} ${path}: ${JSON.stringify(data)}`).toBe(true);
	return data;
}

let dayId: string;
let phaseId: string;

async function seed() {
	const email = process.env.E2E_TEST_EMAIL!;
	const seeded = await pb('/api/dev/seed-visual-trip', { method: 'POST', body: { slug: SLUG } });
	dayId = seeded.days[0].id;
	const { token, record } = await pb('/api/dev/auth-bypass', { method: 'POST', body: { email } });
	const q = (f: string) => encodeURIComponent(f);
	const member = (
		await pb(
			`/api/collections/trip_members/records?filter=${q(`trip = "${seeded.tripId}" && user = "${record.id}"`)}`,
			{ token }
		)
	).items[0];
	const phase = (
		await pb(`/api/collections/phases/records?filter=${q(`trip = "${seeded.tripId}"`)}`, { token })
	).items[0];
	const idea = await pb('/api/collections/items/records', {
		method: 'POST',
		token,
		body: {
			trip: seeded.tripId,
			phase: phase.id,
			title: IDEA,
			type: 'activity',
			status: 'unplanned',
			sort_order: 5,
			created_by: member.id
		}
	});
	// An unvoted sibling in the same group with the earlier sort order: it only
	// outranks IDEA once IDEA's own vote is cleared (a 0-0 tie breaks by sort order).
	await pb('/api/collections/items/records', {
		method: 'POST',
		token,
		body: {
			trip: seeded.tripId,
			phase: phase.id,
			title: IDEA2,
			type: 'activity',
			status: 'unplanned',
			sort_order: 0,
			created_by: member.id
		}
	});
	phaseId = phase.id;

	await pb('/api/collections/votes/records', {
		method: 'POST',
		token,
		body: { trip: seeded.tripId, item: idea.id, member: member.id, value: 'love' }
	});
}

async function openDay(browser: Browser, width: number) {
	const ctx = await browser.newContext({ viewport: { width, height: 900 } });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(process.env.E2E_TEST_EMAIL!)}`);
	await page.waitForURL(/\/trips|\/claim/, { timeout: 15000 });
	await page.goto(`${BASE}/trips/${SLUG}/days/${dayId}`);
	return { ctx, page };
}

// The pill sits in the same card as the idea's title (`<p title=…>`).
const ideaPill = (page: import('@playwright/test').Page) =>
	page.locator(`p[title="${IDEA}"]:visible`).locator('xpath=..').locator('[data-vote-pills]');

test.beforeAll(seed);

test.describe('Parking-lot idea votes on the day page (#394)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test('375px: the parking divider shows the idea’s vote pill', async ({ browser }) => {
		const { ctx, page } = await openDay(browser, 375);
		await page.locator('button[aria-expanded]:visible', { hasText: '2 ideas' }).click();
		await expect(ideaPill(page)).toBeVisible();
		await expect(ideaPill(page)).toHaveAttribute('aria-label', '1 love, your vote love');
		await ctx.close();
	});

	test('1280px: the desktop Ideas rail shows the idea’s vote pill', async ({ browser }) => {
		const { ctx, page } = await openDay(browser, 1280);
		const rail = page.locator('h3:visible', { hasText: 'Ideas' }).locator('xpath=..');
		await expect(rail.locator(`p[title="${IDEA}"]`)).toBeVisible();
		await expect(
			rail.locator(`p[title="${IDEA}"]`).locator('xpath=..').locator('[data-vote-pills]')
		).toBeVisible();
		await ctx.close();
	});
});

// ---------------------------------------------------------------------------
// #425 — tap-to-vote pills. The seed gives me a Love on IDEA; IDEA2 is unvoted
// with the earlier sort order. Serial: each test leaves the vote state it found.
// ---------------------------------------------------------------------------
const orderOf = async (page: import('@playwright/test').Page, scope: string) =>
	page.locator(`${scope} p[title]`).filter({ hasText: /Kohler Design|Sheboygan lakefront/ }).allTextContents();

// Tap and wait for the write to land: a second tap while the first is in flight is
// cancelled by design (double-tap guard), so a test must not outrun the round-trip.
const tap = async (page: import('@playwright/test').Page, pill: import('@playwright/test').Locator) => {
	const wrote = page.waitForResponse((r) => r.request().method() === 'POST' && /\?\/(vote|unvote)/.test(r.url()));
	const refreshed = page.waitForResponse((r) => /__data\.json\?.*invalidated/.test(r.url()));
	await pill.click();
	await wrote;
	await refreshed;
	await page.waitForTimeout(150);
};

const group = (page: import('@playwright/test').Page, title: string, scope: string) =>
	page.locator(`${scope} p[title="${title}"]`).locator('xpath=..').locator('[data-vote-pills]');

test.describe('Tap-to-vote pills on ideas (#425)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');
	test.describe.configure({ mode: 'serial' });

	test('375px: tap toggles my vote, counts update, the card does not open, the order re-sorts', async ({
		browser
	}) => {
		const { ctx, page } = await openDay(browser, 375);
		await page.waitForLoadState('networkidle');
		await page.locator('button[aria-expanded]:visible', { hasText: '2 ideas' }).click();
		const zone = '[data-parking-zone]:visible';
		const kohler = group(page, IDEA, zone);

		// All four pills always show; the accessible name reads the tally.
		await expect(kohler).toHaveAttribute('aria-label', '1 love, your vote love');
		await expect(kohler.locator('[data-vote]')).toHaveCount(4);
		await expect(kohler.locator('[data-vote="love"]')).toHaveAttribute('aria-pressed', 'true');
		expect(await orderOf(page, zone)).toEqual([IDEA, IDEA2]);

		const url = page.url();
		const writes: string[] = [];
		page.on('request', (r) => {
			if (r.method() === 'POST') writes.push(r.url());
		});

		// Tap my Love again: cleared, count gone, card did not navigate, order flips.
		await tap(page, kohler.locator('[data-vote="love"]'));
		await expect(kohler).toHaveAttribute('aria-label', 'no votes');
		await expect(kohler.locator('[data-vote="love"]')).toHaveAttribute('aria-pressed', 'false');
		await expect.poll(() => orderOf(page, zone)).toEqual([IDEA2, IDEA]);
		expect(page.url()).toBe(url);

		// Tap Like on IDEA: filled, counted; ties/scores re-sort (1 beats 0).
		await tap(page, kohler.locator('[data-vote="like"]'));
		await expect(kohler).toHaveAttribute('aria-label', '1 like, your vote like');
		await expect(kohler.locator('[data-vote="like"]')).toHaveAttribute('aria-pressed', 'true');
		await expect.poll(() => orderOf(page, zone)).toEqual([IDEA, IDEA2]);

		// Switching sentiment moves the fill; back to Love restores the seed state.
		await tap(page, kohler.locator('[data-vote="love"]'));
		await expect(kohler).toHaveAttribute('aria-label', '1 love, your vote love');
		await expect(kohler.locator('[data-vote="like"]')).toHaveAttribute('aria-pressed', 'false');
		expect(page.url()).toBe(url);
		// Only vote/unvote writes happened: a tap never plans or reorders.
		expect(writes.every((w) => /\?\/(vote|unvote)/.test(w))).toBe(true);
		await ctx.close();
	});

	test('persisted: a reload keeps my vote (it was written, not just painted)', async ({ browser }) => {
		const { ctx, page } = await openDay(browser, 375);
		await page.waitForLoadState('networkidle');
		await page.locator('button[aria-expanded]:visible', { hasText: '2 ideas' }).click();
		await expect(group(page, IDEA, '[data-parking-zone]:visible')).toHaveAttribute(
			'aria-label',
			'1 love, your vote love'
		);
		await ctx.close();
	});

	test('dragging an idea among the ideas changes nothing: no write, same order', async ({ browser }) => {
		const { ctx, page } = await openDay(browser, 768);
		await page.waitForLoadState('networkidle');
		await page.locator('button[aria-expanded]:visible', { hasText: '2 ideas' }).click();
		const zone = '[data-parking-zone]:visible';
		const writes: string[] = [];
		page.on('request', (r) => {
			if (r.method() === 'POST') writes.push(r.url());
		});
		const a = (await page.locator(zone).getByRole('listitem', { name: IDEA2 }).boundingBox())!;
		const b = (await page.locator(zone).getByRole('listitem', { name: IDEA }).boundingBox())!;
		await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
		await page.mouse.down();
		await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 - 20, { steps: 4 });
		await page.mouse.move(b.x + b.width / 2, b.y + b.height - 4, { steps: 12 });
		await page.mouse.up();
		await page.waitForTimeout(500);
		expect(writes).toEqual([]);
		await expect.poll(() => orderOf(page, zone)).toEqual([IDEA, IDEA2]);
		await ctx.close();
	});

	test('1280px: the Ideas panel pills vote, and hovering shows who voted', async ({ browser }) => {
		const { ctx, page } = await openDay(browser, 1280);
		await page.waitForLoadState('networkidle');
		const rail = page.locator('h3:visible', { hasText: 'Ideas' }).locator('xpath=..');
		const kohler = rail.locator(`p[title="${IDEA}"]`).locator('xpath=..').locator('[data-vote-pills]');
		await expect(kohler).toHaveAttribute('aria-label', '1 love, your vote love');
		await kohler.locator('[data-vote="love"]').hover();
		await expect(kohler.locator('[data-vote-tip]')).toContainText('Love: You');
		await ctx.close();
	});

	test('Phase Detail: pills vote on the phase ideas too', async ({ browser }) => {
		const { ctx, page } = await openDay(browser, 375);
		await page.goto(`${BASE}/trips/${SLUG}/phases/${phaseId}`, { waitUntil: 'networkidle' });
		const walk = group(page, IDEA2, '[data-phase-ideas]:visible');
		await expect(walk).toHaveAttribute('aria-label', 'no votes');
		await tap(page, walk.locator('[data-vote="flexible"]'));
		await expect(walk).toHaveAttribute('aria-label', '1 flexible, your vote flexible');
		await tap(page, walk.locator('[data-vote="flexible"]'));
		await expect(walk).toHaveAttribute('aria-label', 'no votes');
		await ctx.close();
	});
});
