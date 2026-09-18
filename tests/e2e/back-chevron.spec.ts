import { test, expect, type Page } from '@playwright/test';

// #361 — the in-app back chevron is ORIGIN-AWARE, not chronological.
//
// These are the acceptance criteria Scott settled scenario-by-scenario on
// 2026-08-26, asserted as behaviour rather than as implementation:
//
//   chevron = the screen you drilled in from (`?from=`)
//   peers   = day→day and tab→tab don't re-parent
//   cold    = no origin → the trip's itinerary overview
//   OS back = still chronological, deliberately different from the chevron
//
// WHY AN E2E AND NOT A UNIT TEST: the unit tests in back-nav.test.ts cover the
// resolver and its open-redirect defence in isolation. What they cannot see is
// whether real links actually CARRY the origin — a `withOrigin` call missing
// from one emitter is invisible to them and to `pnpm check`, and shows up only
// as the chevron quietly going to the wrong place. That is the failure mode
// this file exists to catch.

const BASE = 'http://localhost:4173';

async function openFirstTrip(page: Page): Promise<string> {
	await page.locator('a[href*="/trips/"]').first().click();
	await page.waitForURL('**/trips/**');
	return page.url().split('/trips/')[1].split('/')[0];
}

const chevron = (page: Page) =>
	page.getByRole('button', { name: 'Back' }).filter({ visible: true }).first();

