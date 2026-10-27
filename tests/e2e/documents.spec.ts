import { test, expect } from '@playwright/test';
import { E2E_BASE } from './e2e-env';
import { loginOwner, seedOwnTrip } from './japan-fixture';

// playwright.config.ts boots `npm run build && npm run preview` on :4173.
const BASE = E2E_BASE;

// Documents (#70/#71). #563 — this spec seeds its own active trip (Trip Mode: the
// bottom nav surfaces Now/Money/Add/Docs, #244), whose one whole-trip document
// (fixture.png) the rules-fixture seeds, instead of
// clicking whichever trip the shared E2E_TEST_EMAIL user saw first. Secondary
// pages live at known routes, so navigate by URL.
const SLUG = 'e2e-documents-563';

test.describe('Documents', () => {
	test.describe.configure({ mode: 'serial' });

	test.beforeAll(async () => {
		await seedOwnTrip(SLUG, { active: true });
	});

	test.beforeEach(async ({ page }) => {
		await loginOwner(page);
	});

	test('Documents tab links to the aggregate from the nav', async ({ page }) => {
		await page.goto(`${BASE}/trips/${SLUG}`, { waitUntil: 'networkidle' });
		// The Documents tab is present in the nav (both modes use the vacated Vault
		// slot). Scope to the visible subtree (the layout is dual-tree).
		const docLink = page.locator(`a[href$="/trips/${SLUG}/documents"]:visible`).first();
		await expect(docLink).toBeVisible();
		await docLink.click();
		await page.waitForURL('**/documents');
		await expect(
			page.getByRole('heading', { name: 'Documents' }).filter({ visible: true }).first()
		).toBeVisible();
	});

	test('aggregate groups the seeded document under Whole trip', async ({ page }) => {
		await page.goto(`${BASE}/trips/${SLUG}/documents`, { waitUntil: 'networkidle' });
		const main = page.locator('main:visible').first();
		await expect(main.getByRole('heading', { name: 'Whole trip' })).toBeVisible();
		await expect(main.getByText('fixture.png', { exact: true })).toBeVisible();
		await expect(main.getByRole('button', { name: 'Document actions' })).toHaveCount(1);
	});

	test('mobile responsive — documents at 375px', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto(`${BASE}/trips/${SLUG}/documents`, { waitUntil: 'networkidle' });
		await expect(page).toHaveURL(new RegExp(`/trips/${SLUG}/documents$`));

		const main = page.locator('main:visible').first();
		const box = await main.boundingBox();
		expect(box).toBeTruthy();
		expect(box!.width).toBeLessThanOrEqual(375);
	});
});
