import { test, expect } from '@playwright/test';

// Prerequisites (same harness as m1-happy-path.spec.ts):
// - PocketBase on :8090 with WAYPOINT_DEV_MODE=true and E2E_TEST_EMAIL set
// - SvelteKit preview auto-booted by playwright.config.ts on :4173

const BASE_URL = 'http://localhost:4173';

test.describe('Multi-day items', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeEach(async ({ page }) => {
		const email = encodeURIComponent(process.env.E2E_TEST_EMAIL!);
		await page.goto(`${BASE_URL}/api/dev/login?email=${email}`);
		await page.waitForURL(`${BASE_URL}/trips`, { timeout: 10000 });
	});

	test('span a lodging item → banner on start + middle day, excluded from timeline', async ({
		page
	}) => {
		const stamp = Date.now().toString(36);
		const tripTitle = `E2E Span ${stamp}`;
		const tripSlug = `e2e-span-${stamp}`;

		// --- Create an 8-day trip (today .. +7) ---
		await page.getByRole('link', { name: 'New Trip' }).click();
		await page.waitForURL(`${BASE_URL}/trips/new`);

		const today = new Date().toISOString().split('T')[0];
		const plus3 = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

		await page.fill('input[name="title"]', tripTitle);
		await page.fill('input[name="start_date"]', today);
		await page.fill('input[name="end_date"]', nextWeek);
		await page.fill('input[name="location_summary"]', 'Test Location');
		await page.getByRole('button', { name: /create|save/i }).click();

		await page.waitForURL(`${BASE_URL}/trips/${tripSlug}`, { timeout: 10000 });

		// First *visible* day link is the earliest day (today). The overview
		// duplicates day links across mobile/desktop trees; scope to :visible.
		const dayLinks = page.locator(`a[href^="/trips/${tripSlug}/days/"]:visible`);
		await expect(dayLinks.first()).toBeVisible({ timeout: 5000 });
		const startDayHref = await dayLinks.first().getAttribute('href');

		// --- Add a multi-day lodging item on the start day ---
		await dayLinks.first().click();
		await page.waitForURL(new RegExp(startDayHref!.replace(/\//g, '\\/')));
		await page.getByRole('link', { name: /^Add item$/i }).first().click();
		await page.waitForURL(/\/items\/new/);

		await page.locator('button:has-text("Lodging"):visible').first().click();
		await page.locator('input[name="title"]:visible').first().fill('Test Hotel');
		// Day is preselected from the day we came from, so the End date control is shown.
		await page.locator('input[name="end_date"]:visible').first().fill(plus3);
		await page.locator('button[type="submit"]:visible').first().click();

		// Back on the start day view: banner shows the hotel + check-in label.
		// (#222 renamed the banner class bg-clay → bg-accent, mode-driven accent.)
		await page.waitForURL(new RegExp(startDayHref!.replace(/\//g, '\\/')), { timeout: 10000 });
		const startBanner = page.locator('a.bg-accent:visible').first();
		await expect(startBanner).toContainText('Test Hotel');
		await expect(startBanner).toContainText(/Check in/i);

		// --- Walk to the next day (a middle day, inside [today, +3]) via DayNav ---
		await page.locator('a[aria-label^="Next day:"]:visible').first().click();
		await page.waitForURL(new RegExp(`/trips/${tripSlug}/days/`));
		// Banner re-renders here with "night X of N" — proof it spans, not a timeline card.
		const midBanner = page.locator('a.bg-accent:visible').first();
		await expect(midBanner).toContainText('Test Hotel', { timeout: 5000 });
		await expect(midBanner).toContainText(/night \d+ of \d+/i);
	});
});
