import { test, expect } from '@playwright/test';

// #268 / ADR-0016 — confirmation codes are now `kind:'code'` Documents, not the
// legacy `items.confirmation_codes` json blob. The inline editor UI is unchanged;
// only persistence moved. This spec proves the read+write cutover end-to-end:
//   create item with 2 codes → both persist + reload on item detail
//   edit (change 1, remove 1, add 1) → docs reconcile (3 codes shown)
//   export the trip → codes present in the archive JSON (documents-sourced)
//
// Same harness as multi-day.spec.ts: dev-login, preview on :4173, isolated PB.

const BASE_URL = 'http://localhost:4173';

test.describe('Confirmation codes → Documents (#268)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeEach(async ({ page }) => {
		const email = encodeURIComponent(process.env.E2E_TEST_EMAIL!);
		await page.goto(`${BASE_URL}/api/dev/login?email=${email}`);
		await page.waitForURL(`${BASE_URL}/trips`, { timeout: 10000 });
	});

	test('codes persist, reconcile on edit, and round-trip through export', async ({ page }) => {
		const stamp = Date.now().toString(36);
		const tripTitle = `E2E Codes ${stamp}`;
		const tripSlug = `e2e-codes-${stamp}`;

		// --- Create a trip ---
		await page.getByRole('link', { name: 'New Trip' }).click();
		await page.waitForURL(`${BASE_URL}/trips/new`);
		const today = new Date().toISOString().split('T')[0];
		const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		await page.fill('input[name="title"]', tripTitle);
		// #270: dates live behind the optional "I know the dates" expander on /trips/new.
		await page.locator('summary', { hasText: 'I know the dates' }).click();
		await page.fill('input[name="start_date"]', today);
		await page.fill('input[name="end_date"]', nextWeek);
		await page.fill('input[name="location_summary"]', 'Test Location');
		await page.getByRole('button', { name: /create|save/i }).click();
		await page.waitForURL(`${BASE_URL}/trips/${tripSlug}`, { timeout: 10000 });

		// --- Add a lodging item with TWO confirmation codes ---
		const dayLinks = page.locator(`a[href^="/trips/${tripSlug}/days/"]:visible`);
		await expect(dayLinks.first()).toBeVisible({ timeout: 5000 });
		await dayLinks.first().click();
		await page.waitForURL(/\/days\//);
		await page.getByRole('link', { name: /^Add item$/i }).first().click();
		await page.waitForURL(/\/items\/new/);

		await page.locator('button:has-text("Lodging"):visible').first().click();
		await page.locator('input[name="title"]:visible').first().fill('Hotel Codes');

		// Two code rows: "+ Add code" appends a label/value pair each time.
		const addCode = page.getByRole('button', { name: '+ Add code' });
		await addCode.click();
		await addCode.click();
		const labels = page.locator('input[name="confirmation_code_label"]:visible');
		const values = page.locator('input[name="confirmation_code_value"]:visible');
		await labels.nth(0).fill('Conf #');
		await values.nth(0).fill('ABC123');
		await labels.nth(1).fill('PIN');
		await values.nth(1).fill('4242');

		await page.locator('button[type="submit"]:visible').first().click();
		// A day-scheduled create redirects to the day view (#169). Wait for the day
		// route specifically — NOT a /trips/{slug} prefix that also matches /items/new.
		await page.waitForURL(/\/days\/[a-z0-9]+/, { timeout: 10000 });

		// --- Open the item detail; both codes render (read-from-documents) ---
		// The day view's TimelineItemCard links to /items/{id}; the "Add item" link is
		// /items/new — exclude it. Both trees duplicate the link, so take the first
		// visible one.
		const itemLink = page
			.locator(`a[href*="/trips/${tripSlug}/items/"]:not([href*="/items/new"]):visible`)
			.first();
		await expect(itemLink).toBeVisible({ timeout: 10000 });
		await itemLink.click();
		await page.waitForURL(/\/items\/[a-z0-9]{15}/, { timeout: 10000 });
		const itemUrl = page.url().split('?')[0];
		const itemId = itemUrl.split('/items/')[1];
		// Dual AppShell tree renders the detail twice — scope assertions to :visible.
		await expect(page.getByText('ABC123').filter({ visible: true }).first()).toBeVisible();
		await expect(page.getByText('4242').filter({ visible: true }).first()).toBeVisible();

		// --- Edit: keep Conf# (ABC123 → ABC999), remove PIN, add a third code ---
		await page.getByRole('link', { name: /^Edit$/i }).first().click();
		await page.waitForURL(/\/edit$/);

		// The edit loader reshapes code Documents back into the form (2 rows).
		const editLabels = page.locator('input[name="confirmation_code_label"]:visible');
		const editValues = page.locator('input[name="confirmation_code_value"]:visible');
		await expect(editValues.nth(0)).toHaveValue('ABC123');
		await expect(editValues.nth(1)).toHaveValue('4242');

		// Change the first value.
		await editValues.nth(0).fill('ABC999');
		// Remove the second (PIN) via its remove button — the 2nd remove control.
		await page.getByRole('button', { name: 'Remove confirmation code' }).nth(1).click();
		// Add a third code.
		await page.getByRole('button', { name: '+ Add code' }).click();
		const editLabels2 = page.locator('input[name="confirmation_code_label"]:visible');
		const editValues2 = page.locator('input[name="confirmation_code_value"]:visible');
		await editLabels2.last().fill('Gate');
		await editValues2.last().fill('G7');
		void editLabels;

		await page.locator('button[type="submit"]:visible').first().click();
		await page.waitForURL(new RegExp(`/items/${itemId}(\\?|$)`), { timeout: 10000 });

		// Reconciled: ABC999 + G7 present (visible tree), the removed 4242 gone.
		await expect(page.getByText('ABC999').filter({ visible: true }).first()).toBeVisible();
		await expect(page.getByText('G7').filter({ visible: true }).first()).toBeVisible();
		await expect(page.getByText('4242').filter({ visible: true })).toHaveCount(0);
		await expect(page.getByText('ABC123').filter({ visible: true })).toHaveCount(0);

		// --- Export the trip JSON; codes are documents-sourced into the export ---
		const res = await page.request.get(`${BASE_URL}/trips/${tripSlug}/export`);
		expect(res.ok()).toBeTruthy();
		const data = await res.json();
		const item = data.items.find((i: { title: string }) => i.title === 'Hotel Codes');
		expect(item).toBeTruthy();
		const exported = (item.confirmation_codes as { label: string; value: string }[]).map(
			(c) => c.value
		);
		expect(exported).toContain('ABC999');
		expect(exported).toContain('G7');
		expect(exported).not.toContain('4242');
	});
});
