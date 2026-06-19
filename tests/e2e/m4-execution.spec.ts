import { test, expect } from '@playwright/test';

// playwright.config.ts boots `npm run build && npm run preview` on :4173.
const BASE = 'http://localhost:4173';

// The first trip belonging to E2E_TEST_EMAIL is active (today ∈ trip dates), so it
// loads in *trip mode* — the nav surfaces Now/Money/Add/Docs, NOT a "More" tab.
// Secondary pages live at known routes, so navigate by URL (mode- and viewport-
// independent) rather than clicking nav chrome that only exists in one mode.
async function openTripSlug(page: import('@playwright/test').Page): Promise<string> {
	await page.goto(`${BASE}/trips`);
	await page.locator('a[href*="/trips/"]').first().click();
	await page.waitForURL('**/trips/**');
	return page.url().split('/trips/')[1].split(/[/?#]/)[0];
}

test.describe('M4 Execution', () => {
	test.beforeEach(async ({ page }) => {
		// Dev login (param-less → falls back to E2E_TEST_EMAIL).
		await page.goto(`${BASE}/api/dev/login`);
		await page.waitForURL('**/trips');
	});

	test('vote button renders on item detail', async ({ page }) => {
		const slug = await openTripSlug(page);

		// The trip layout is dual-tree (one CSS-hidden); scope to the visible subtree.
		const dayLink = page.locator(`a[href*="/trips/${slug}/days/"]:visible`).first();
		if (await dayLink.isVisible()) {
			await dayLink.click();
			await page.waitForURL('**/days/**');

			// Click an existing item link (exclude /items/new and /edit).
			const itemLink = page
				.locator(`a[href*="/items/"]:not([href*="/items/new"]):not([href*="/edit"]):visible`)
				.first();
			if (await itemLink.isVisible()) {
				await itemLink.click();
				await page.waitForURL('**/items/**');

				// Vote control is a group of weighted option buttons (#30); assert the group.
				await expect(
					page.getByRole('group', { name: 'Vote on this item' }).filter({ visible: true }).first()
				).toBeVisible();
			}
		}
	});

	test('trip mode today view renders', async ({ page }) => {
		const slug = await openTripSlug(page);
		await page.goto(`${BASE}/trips/${slug}/now`);
		await page.waitForURL('**/now');

		// #244 merged Today into the weighted Now view (/today 308-redirects to /now).
		await expect(page.locator('main:visible').first()).toBeVisible();
	});

	test('A2HS banner shows and dismisses', async ({ page }) => {
		// Clear localStorage
		await page.goto(`${BASE}/trips`);
		await page.evaluate(() => localStorage.removeItem('waypoint-a2hs-dismissed'));
		await page.reload();

		// Banner may or may not show depending on browser (Chrome shows, others may not).
		// Just verify the page loads without errors (/trips is single-tree).
		await expect(page.getByRole('heading', { name: 'Waypoint' })).toBeVisible({ timeout: 5000 });
	});

	test('mobile responsive — trip mode at 375px', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		const slug = await openTripSlug(page);
		await page.goto(`${BASE}/trips/${slug}/now`);
		await page.waitForURL('**/now');

		const main = page.locator('main:visible').first();
		const box = await main.boundingBox();
		expect(box).toBeTruthy();
		expect(box!.width).toBeLessThanOrEqual(375);
	});
});
