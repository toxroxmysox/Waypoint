import { test, expect } from '@playwright/test';

// playwright.config.ts boots `npm run build && npm run preview` on :4173.
const BASE = 'http://localhost:4173';

async function goToActiveTrip(page: import('@playwright/test').Page) {
	const activeTrip = page.locator('a[href*="/trips/"]').first();
	await activeTrip.click();
	await page.waitForURL('**/trips/**');
	return page.url().split('/trips/')[1].split('/')[0];
}

test.describe('Trip Mode Views (#244 merged Now)', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${BASE}/api/dev/login`);
		await page.waitForURL('**/trips');
	});

	test('Now tab renders a valid weighted state (not the old stub)', async ({ page }) => {
		const slug = await goToActiveTrip(page);
		await page.goto(`${BASE}/trips/${slug}/now`);
		await page.waitForURL('**/now');

		// Should NOT show the old stub text (visible-scoped — dual AppShell trees).
		await expect(page.getByText('Coming soon').filter({ visible: true })).toHaveCount(0);

		// One of the valid Focus states is visible.
		await expect(
			page
				.locator(':visible', {
					hasText: /Right now|Free time|Day wrapped|Nothing else planned|No itinerary for today/
				})
				.first()
		).toBeVisible();
	});

	test('Now owns the Today / Next 3 Days sub-tabs', async ({ page }) => {
		const slug = await goToActiveTrip(page);
		await page.goto(`${BASE}/trips/${slug}/now`);
		await page.waitForURL('**/now');

		// The merged Now carries the sub-tabs (Today is the default view here).
		await expect(page.locator(':visible', { hasText: 'Next 3 Days' }).first()).toBeVisible();
		await expect(page.getByRole('link', { name: 'Today' }).filter({ visible: true }).first()).toBeVisible();
	});

	test('/today redirects to the merged /now', async ({ page }) => {
		const slug = await goToActiveTrip(page);
		await page.goto(`${BASE}/trips/${slug}/today`);
		await page.waitForURL(`**/trips/${slug}/now`);
		expect(page.url()).toContain(`/trips/${slug}/now`);
	});

	test('Next 3 Days sub-tab still lives at /today/upcoming', async ({ page }) => {
		const slug = await goToActiveTrip(page);
		await page.goto(`${BASE}/trips/${slug}/today/upcoming`);
		await page.waitForURL('**/today/upcoming');
		await expect(page.locator(':visible', { hasText: 'Next 3 Days' }).first()).toBeVisible();
	});

	test('Trip nav = Now · Money · Add · Docs; no 5th-tab overflow at 375px', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		const slug = await goToActiveTrip(page);
		await page.goto(`${BASE}/trips/${slug}/now`);
		await page.waitForURL('**/now');

		// The mobile BottomNav is the visible nav at 375px (last :visible <nav>).
		const bottomNav = page.locator('nav:visible').last();
		await expect(bottomNav.getByText('Now')).toBeVisible();
		await expect(bottomNav.getByText('Money')).toBeVisible();
		await expect(bottomNav.getByText('Docs')).toBeVisible();
		await expect(bottomNav.getByRole('button', { name: 'Add' })).toBeVisible();
		// Today is no longer a top-level trip tab (it merged into Now).
		await expect(bottomNav.getByText('Today', { exact: true })).toHaveCount(0);
		// Exactly four tab slots (3 links + the Add button) — no overflow.
		await expect(bottomNav.locator(':scope > a, :scope > button')).toHaveCount(4);
	});

	test('Money tab navigates to the /money glance', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		const slug = await goToActiveTrip(page);
		await page.goto(`${BASE}/trips/${slug}/now`);
		await page.waitForURL('**/now');

		await page.locator('nav:visible').last().getByText('Money').click();
		await page.waitForURL(`**/trips/${slug}/money`);
		expect(page.url()).toContain(`/trips/${slug}/money`);
	});

	test('Add button opens the choice sheet', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		const slug = await goToActiveTrip(page);
		await page.goto(`${BASE}/trips/${slug}/now`);
		await page.waitForURL('**/now');

		await page.locator('.md-desktop\\:hidden button[aria-label="Add"]').click();
		await expect(page.getByText('Add item to today')).toBeVisible();
		await expect(page.getByText('Add expense')).toBeVisible();

		await page.locator('button[aria-label="Close"]').click();
		await expect(page.getByText('Add item to today')).not.toBeVisible();
	});
});
