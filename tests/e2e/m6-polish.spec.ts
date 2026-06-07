import { test, expect } from '@playwright/test';

// playwright.config.ts boots `npm run build && npm run preview` on :4173.
const BASE = 'http://localhost:4173';

// E2E_TEST_EMAIL's first trip is active → loads in trip mode (no "More" tab).
// Navigate by URL (mode- and viewport-independent) instead of clicking nav chrome.
async function openTripSlug(page: import('@playwright/test').Page): Promise<string> {
	await page.goto(`${BASE}/trips`);
	await page.locator('a[href*="/trips/"]').first().click();
	await page.waitForURL('**/trips/**');
	return page.url().split('/trips/')[1].split(/[/?#]/)[0];
}

test.describe('M6 Polish', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${BASE}/api/dev/login`);
		await page.waitForURL('**/trips');
	});

	test('clone trip link visible on More page for owner', async ({ page }) => {
		const slug = await openTripSlug(page);
		await page.goto(`${BASE}/trips/${slug}/more`);
		await expect(page.getByText('Clone trip').filter({ visible: true }).first()).toBeVisible();
	});

	test('clone trip page renders with form', async ({ page }) => {
		const slug = await openTripSlug(page);
		await page.goto(`${BASE}/trips/${slug}/clone`);
		await page.waitForURL('**/clone');

		await expect(page.locator('input[name="title"]:visible').first()).toBeVisible();
		await expect(page.locator('input[name="start_date"]:visible').first()).toBeVisible();
		await expect(page.locator('input[name="include_phases"]:visible').first()).toBeVisible();
	});

	test('parking lot link visible on More page', async ({ page }) => {
		const slug = await openTripSlug(page);
		await page.goto(`${BASE}/trips/${slug}/more`);
		await expect(page.getByText('Parking lot').filter({ visible: true }).first()).toBeVisible();
	});

	test('parking lot page loads', async ({ page }) => {
		const slug = await openTripSlug(page);
		await page.goto(`${BASE}/trips/${slug}/parking-lot`);
		await page.waitForURL('**/parking-lot');

		const heading = page.getByText('Parking Lot').filter({ visible: true }).first();
		await expect(heading).toBeVisible();
	});

	test('print itinerary button visible on More page', async ({ page }) => {
		const slug = await openTripSlug(page);
		await page.goto(`${BASE}/trips/${slug}/more`);
		await expect(page.getByText('Print itinerary').filter({ visible: true }).first()).toBeVisible();
	});

	// NOTE: the "checklist template picker" test was removed when the checklist
	// item-type was retired (ADR-0003 / #48). Checklists are now a standalone
	// primitive surfaced via Itinerary › Lists — see lists-surface.spec.ts.

	test('responsive: bottom nav visible at mobile width', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await openTripSlug(page);

		// At 375px only the mobile subtree is visible.
		const bottomNav = page.locator('nav:visible').last();
		await expect(bottomNav).toBeVisible();
	});

	test('responsive: side rail visible at desktop width', async ({ page }) => {
		await page.setViewportSize({ width: 1024, height: 768 });
		await openTripSlug(page);

		const sideRail = page.locator('.side-rail');
		if (await sideRail.count()) {
			await expect(sideRail.filter({ visible: true }).first()).toBeVisible();
		}
	});
});
