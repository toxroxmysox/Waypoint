import { test, expect } from '@playwright/test';

// Issue #50 — Booking Smart List. A lodging item (requires_booking default true)
// on a day is planned + unbooked, so it projects into the smart list. Checking
// the row writes booked=true to the Item and it leaves the projection.
const BASE = 'http://localhost:4173';

test.describe('Booking Smart List (#50)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeEach(async ({ page }) => {
		const email = encodeURIComponent(process.env.E2E_TEST_EMAIL!);
		await page.goto(`${BASE}/api/dev/login?email=${email}`);
		await page.waitForURL(`${BASE}/trips`, { timeout: 10000 });
	});

	test('a planned lodging item projects into Booking and checking marks it booked', async ({ page }) => {
		const stamp = Date.now().toString(36);
		const tripSlug = `e2e-booking-${stamp}`;

		// --- Create a trip ---
		await page.getByRole('link', { name: 'New Trip' }).click();
		await page.waitForURL(`${BASE}/trips/new`);
		await page.fill('input[name="title"]', `E2E Booking ${stamp}`);
		const today = new Date().toISOString().split('T')[0];
		const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		// #270: dates live behind the optional "I know the dates" expander on /trips/new.
		await page.locator('summary', { hasText: 'I know the dates' }).click();
		await page.fill('input[name="start_date"]', today);
		await page.fill('input[name="end_date"]', nextWeek);
		await page.fill('input[name="location_summary"]', 'Test Location');
		await page.getByRole('button', { name: /create|save/i }).click();
		await page.waitForURL(`${BASE}/trips/${tripSlug}`, { timeout: 10000 });

		// --- Add a lodging item on the first day (planned + requires_booking) ---
		const dayLinks = page.locator(`a[href^="/trips/${tripSlug}/days/"]:visible`);
		await expect(dayLinks.first()).toBeVisible({ timeout: 5000 });
		await dayLinks.first().click();
		await page.getByRole('link', { name: /^Add item$/i }).filter({ visible: true }).first().click();
		await page.waitForURL(/\/items\/new/);

		await page.getByRole('button', { name: 'Lodging', exact: true }).filter({ visible: true }).first().click();
		await page.locator('input[name="title"]:visible').first().fill('Grand Hotel');
		await page.getByRole('button', { name: /create|save/i }).filter({ visible: true }).first().click();
		await page.waitForURL(/\/days\//, { timeout: 10000 });

		// --- Booking smart list shows the unbooked lodging row ---
		await page.goto(`${BASE}/trips/${tripSlug}/lists/booking`);
		await expect(page.getByText('Grand Hotel').filter({ visible: true }).first()).toBeVisible();
		await expect(page.getByText('A lens over your itinerary.').filter({ visible: true }).first()).toBeVisible();

		// --- Check the row → item booked, row leaves the projection ---
		await page.getByRole('button', { name: 'Mark booked' }).filter({ visible: true }).first().click();
		await expect(page.getByText('Grand Hotel')).toHaveCount(0, { timeout: 5000 });
		await expect(page.getByText('All booked. Nothing left to reserve.').filter({ visible: true }).first()).toBeVisible();

		// --- The source item is now booked (pill on its detail) ---
		await page.goto(`${BASE}/trips/${tripSlug}/lists`);
		await expect(page.getByText('0 left').filter({ visible: true }).first()).toBeVisible();
	});
});
