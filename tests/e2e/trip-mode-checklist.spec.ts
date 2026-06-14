import { test, expect } from '@playwright/test';

// Issue #52 — Trip Mode checklist check-off. A checklist created in Planning is
// checkable from Trip Mode's Today surface (read + check only); the check
// persists back to Planning. No create/rename/assign/delete in Trip Mode.
const BASE = 'http://localhost:4173';

test.describe('Trip Mode checklist check-off (#52)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeEach(async ({ page }) => {
		const email = encodeURIComponent(process.env.E2E_TEST_EMAIL!);
		await page.goto(`${BASE}/api/dev/login?email=${email}`);
		await page.waitForURL(`${BASE}/trips`, { timeout: 10000 });
	});

	test('check a task from Trip Mode; it persists to Planning', async ({ page }) => {
		const stamp = Date.now().toString(36);
		const tripSlug = `e2e-tripmode-${stamp}`;

		// --- Create an active trip (today within range) ---
		// Start 2 days back so the trip is unambiguously active in its OWN timezone.
		// trips/new defaults timezone to the machine zone; a UTC `toISOString()`
		// "today" can be tomorrow locally late-evening in a behind-UTC zone, which
		// isTripActive (correctly, #167) reads as not-yet-started. A 2-day cushion
		// absorbs any tz offset + the UTC day-rollover.
		await page.getByRole('link', { name: 'New Trip' }).click();
		await page.waitForURL(`${BASE}/trips/new`);
		await page.fill('input[name="title"]', `E2E TripMode ${stamp}`);
		const start = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		await page.fill('input[name="start_date"]', start);
		await page.fill('input[name="end_date"]', nextWeek);
		await page.fill('input[name="location_summary"]', 'Test Location');
		await page.getByRole('button', { name: /create|save/i }).click();
		await page.waitForURL(`${BASE}/trips/${tripSlug}`, { timeout: 10000 });

		// --- Create a trip-scoped "Packing" list with a task (Planning) ---
		await page.goto(`${BASE}/trips/${tripSlug}/lists`);
		await page.getByRole('button', { name: 'New list' }).filter({ visible: true }).first().click();
		await page.getByLabel('Name').fill('Packing');
		await page.getByRole('button', { name: /create list/i }).filter({ visible: true }).first().click();
		await page.waitForURL(/\/lists\/[a-z0-9]+$/);
		const listUrl = page.url();
		const addRow = page.getByPlaceholder('Add task').filter({ visible: true }).first();
		await addRow.fill('Tent');
		await addRow.press('Enter');
		await expect(page.getByText('Tent').filter({ visible: true }).first()).toBeVisible();

		// --- Trip Mode (Today): the list shows, check the task ---
		await page.goto(`${BASE}/trips/${tripSlug}/today`);
		await expect(page.getByText('Packing').filter({ visible: true }).first()).toBeVisible();
		await expect(page.getByText('Tent').filter({ visible: true }).first()).toBeVisible();

		// No create/assign affordances in Trip Mode.
		await expect(page.getByPlaceholder('Add task')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Assign or remove task' })).toHaveCount(0);

		await page.getByRole('button', { name: 'Check task' }).filter({ visible: true }).first().click();
		await expect(page.getByRole('button', { name: 'Uncheck task' }).filter({ visible: true }).first()).toBeVisible();

		// --- Persists to Planning ---
		await page.goto(listUrl);
		await expect(page.getByRole('button', { name: 'Uncheck task' }).filter({ visible: true }).first()).toBeVisible();
	});
});