test.describe('Back chevron — origin-aware up-navigation (#361)', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${BASE}/api/dev/login`);
		await page.waitForURL('**/trips');
	});

	test('a drilled-in item returns to the screen it was opened from', async ({ page }) => {
		const slug = await openFirstTrip(page);

		// Drill in from the trip overview, which is also the fallback — so this
		// alone would pass even with no origin. The real assertion is the URL
		// carrying it, which is what makes the NEXT test meaningful.
		// The overview does not always list items; day pages do. Try both rather
		// than skipping on the first empty screen — this assertion is the point of
		// the file, so it should be hard to skip by accident.
		const origins = [`${BASE}/trips/${slug}`];
		await page.goto(`${BASE}/trips/${slug}`);
		for (const d of await page.locator('a[href*="/days/"]').evaluateAll((els) =>
			els.map((e) => (e as HTMLAnchorElement).getAttribute('href')).filter(Boolean)
		)) {
			origins.push(`${BASE}${d}`);
		}

		let itemLink = page.locator('a[href*="/items/"]').filter({ visible: true }).first();
		for (const origin of origins) {
			await page.goto(origin);
			itemLink = page.locator('a[href*="/items/"]').filter({ visible: true }).first();
			if ((await itemLink.count()) > 0) break;
		}
		test.skip((await itemLink.count()) === 0, 'no items anywhere in the seed trip');

		const href = await itemLink.getAttribute('href');
		expect(href, 'drill-in links must carry their origin').toContain('from=');

		await itemLink.click();
		await page.waitForURL(/\/items\/[a-z0-9]+/);
		await chevron(page).click();
		await page.waitForURL((u) => !u.pathname.includes('/items/'), { timeout: 10000 });
		expect(page.url()).toContain(`/trips/${slug}`);
	});

	test('browsing days is a PEER move — one tap gets you out, not five', async ({ page }) => {
		const slug = await openFirstTrip(page);
		await page.goto(`${BASE}/trips/${slug}`);

		const dayLink = page.locator('a[href*="/days/"]').filter({ visible: true }).first();
		test.skip((await dayLink.count()) === 0, 'seed trip has no days');
		await dayLink.click();
		await page.waitForURL(/\/days\//);
		// `.count()` does NOT auto-wait, so an arrow lookup can race DayNav's render
		// and SKIP this test rather than fail it — the worst outcome for an acceptance
		// check. Settle before counting.
		await page.waitForLoadState('networkidle');

		// Step sideways through days. These are peers: they must NOT re-parent, and
		// the arrows must not be tagged with an origin.
		// Step whichever way the trip allows — landing on the first or last day
		// only means one of the two arrows exists, and a peer move is a peer move
		// in either direction.
		let steps = 0;
		for (let i = 0; i < 3; i++) {
			let step = page.locator('a[aria-label^="Next day:"]').filter({ visible: true }).first();
			if ((await step.count()) === 0) {
				step = page.locator('a[aria-label^="Previous day:"]').filter({ visible: true }).first();
			}
			if ((await step.count()) === 0) break;
			expect(
				await step.getAttribute('href'),
				'a peer (day→day) link must not carry an origin'
			).not.toContain('from=');
			await step.click();
			await page.waitForURL(/\/days\//);
			steps++;
		}
		test.skip(steps === 0, 'seed trip has only one day');

		// ONE tap out, regardless of how many days were browsed. Chronological back
		// would need `steps` taps — that is the whole point of the change.
		await chevron(page).click();
		await page.waitForURL((u) => !u.pathname.includes('/days/'), { timeout: 10000 });
		expect(page.url()).toContain(`/trips/${slug}`);
	});

	test('the OS back gesture stays chronological — it still steps day by day', async ({ page }) => {
		const slug = await openFirstTrip(page);
		await page.goto(`${BASE}/trips/${slug}`);
		const dayLink = page.locator('a[href*="/days/"]').filter({ visible: true }).first();
		test.skip((await dayLink.count()) === 0, 'seed trip has no days');
		await dayLink.click();
		await page.waitForURL(/\/days\//);
		// `.count()` does NOT auto-wait, so an arrow lookup can race DayNav's render
		// and SKIP this test rather than fail it — the worst outcome for an acceptance
		// check. Settle before counting.
		await page.waitForLoadState('networkidle');
		const firstDay = page.url();

		// Whichever arrow exists — landing on the last day means there is no Next,
		// and stepping either direction proves the same thing.
		let step = page.locator('a[aria-label^="Next day:"]').filter({ visible: true }).first();
		if ((await step.count()) === 0) {
			step = page.locator('a[aria-label^="Previous day:"]').filter({ visible: true }).first();
		}
		test.skip((await step.count()) === 0, 'seed trip has only one day');
		await step.click();
		await page.waitForURL((u) => u.href !== firstDay);

		// The chevron jumps out; browser back does NOT. Both were asked for, and
		// only the divergence delivers both.
		await page.goBack();
		await page.waitForURL(firstDay, { timeout: 10000 });
		expect(page.url()).toBe(firstDay);
	});

	// These two deliberately use a TAB page rather than an item: its fallback is
	// unconditionally the trip overview, so they assert the resolver without
	// depending on whether the seed trip happens to contain any items.
	test('a cold deep-link with no origin falls back to the trip overview', async ({ page }) => {
		const slug = await openFirstTrip(page);

		// No `?from=` — this is what an invite link or a digest email looks like.
		await page.goto(`${BASE}/trips/${slug}/documents`);
		await chevron(page).click();
		await page.waitForURL(`${BASE}/trips/${slug}`, { timeout: 10000 });
		expect(page.url()).toBe(`${BASE}/trips/${slug}`);
	});

	test('a hostile ?from= does not redirect off-site', async ({ page }) => {
		const slug = await openFirstTrip(page);

		// `?from=` is user-controllable and feeds goto(). Unvalidated this is an
		// open redirect. `//evil.com` is the one that beats a naive
		// startsWith('/') check, which is exactly why it is asserted here.
		for (const hostile of ['https://evil.com', '//evil.com', '/\\evil.com']) {
			await page.goto(`${BASE}/trips/${slug}/documents?from=${encodeURIComponent(hostile)}`);
			await chevron(page).click();
			await page.waitForURL(`${BASE}/trips/${slug}`, { timeout: 10000 });
			expect(page.url(), `?from=${hostile} must not leave the app`).toBe(`${BASE}/trips/${slug}`);
		}
	});
});
