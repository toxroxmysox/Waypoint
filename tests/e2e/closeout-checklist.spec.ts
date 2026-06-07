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

		await page.getByText('Campsite').filter({ visible: true }).first().click();
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
});
