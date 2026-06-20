import { test, expect } from '@playwright/test';

// playwright.config.ts boots `npm run build && npm run preview` on :4173.
// /api/dev/login issues a real auth cookie via a PB bypass endpoint (404s unless
// WAYPOINT_DEV_MODE=true, so production stays safe).
const BASE = 'http://localhost:4173';

// The trip layout is dual-tree (mobile + desktop, one CSS-hidden). Scope every
// content locator to the visible subtree to avoid strict-mode violations (#239
// guardrail: AppShell renders +page.svelte twice).

// Create a trip whose dates are entirely in the PAST so it derives to the `wrap-up`
// lifecycle (today > end_date, not archived). Returns its slug. Unique stamp per run
// so repeated CI runs don't collide on the trips.slug unique index.
async function createPastTrip(page: import('@playwright/test').Page): Promise<string> {
	const stamp = Date.now().toString(36);
	const title = `Wrapup E2E ${stamp}`;
	const slug = `e2e-wrapup-${stamp}`;

	await page.goto(`${BASE}/trips/new`);
	await page.waitForURL('**/trips/new');

	await page.fill('input[name="title"]', title);
	// Both dates ~a month in the past → past end_date → wrap-up (archived defaults false).
	const start = new Date(Date.now() - 35 * 86_400_000).toISOString().split('T')[0];
	const end = new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0];
	await page.fill('input[name="start_date"]', start);
	await page.fill('input[name="end_date"]', end);
	await page.fill('input[name="location_summary"]', 'Wrapup Location');

	await page.getByRole('button', { name: /create|save/i }).click();
	await page.waitForURL(`${BASE}/trips/${slug}`, { timeout: 10000 });
	return slug;
}

test.describe('Wrap-up banner (#239)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeEach(async ({ page }) => {
		const email = encodeURIComponent(process.env.E2E_TEST_EMAIL!);
		await page.goto(`${BASE}/api/dev/login?email=${email}`);
		await page.waitForURL(`${BASE}/trips`, { timeout: 10000 });
	});

	test('past-end trip Overview renders the wrap-up banner instead of the trip-details top', async ({
		page
	}) => {
		const slug = await createPastTrip(page);

		// The banner replaces the top of the Overview. Its Close-out row is always
		// outstanding in wrap-up — it's the deliberate transition out of wrap-up.
		const banner = page.getByRole('region', { name: 'Trip wrap-up' }).filter({ visible: true }).first();
		await expect(banner).toBeVisible();
		await expect(banner.getByText('Close out')).toBeVisible();
		await expect(banner.getByText('Your trip has ended').filter({ visible: true }).first()).toBeVisible();

		// The normal planning Overview top (the "N days · M phases" stats line) is gone:
		// the banner stands in its place. Itinerary/Days still render below (unaffected).
		await expect(page.getByText(/\bdays ·/).filter({ visible: true })).toHaveCount(0);
	});

	test('Close-out row launches the existing closeout wizard', async ({ page }) => {
		const slug = await createPastTrip(page);

		await page
			.locator('[data-testid="wrapup-closeout"]')
			.filter({ visible: true })
			.first()
			.click();
		await page.waitForURL(`**/trips/${slug}/closeout`);
		expect(page.url()).toContain(`/trips/${slug}/closeout`);
	});

	test('a fresh past-end trip with no expenses hides the Settle-up row (gated on balance)', async ({
		page
	}) => {
		const slug = await createPastTrip(page);

		// No expenses → no balance owed → the Settle-up row falls away (Grill Res. #6:
		// settle-up is gated on balance, not lifecycle). Close-out still shows.
		await expect(page.locator('[data-testid="wrapup-settle"]')).toHaveCount(0);
		await expect(
			page.locator('[data-testid="wrapup-closeout"]').filter({ visible: true }).first()
		).toBeVisible();
	});

	test('wrap-up banner is usable one-handed at 375px', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		const slug = await createPastTrip(page);

		const banner = page.getByRole('region', { name: 'Trip wrap-up' }).filter({ visible: true }).first();
		await expect(banner).toBeVisible();
		// The Close-out row is a real tap target within the 375px column.
		const closeout = page.locator('[data-testid="wrapup-closeout"]').filter({ visible: true }).first();
		await expect(closeout).toBeVisible();
		const box = await closeout.boundingBox();
		expect(box).not.toBeNull();
		expect(box!.height).toBeGreaterThanOrEqual(40);
	});
});
