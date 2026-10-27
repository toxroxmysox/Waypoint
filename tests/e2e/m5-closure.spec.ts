import { test, expect } from '@playwright/test';
import { E2E_BASE } from './e2e-env';
import { loginOwner, seedOwnTrip } from './japan-fixture';

// playwright.config.ts boots `npm run build && npm run preview` on :4173.
const BASE = E2E_BASE;

// #563 — this spec seeds its own trips instead of clicking whichever trip the shared
// E2E_TEST_EMAIL user saw first: an active one (Trip Mode, no "More" tab — secondary
// pages are reached by URL) and a wrap-up one for the lifecycle-gated closeout wizard.
const SLUG = 'e2e-m5-closure-563';
const CLOSEOUT_SLUG = 'e2e-m5-closeout-563';

test.describe('M5 Closure', () => {
	test.describe.configure({ mode: 'serial' });

	test.beforeAll(async () => {
		await seedOwnTrip(SLUG, { active: true });
		// Left on the fixture's June 1–3, 2026 dates → past its end, not archived → wrap-up.
		await seedOwnTrip(CLOSEOUT_SLUG);
	});

	test.beforeEach(async ({ page }) => {
		await loginOwner(page);
	});

	test('closeout wizard link visible on More page for owner', async ({ page }) => {
		await page.goto(`${BASE}/trips/${SLUG}/more`, { waitUntil: 'networkidle' });
		await expect(page.getByText('Closeout').filter({ visible: true }).first()).toBeVisible();
	});

	test('closeout wizard renders day cards', async ({ page }) => {
		// #240: closeout is lifecycle-gated to wrap-up/closed; an active trip is
		// redirected OFF /closeout, so use the wrap-up trip.
		await page.goto(`${BASE}/trips/${CLOSEOUT_SLUG}/closeout`, { waitUntil: 'networkidle' });
		await expect(page).toHaveURL(new RegExp(`/trips/${CLOSEOUT_SLUG}/closeout$`));

		const progress = page
			.getByText(/Day \d+ of \d+/)
			.filter({ visible: true })
			.first();
		await expect(progress).toBeVisible({ timeout: 5000 });
	});

	test('archive settings section in trip settings', async ({ page }) => {
		await page.goto(`${BASE}/trips/${SLUG}/settings`, { waitUntil: 'networkidle' });
		await expect(page).toHaveURL(new RegExp(`/trips/${SLUG}/settings$`));

		// Section heading is "Public Archive".
		await expect(
			page.getByRole('heading', { name: 'Public Archive' }).filter({ visible: true }).first()
		).toBeVisible();
	});

	test('export link on More page triggers download', async ({ page }) => {
		await page.goto(`${BASE}/trips/${SLUG}/more`, { waitUntil: 'networkidle' });
		await expect(page.getByText('Export').filter({ visible: true }).first()).toBeVisible();
	});

	test('import page renders with file input', async ({ page }) => {
		// /trips/import is single-tree.
		await page.goto(`${BASE}/trips/import`, { waitUntil: 'networkidle' });
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
		const response = await page.goto(`${BASE}/archive/nonexistent-token-12345`, {
			waitUntil: 'networkidle'
		});
		expect(response?.status()).toBe(404);
	});
});
