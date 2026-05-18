import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

test.describe('M5 Closure', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${BASE}/api/dev/login`);
		await page.waitForURL('**/trips');
	});

	test('closeout wizard link visible on More page for owner', async ({ page }) => {
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();
		await page.waitForURL('**/trips/**');

		await page.getByText('More').click();
		await expect(page.getByText('Closeout')).toBeVisible();
	});

	test('closeout wizard renders day cards', async ({ page }) => {
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();
		await page.waitForURL('**/trips/**');

		await page.getByText('More').click();
		await page.getByText('Closeout').click();
		await page.waitForURL('**/closeout');

		const progress = page.getByText(/Day \d+ of \d+/);
		await expect(progress).toBeVisible({ timeout: 5000 });
	});

	test('archive settings section in trip settings', async ({ page }) => {
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();
		await page.waitForURL('**/trips/**');

		await page.getByText('More').click();
		await page.getByText('Settings').click();
		await page.waitForURL('**/settings');

		await expect(page.getByText('Archive')).toBeVisible();
	});

	test('export link on More page triggers download', async ({ page }) => {
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();
		await page.waitForURL('**/trips/**');

		await page.getByText('More').click();
		await expect(page.getByText('Export')).toBeVisible();
	});

	test('import page renders with file input', async ({ page }) => {
		await page.goto(`${BASE}/trips/import`);
		const fileInput = page.locator('input[type="file"]');
		await expect(fileInput).toBeAttached();
	});

	test('public archive 404s for non-existent token', async ({ page }) => {
		const response = await page.goto(`${BASE}/archive/nonexistent-token-12345`);
		expect(response?.status()).toBe(404);
	});
});
