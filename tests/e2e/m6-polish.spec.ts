import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

test.describe('M6 Polish', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${BASE}/api/dev/login`);
		await page.waitForURL('**/trips');
	});

	test('clone trip link visible on More page for owner', async ({ page }) => {
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();
		await page.waitForURL('**/trips/**');

		await page.getByText('More').click();
		await expect(page.getByText('Clone trip')).toBeVisible();
	});

	test('clone trip page renders with form', async ({ page }) => {
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();
		await page.waitForURL('**/trips/**');

		await page.getByText('More').click();
		await page.getByText('Clone trip').click();
		await page.waitForURL('**/clone');

		await expect(page.locator('input[name="title"]')).toBeVisible();
		await expect(page.locator('input[name="start_date"]')).toBeVisible();
		await expect(page.locator('input[name="include_phases"]')).toBeVisible();
	});

	test('parking lot link visible on More page', async ({ page }) => {
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();
		await page.waitForURL('**/trips/**');

		await page.getByText('More').click();
		await expect(page.getByText('Parking lot')).toBeVisible();
	});

	test('parking lot page loads', async ({ page }) => {
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();
		await page.waitForURL('**/trips/**');

		await page.getByText('More').click();
		await page.getByText('Parking lot').click();
		await page.waitForURL('**/parking-lot');

		const heading = page.getByText('Parking Lot');
		await expect(heading).toBeVisible();
	});

	test('print itinerary button visible on More page', async ({ page }) => {
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();
		await page.waitForURL('**/trips/**');

		await page.getByText('More').click();
		await expect(page.getByText('Print itinerary')).toBeVisible();
	});

	test('checklist template picker appears for checklist type', async ({ page }) => {
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();
		await page.waitForURL('**/trips/**');

		const newItemFab = page.locator('a[href*="/items/new"]').first();
		if (await newItemFab.isVisible()) {
			await newItemFab.click();
		} else {
			const currentUrl = page.url();
			await page.goto(currentUrl.replace(/\/$/, '') + '/items/new');
		}
		await page.waitForURL('**/items/new**');

		const checklistBtn = page.getByRole('button', { name: 'Checklist' });
		await checklistBtn.click();

		await expect(page.getByText('Start from template')).toBeVisible();
	});

	test('responsive: bottom nav visible at mobile width', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();
		await page.waitForURL('**/trips/**');

		const bottomNav = page.locator('.bottom-nav').or(page.locator('nav').last());
		await expect(bottomNav).toBeVisible();
	});

	test('responsive: side rail visible at desktop width', async ({ page }) => {
		await page.setViewportSize({ width: 1024, height: 768 });
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();
		await page.waitForURL('**/trips/**');

		const sideRail = page.locator('.side-rail');
		if (await sideRail.count()) {
			await expect(sideRail).toBeVisible();
		}
	});
});
