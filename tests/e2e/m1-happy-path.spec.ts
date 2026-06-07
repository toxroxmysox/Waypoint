import { test, expect } from '@playwright/test';

// Prerequisites:
// - PocketBase running on :8090 with WAYPOINT_DEV_MODE=true and E2E_TEST_EMAIL set
// - SvelteKit preview auto-booted by playwright.config.ts on :4173
// - .env.local carries WAYPOINT_DEV_MODE and E2E_TEST_EMAIL (loaded via dotenv
//   in playwright.config.ts so process.env sees them here).
//
// /api/dev/login issues a real auth cookie via a PB bypass endpoint. Both
// endpoints 404/400 unless WAYPOINT_DEV_MODE=true, so production stays safe.

const BASE_URL = 'http://localhost:4173';

test.describe('M1 Happy Path', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeEach(async ({ page }) => {
		const email = encodeURIComponent(process.env.E2E_TEST_EMAIL!);
		await page.goto(`${BASE_URL}/api/dev/login?email=${email}`);
		await page.waitForURL(`${BASE_URL}/trips`, { timeout: 10000 });
	});

	test('create trip → add phase → add item → verify', async ({ page }) => {
		// Unique slug per run so repeated CI runs don't collide on the trips.slug unique index.
		const stamp = Date.now().toString(36);
		const tripTitle = `E2E Trip ${stamp}`;
		const tripSlug = `e2e-trip-${stamp}`;

		await expect(page.getByRole('heading', { name: 'Waypoint', level: 1 })).toBeVisible();

		// --- Create trip ---
		await page.getByRole('link', { name: 'New Trip' }).click();
		await page.waitForURL(`${BASE_URL}/trips/new`);

		await page.fill('input[name="title"]', tripTitle);

		const today = new Date().toISOString().split('T')[0];
		const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

		await page.fill('input[name="start_date"]', today);
		await page.fill('input[name="end_date"]', nextWeek);
		await page.fill('input[name="location_summary"]', 'Test Location');

		await page.getByRole('button', { name: /create|save/i }).click();

		await page.waitForURL(`${BASE_URL}/trips/${tripSlug}`, { timeout: 10000 });
		// The trip layout is dual-tree (mobile + desktop, one CSS-hidden); scope all
		// content/form locators to the visible subtree to avoid strict-mode violations.
		await expect(
			page.getByRole('heading', { name: tripTitle }).filter({ visible: true }).first()
		).toBeVisible();

		// Day links are duplicated across trees *and* the desktop ContextRail "Up Next"
		// list, so the visible count is not a clean 8 — assert the first day instead.
		const dayLinks = page.locator(`a[href^="/trips/${tripSlug}/days/"]:visible`);
		await expect(dayLinks.first()).toBeVisible({ timeout: 5000 });

		// --- Add phase ---
		await page.getByRole('link', { name: 'Phases', exact: true }).filter({ visible: true }).first().click();
		await page.waitForURL(`${BASE_URL}/trips/${tripSlug}/phases`);

		await page.getByRole('button', { name: 'Add Phase' }).filter({ visible: true }).first().click();
		await page.locator('input[name="name"]:visible').first().fill('Phase One');
		await page.locator('input[name="start_date"]:visible').first().fill(today);

		const midpoint = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		await page.locator('input[name="end_date"]:visible').first().fill(midpoint);

		await page.getByRole('button', { name: /create phase/i }).filter({ visible: true }).first().click();
		await expect(
			page.getByRole('heading', { name: 'Phase One', level: 3 }).filter({ visible: true }).first()
		).toBeVisible({ timeout: 5000 });

		// --- Navigate to first day via overview ---
		await page.getByRole('link', { name: 'Overview', exact: true }).filter({ visible: true }).first().click();
		await page.waitForURL(`${BASE_URL}/trips/${tripSlug}`);

		const firstDay = dayLinks.first();
		const dayHref = await firstDay.getAttribute('href');
		await firstDay.click();
		// "Add item" matches both the inline link and the FAB → filter visible + first.
		await expect(
			page.getByRole('link', { name: /^Add item$/i }).filter({ visible: true }).first()
		).toBeVisible();

		// --- Add an item ---
		await page.getByRole('link', { name: /^Add item$/i }).filter({ visible: true }).first().click();
		await page.waitForURL(/\/items\/new/);

		await page.locator('input[name="title"]:visible').first().fill('Test Activity');
		await page.getByRole('button', { name: /create|save/i }).filter({ visible: true }).first().click();

		await page.waitForURL(new RegExp(dayHref!.replace(/\//g, '\\/')), { timeout: 10000 });
		await expect(page.getByText('Test Activity').filter({ visible: true }).first()).toBeVisible();
	});

	test('no horizontal scroll on mobile viewport', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto(`${BASE_URL}/trips`);

		const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
		const viewportWidth = await page.evaluate(() => window.innerWidth);

		expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
	});
});
