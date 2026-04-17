import { test, expect } from '@playwright/test';

// Prerequisites: PocketBase running on :8090, SvelteKit on :5173
// A test user must be pre-created in PocketBase with OTP enabled.
// This test uses a pre-seeded OTP code (only works in dev mode with PocketBase test config).
//
// Run: pnpm test:e2e

const BASE_URL = 'http://localhost:5173';
const TEST_TRIP_SLUG = `e2e-test-${Date.now()}`;

test.describe('M1 Happy Path', () => {
	test.skip(
		!process.env.E2E_TEST_EMAIL,
		'Set E2E_TEST_EMAIL and E2E_TEST_OTP_CODE env vars to run E2E tests'
	);

	test('login → create trip → add phase → view day', async ({ page }) => {
		// --- Login ---
		await page.goto(`${BASE_URL}/login`);
		await expect(page.getByText('Waypoint')).toBeVisible();

		await page.fill('input[type="email"]', process.env.E2E_TEST_EMAIL!);
		await page.click('button[type="submit"]');

		// Wait for OTP input to appear
		await expect(page.getByPlaceholder('000000')).toBeVisible({ timeout: 5000 });

		await page.fill('input[name="code"]', process.env.E2E_TEST_OTP_CODE!);
		await page.click('button[type="submit"]');

		// Should redirect to /trips
		await page.waitForURL(`${BASE_URL}/trips`, { timeout: 10000 });
		await expect(page.getByText('Trips')).toBeVisible();

		// --- Create trip ---
		await page.click('text=New Trip');
		await page.waitForURL(`${BASE_URL}/trips/new`);

		await page.fill('input[name="title"]', 'E2E Test Trip');
		// Slug auto-generates from title
		await expect(page.locator('input[name="slug"]')).toHaveValue('e2e-test-trip');

		const today = new Date().toISOString().split('T')[0];
		const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

		await page.fill('input[name="start_date"]', today);
		await page.fill('input[name="end_date"]', nextWeek);
		await page.fill('input[name="location_summary"]', 'Test Location');

		await page.click('button[type="submit"]');

		// Should redirect to the new trip
		await page.waitForURL(/\/trips\/e2e-test-trip/, { timeout: 10000 });
		await expect(page.getByText('E2E Test Trip')).toBeVisible();

		// --- Trip overview shows days ---
		await expect(page.getByText('Days')).toBeVisible();
		// Should have 8 days (today through nextWeek inclusive)
		const dayLinks = page.locator('a[href*="/days/"]');
		await expect(dayLinks).toHaveCount(8, { timeout: 5000 });

		// --- Add phase ---
		await page.click('text=Phases');
		await page.waitForURL(/\/trips\/e2e-test-trip\/phases/);

		await page.click('text=Add Phase');
		await page.fill('input[name="name"]', 'Phase One');
		await page.fill('input[name="start_date"]', today);

		const midpoint = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		await page.fill('input[name="end_date"]', midpoint);

		await page.click('button[type="submit"]');
		await expect(page.getByText('Phase One')).toBeVisible({ timeout: 5000 });

		// --- Navigate to first day ---
		await page.click('text=Overview');
		await page.waitForURL(/\/trips\/e2e-test-trip$/);

		const firstDay = dayLinks.first();
		const dayHref = await firstDay.getAttribute('href');
		await firstDay.click();
		await expect(page.getByText('Add Item')).toBeVisible();

		// --- Add an item ---
		await page.click('text=Add Item');
		await page.waitForURL(/\/items\/new/);

		// Select activity type (default)
		await page.fill('input[name="title"]', 'Test Activity');
		await page.click('button[type="submit"]');

		// Should redirect back to day
		await page.waitForURL(new RegExp(dayHref!.replace(/\//g, '\\/')), { timeout: 10000 });
		await expect(page.getByText('Test Activity')).toBeVisible();
	});

	test('no horizontal scroll on mobile viewport', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto(`${BASE_URL}/login`);

		const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
		const viewportWidth = await page.evaluate(() => window.innerWidth);

		expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
	});
});
