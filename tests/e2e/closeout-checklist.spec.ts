import { test, expect } from '@playwright/test';

// Issue #53 (AC3) — Closeout reviews the parent Item (status → done) but leaves
// its Checklist untouched. An item with an inline checklist is marked done via
// Closeout; the checklist + its task survive unchanged.
const BASE = 'http://localhost:4173';

test.describe('Closeout leaves checklists untouched (#53)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeEach(async ({ page }) => {
		const email = encodeURIComponent(process.env.E2E_TEST_EMAIL!);
		await page.goto(`${BASE}/api/dev/login?email=${email}`);
		await page.waitForURL(`${BASE}/trips`, { timeout: 10000 });
	});

	test('marking an item done in Closeout keeps its checklist', async ({ page }) => {
		const stamp = Date.now().toString(36);
		const tripSlug = `e2e-closeout-${stamp}`;

		await page.getByRole('link', { name: 'New Trip' }).click();
		await page.waitForURL(`${BASE}/trips/new`);
		await page.fill('input[name="title"]', `E2E Closeout ${stamp}`);
		const today = new Date().toISOString().split('T')[0];
		const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		await page.fill('input[name="start_date"]', today);
		await page.fill('input[name="end_date"]', nextWeek);
		await page.fill('input[name="location_summary"]', 'Test Location');
		await page.getByRole('button', { name: /create|save/i }).click();
		await page.waitForURL(`${BASE}/trips/${tripSlug}`, { timeout: 10000 });

		// --- Add an item with an inline checklist + task ---
		const dayLinks = page.locator(`a[href^="/trips/${tripSlug}/days/"]:visible`);
		await expect(dayLinks.first()).toBeVisible({ timeout: 5000 });
		await dayLinks.first().click();
		await page.getByRole('link', { name: /^Add item$/i }).filter({ visible: true }).first().click();
		await page.waitForURL(/\/items\/new/);
		await page.locator('input[name="title"]:visible').first().fill('Campsite');
		await page.getByRole('button', { name: /create|save/i }).filter({ visible: true }).first().click();
		await page.waitForURL(/\/days\//, { timeout: 10000 });

		// #231: the card is a stretched-link <a aria-label="<title>"> overlaying the
		// content, so getByText(...).click() is intercepted by the anchor. Target the link.
		await page.getByRole('link', { name: 'Campsite' }).filter({ visible: true }).first().click();
		await page.waitForURL(/\/items\/[a-z0-9]+$/);
		const itemUrl = page.url();
		await page.getByRole('button', { name: 'Add checklist' }).filter({ visible: true }).first().click();
		const addRow = page.getByPlaceholder('Add an item').filter({ visible: true }).first();
		await addRow.fill('Tent');
		await addRow.press('Enter');
		await expect(page.getByText('Tent').filter({ visible: true }).first()).toBeVisible();

		// --- Closeout: mark the item done (reviews the Item) ---
		await page.goto(`${BASE}/trips/${tripSlug}/closeout`);
		await page.getByRole('button', { name: 'Done', exact: true }).first().click();
		await expect(page.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0, { timeout: 5000 });

		// --- Item is reviewed (Done) but its checklist + task survive ---
		await page.goto(itemUrl);
		await expect(page.getByText('Done').filter({ visible: true }).first()).toBeVisible();
		await expect(page.getByText('Tent').filter({ visible: true }).first()).toBeVisible();
	});

	// Issue #257 — "All done" must NOT snap the wizard back to the first day.
	// The bulk-mark used window.location.reload(), which reset the page-level
	// currentDayIndex ($state(0)) on remount → user jumped to Day 1. Fixed by
	// re-running load() via the enhance update() helper (no full reload).
	test('"All done" keeps you on the same day (#257)', async ({ page }) => {
		const stamp = Date.now().toString(36);
		const tripSlug = `e2e-closeout-alldone-${stamp}`;

		// Multi-day trip so we can navigate to Day 2 and prove we stay there.
		await page.getByRole('link', { name: 'New Trip' }).click();
		await page.waitForURL(`${BASE}/trips/new`);
		await page.fill('input[name="title"]', `E2E Closeout AllDone ${stamp}`);
		const today = new Date().toISOString().split('T')[0];
		const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		await page.fill('input[name="start_date"]', today);
		await page.fill('input[name="end_date"]', nextWeek);
		await page.fill('input[name="location_summary"]', 'Test Location');
		await page.getByRole('button', { name: /create|save/i }).click();
		await page.waitForURL(`${BASE}/trips/${tripSlug}`, { timeout: 10000 });

		// Add an item to Day 2 so its card has something to mark "All done".
		const dayLinks = page.locator(`a[href^="/trips/${tripSlug}/days/"]:visible`);
		await expect(dayLinks.nth(1)).toBeVisible({ timeout: 5000 });
		await dayLinks.nth(1).click();
		await page.getByRole('link', { name: /^Add item$/i }).filter({ visible: true }).first().click();
		await page.waitForURL(/\/items\/new/);
		await page.locator('input[name="title"]:visible').first().fill('Hot Springs');
		await page.getByRole('button', { name: /create|save/i }).filter({ visible: true }).first().click();
		await page.waitForURL(/\/days\//, { timeout: 10000 });

		// Closeout: advance to Day 2, then click "All done".
		await page.goto(`${BASE}/trips/${tripSlug}/closeout`);
		await expect(page.getByText('Day 1 of', { exact: false }).filter({ visible: true }).first()).toBeVisible();
		await page.getByRole('button', { name: 'Next Day' }).filter({ visible: true }).first().click();
		await expect(page.getByText('Day 2 of', { exact: false }).filter({ visible: true }).first()).toBeVisible();

		await page.getByRole('button', { name: 'All done', exact: true }).filter({ visible: true }).first().click();

		// The bug: this would snap back to "Day 1 of N". The fix keeps us on Day 2,
		// and the day's items now read Done.
		await expect(page.getByText('Day 2 of', { exact: false }).filter({ visible: true }).first()).toBeVisible({ timeout: 5000 });
		// Dual AppShell trees instantiate +page.svelte twice with independent
		// currentDayIndex $state — the hidden tree still shows "Day 1 of", so scope
		// the negative assertion to the visible tree (#257).
		await expect(page.getByText('Day 1 of', { exact: false }).filter({ visible: true })).toHaveCount(0);
		await expect(page.getByText('Done').filter({ visible: true }).first()).toBeVisible();
	});
});
