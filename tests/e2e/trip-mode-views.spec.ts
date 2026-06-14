import { test, expect } from '@playwright/test';

// playwright.config.ts boots `npm run build && npm run preview` on :4173.
const BASE = 'http://localhost:4173';

async function goToActiveTrip(page: import('@playwright/test').Page) {
	const activeTrip = page.locator('a[href*="/trips/"]').first();
	await activeTrip.click();
	await page.waitForURL('**/trips/**');
	return page.url().split('/trips/')[1].split('/')[0];
}

test.describe('Trip Mode Views', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${BASE}/api/dev/login`);
		await page.waitForURL('**/trips');
	});

	test('Now tab renders a valid state (not the old stub)', async ({ page }) => {
		const slug = await goToActiveTrip(page);
		await page.goto(`${BASE}/trips/${slug}/now`);
		await page.waitForURL('**/now');

		// Should NOT show the old stub text
		await expect(page.getByText('Coming soon')).not.toBeVisible();

		// Should show one of the valid Focus states (find any visible match).
		// "Nothing else planned" joined the matrix with #121's always-on Focus
		// (empty forward list before the 8pm trip-local cutoff).
		await expect(
			page
				.locator(':visible', {
					hasText: /Right now|Free time|Day wrapped|Nothing else planned|No itinerary for today/
				})
				.first()
		).toBeVisible();
	});

	test('Today tab renders with SubTabs', async ({ page }) => {
		const slug = await goToActiveTrip(page);
		await page.goto(`${BASE}/trips/${slug}/today`);
		await page.waitForURL('**/today');

		// SubTabs should be visible
		await expect(
			page.locator(':visible', { hasText: 'Next 3 Days' }).first()
		).toBeVisible();

		// Should show progress or empty state
		await expect(
			page.locator(':visible', { hasText: /done|No itinerary|Nothing scheduled/ }).first()
		).toBeVisible();
	});

	test('Add button opens choice sheet with two options', async ({ page }) => {
		// Use mobile viewport so only BottomNav renders
		await page.setViewportSize({ width: 375, height: 812 });

		await goToActiveTrip(page);

		// The Add button in BottomNav (visible at mobile width)
		await page.locator('.md-desktop\\:hidden button[aria-label="Add"]').click();

		// Bottom sheet should appear with two options
		await expect(page.getByText('Add item to today')).toBeVisible();
		await expect(page.getByText('Add expense')).toBeVisible();

		// Dismiss via close button
		await page.locator('button[aria-label="Close"]').click();
		await expect(page.getByText('Add item to today')).not.toBeVisible();
	});
});
