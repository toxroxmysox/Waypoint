import { test, expect } from '@playwright/test';

// Issue #49 — Itinerary › Lists sub-tab: trip/phase checklists index + detail.
// Builds its own trip via the UI, then creates a trip-level packing list and
// checks items off. PB (0030 migration) runs separately; preview on :4173.
const BASE = 'http://localhost:4173';

test.describe('Itinerary › Lists (#49)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeEach(async ({ page }) => {
		const email = encodeURIComponent(process.env.E2E_TEST_EMAIL!);
		await page.goto(`${BASE}/api/dev/login?email=${email}`);
		await page.waitForURL(`${BASE}/trips`, { timeout: 10000 });
	});

	test('create a trip-level packing list and check items', async ({ page }) => {
		const stamp = Date.now().toString(36);
		const tripSlug = `e2e-lists-${stamp}`;

		// --- Create a trip ---
		await page.getByRole('link', { name: 'New Trip' }).click();
		await page.waitForURL(`${BASE}/trips/new`);
		await page.fill('input[name="title"]', `E2E Lists ${stamp}`);
		const today = new Date().toISOString().split('T')[0];
		const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		await page.fill('input[name="start_date"]', today);
		await page.fill('input[name="end_date"]', nextWeek);
		await page.fill('input[name="location_summary"]', 'Test Location');
		await page.getByRole('button', { name: /create|save/i }).click();
		await page.waitForURL(`${BASE}/trips/${tripSlug}`, { timeout: 10000 });

		// --- Open the Lists sub-tab ---
		await page.getByRole('link', { name: 'Lists', exact: true }).filter({ visible: true }).first().click();
		await page.waitForURL(`${BASE}/trips/${tripSlug}/lists`);

		// Booking smart list is pinned even with no manual lists yet.
		await expect(page.getByText('Booking').filter({ visible: true }).first()).toBeVisible();
		await expect(page.getByText('No lists yet.').filter({ visible: true }).first()).toBeVisible();

		// --- Create a whole-trip "Packing" list (scope defaults to Whole trip) ---
		await page.getByRole('button', { name: 'New list' }).filter({ visible: true }).first().click();
		await page.getByLabel('Name').fill('Packing');
		await page.getByRole('button', { name: /create list/i }).filter({ visible: true }).first().click();

		// Lands on the new list's detail.
		await page.waitForURL(/\/lists\/[a-z0-9]+$/);
		await expect(page.getByRole('heading', { name: 'Packing' }).filter({ visible: true }).first()).toBeVisible();

		// --- Add two tasks via the ledger add-row, check one off ---
		const addRow = page.getByPlaceholder('Add task').filter({ visible: true }).first();
		await addRow.fill('Passports');
		await addRow.press('Enter');
		await expect(page.getByText('Passports').filter({ visible: true }).first()).toBeVisible();

		await addRow.fill('Sunscreen');
		await addRow.press('Enter');
		await expect(page.getByText('Sunscreen').filter({ visible: true }).first()).toBeVisible();

		await page.getByRole('button', { name: 'Check task' }).filter({ visible: true }).first().click();
		await expect(page.getByRole('button', { name: 'Uncheck task' }).filter({ visible: true }).first()).toBeVisible();

		// Hide-done removes the checked row from view.
		await page.getByRole('button', { name: 'Hide done' }).filter({ visible: true }).first().click();
		await expect(page.getByRole('button', { name: 'Uncheck task' })).toHaveCount(0);

		// --- Back on the index (NavBar back), the list shows with its progress ---
		await page.goto(`${BASE}/trips/${tripSlug}/lists`);
		await expect(page.getByText('Packing').filter({ visible: true }).first()).toBeVisible();
		await expect(page.getByText('Whole trip').filter({ visible: true }).first()).toBeVisible();
	});
});
