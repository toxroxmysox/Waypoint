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
		// #240: closeout is lifecycle-gated to wrap-up/closed. The shared first trip is
		// active (loads in trip mode) → an active trip is now redirected OFF /closeout,
		// so create a dedicated past-dated (wrap-up) trip to reach the wizard.
		const stamp = Date.now().toString(36);
		const slug = `e2e-m5-closeout-${stamp}`;
		await page.getByRole('link', { name: 'New Trip' }).click();
		await page.waitForURL(`${BASE}/trips/new`);
		await page.fill('input[name="title"]', `E2E M5 Closeout ${stamp}`);
		const start = new Date(Date.now() - 37 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		const end = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		// #270: dates live behind the optional "I know the dates" expander on /trips/new.
		await page.locator('summary', { hasText: 'I know the dates' }).click();
		await page.fill('input[name="start_date"]', start);
		await page.fill('input[name="end_date"]', end);
		await page.fill('input[name="location_summary"]', 'Test Location');
		await page.getByRole('button', { name: /create|save/i }).click();
		await page.waitForURL(`${BASE}/trips/${slug}`, { timeout: 10000 });

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
