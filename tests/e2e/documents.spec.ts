import { test, expect } from '@playwright/test';

// playwright.config.ts boots `npm run build && npm run preview` on :4173.
const BASE = 'http://localhost:4173';

// Documents (#70/#71). The first E2E trip is active → it loads in trip mode, so
// the bottom nav surfaces Now/Today/Add/Docs. Secondary pages live at known
// routes, so navigate by URL (mode- and viewport-independent).
async function openTripSlug(page: import('@playwright/test').Page): Promise<string> {
	await page.goto(`${BASE}/trips`);
	await page.locator('a[href*="/trips/"]').first().click();
	await page.waitForURL('**/trips/**');
	return page.url().split('/trips/')[1].split(/[/?#]/)[0];
}

test.describe('Documents', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${BASE}/api/dev/login`);
		await page.waitForURL('**/trips');
	});

	test('Documents tab links to the aggregate from the nav', async ({ page }) => {
		const slug = await openTripSlug(page);
		// The Documents tab is present in the nav (both modes use the vacated Vault
		// slot). Scope to the visible subtree (the layout is dual-tree).
		const docLink = page.locator(`a[href$="/trips/${slug}/documents"]:visible`).first();
		await expect(docLink).toBeVisible();
		await docLink.click();
		await page.waitForURL('**/documents');
		await expect(
			page.getByRole('heading', { name: 'Documents' }).filter({ visible: true }).first()
		).toBeVisible();
	});

	test('aggregate renders an empty state or grouped rows', async ({ page }) => {
		const slug = await openTripSlug(page);
		await page.goto(`${BASE}/trips/${slug}/documents`);
		await page.waitForURL('**/documents');

		// Either the empty state copy or at least one document row's action menu.
		const empty = page.getByText('No documents yet.').filter({ visible: true });
		const actions = page.getByRole('button', { name: 'Document actions' }).filter({ visible: true });
		await expect(empty.or(actions.first())).toBeVisible();
	});

	test('mobile responsive — documents at 375px', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		const slug = await openTripSlug(page);
		await page.goto(`${BASE}/trips/${slug}/documents`);
		await page.waitForURL('**/documents');

		const main = page.locator('main:visible').first();
		const box = await main.boundingBox();
		expect(box).toBeTruthy();
		expect(box!.width).toBeLessThanOrEqual(375);
	});
});
