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

async function seed() {
	const email = process.env.E2E_TEST_EMAIL!;
	const seeded = await pb('/api/dev/seed-visual-trip', { method: 'POST', body: { slug: SLUG } });
	dayId = seeded.days[0].id;
	const { token, record } = await pb('/api/dev/auth-bypass', { method: 'POST', body: { email } });
	const q = (f: string) => encodeURIComponent(f);
	const member = (
		await pb(`/api/collections/trip_members/records?filter=${q(`trip = "${seeded.tripId}" && user = "${record.id}"`)}`, { token })
	).items[0];
	const phase = (await pb(`/api/collections/phases/records?filter=${q(`trip = "${seeded.tripId}"`)}`, { token })).items[0];
	const idea = await pb('/api/collections/items/records', {
		method: 'POST',
		token,
		body: { trip: seeded.tripId, phase: phase.id, title: IDEA, type: 'activity', status: 'unplanned', created_by: member.id }
	});
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
	page.locator(`p[title="${IDEA}"]:visible`).locator('xpath=..').getByLabel('Votes');

test.describe('Parking-lot idea votes on the day page (#394)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeAll(seed);

	test('375px: the parking divider shows the idea’s vote pill', async ({ browser }) => {
		const { ctx, page } = await openDay(browser, 375);
		await page.locator('button[aria-expanded]:visible', { hasText: '1 idea' }).click();
		await expect(ideaPill(page)).toBeVisible();
		await expect(ideaPill(page)).toContainText('♥');
		await ctx.close();
	});

	test('1280px: the desktop Ideas rail shows the idea’s vote pill', async ({ browser }) => {
		const { ctx, page } = await openDay(browser, 1280);
		const rail = page.locator('h3:visible', { hasText: 'Ideas' }).locator('xpath=..');
		await expect(rail.locator(`p[title="${IDEA}"]`)).toBeVisible();
		await expect(rail.locator(`p[title="${IDEA}"]`).locator('xpath=..').getByLabel('Votes')).toBeVisible();
		await ctx.close();
	});
});
