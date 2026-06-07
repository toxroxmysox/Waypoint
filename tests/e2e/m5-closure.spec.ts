import { test, expect } from '@playwright/test';

// playwright.config.ts boots `npm run build && npm run preview` on :4173.
const BASE = 'http://localhost:4173';

// E2E_TEST_EMAIL's first trip is active → loads in trip mode (no "More" tab).
// Secondary pages are surfaced on the /more page (planning mode) or reached by
// direct route; navigate by URL to stay mode- and viewport-independent.
async function openTripSlug(page: import('@playwright/test').Page): Promise<string> {
	await page.goto(`${BASE}/trips`);
	await page.locator('a[href*="/trips/"]').first().click();
	await page.waitForURL('**/trips/**');
	return page.url().split('/trips/')[1].split(/[/?#]/)[0];
}

test.describe('M5 Closure', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${BASE}/api/dev/login`);
		await page.waitForURL('**/trips');
	});

	test('closeout wizard link visible on More page for owner', async ({ page }) => {
		const slug = await openTripSlug(page);
		await page.goto(`${BASE}/trips/${slug}/more`);
		await expect(page.getByText('Closeout').filter({ visible: true }).first()).toBeVisible();
	});

	test('closeout wizard renders day cards', async ({ page }) => {
		const slug = await openTripSlug(page);
		await page.goto(`${BASE}/trips/${slug}/closeout`);
		await page.waitForURL('**/closeout');

		const progress = page.getByText(/Day \d+ of \d+/).filter({ visible: true }).first();
		await expect(progress).toBeVisible({ timeout: 5000 });
	});

	test('archive settings section in trip settings', async ({ page }) => {
		const slug = await openTripSlug(page);
		await page.goto(`${BASE}/trips/${slug}/settings`);
		await page.waitForURL('**/settings');

		// Section heading is "Public Archive" — substring match on "Archive".
		await expect(page.getByText('Archive').filter({ visible: true }).first()).toBeVisible();
	});

	test('export link on More page triggers download', async ({ page }) => {
		const slug = await openTripSlug(page);
		await page.goto(`${BASE}/trips/${slug}/more`);
		await expect(page.getByText('Export').filter({ visible: true }).first()).toBeVisible();
	});

	test('import page renders with file input', async ({ page }) => {
		// /trips/import is single-tree.
		await page.goto(`${BASE}/trips/import`);
		const fileInput = page.locator('input[type="file"]');
		await expect(fileInput).toBeAttached();
	});

	// The public archive route superuser-auths via PB_ADMIN_EMAIL/PASSWORD (see
	// .env.example). Without those creds it 500s on any load, so guard like the
	// other admin-dependent tests rather than asserting 404.
	test('public archive 404s for non-existent token', async ({ page }) => {
		test.skip(
			!process.env.PB_ADMIN_EMAIL,
			'Set PB_ADMIN_EMAIL + PB_ADMIN_PASSWORD to exercise the public archive route'
		);
		const response = await page.goto(`${BASE}/archive/nonexistent-token-12345`);
		expect(response?.status()).toBe(404);
	});
});
