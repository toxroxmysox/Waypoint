import { test, expect } from '@playwright/test';

// #323 / ADR-0021 — phases tile the trip (boundary model). A phase is defined by
// its start day; its end is DERIVED as the next phase's start (shared travel day),
// or the trip end for the last phase. This spec proves the tiling holds end-to-end
// against the real PB + rebucket hooks: the auto-seed shrinks on add (no more
// whole-trip overlap) and merges back on delete.
//
// The phase card shows daysNightsLabel(start, end) — "N days · M nights" — computed
// from the (derived) range, so asserting the day count proves the end was retiled.
// Prereqs identical to m1-happy-path (dev-login + isolated PB via test:e2e:clean).

const BASE_URL = 'http://localhost:4173';

const day = (offsetDays: number) =>
	new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

test.describe('#323 phases tile the trip', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeEach(async ({ page }) => {
		const email = encodeURIComponent(process.env.E2E_TEST_EMAIL!);
		await page.goto(`${BASE_URL}/api/dev/login?email=${email}`);
		await page.waitForURL(`${BASE_URL}/trips`, { timeout: 10000 });
	});

	test('auto-seed spans the trip, shrinks on add, merges back on delete', async ({ page }) => {
		const stamp = Date.now().toString(36);
		const tripTitle = `E2E Tiling ${stamp}`;
		const tripSlug = `e2e-tiling-${stamp}`;
		const tripStart = day(0);
		const tripEnd = day(7); // 8-day trip

		// --- Create the trip ---
		await page.getByRole('link', { name: 'New Trip' }).click();
		await page.waitForURL(`${BASE_URL}/trips/new`);
		await page.fill('input[name="title"]', tripTitle);
		await page.fill('input[name="start_date"]', tripStart);
		await page.fill('input[name="end_date"]', tripEnd);
		await page.fill('input[name="location_summary"]', 'Tiling Test');
		await page.getByRole('button', { name: /create|save/i }).click();
		await page.waitForURL(`${BASE_URL}/trips/${tripSlug}`, { timeout: 10000 });

		// --- Seed: exactly one phase "Phase 1" spanning the whole trip (8 days) ---
		await page.goto(`${BASE_URL}/trips/${tripSlug}/phases`);
		const seedCard = page
			.locator('a', { has: page.getByRole('heading', { name: 'Phase 1', level: 3 }) })
			.filter({ visible: true })
			.first();
		await expect(seedCard).toBeVisible({ timeout: 5000 });
		await expect(seedCard).toContainText('8 days');

		// --- Add "Phase Two" starting mid-trip (day+3) via the start-only form ---
		await page.getByRole('button', { name: 'Add Phase' }).filter({ visible: true }).first().click();
		await page.locator('input[name="name"]:visible').first().fill('Phase Two');
		await page.locator('input[name="start_date"]:visible').first().fill(day(3));
		await page.getByRole('button', { name: /create phase/i }).filter({ visible: true }).first().click();

		// Retile: the seed shrinks to day0..day3 (4 days); Phase Two is day3..day7 (5 days).
		const seedAfter = page
			.locator('a', { has: page.getByRole('heading', { name: 'Phase 1', level: 3 }) })
			.filter({ visible: true })
			.first();
		const phaseTwo = page
			.locator('a', { has: page.getByRole('heading', { name: 'Phase Two', level: 3 }) })
			.filter({ visible: true })
			.first();
		await expect(phaseTwo).toBeVisible({ timeout: 5000 });
		await expect(seedAfter).toContainText('4 days'); // shrank — no longer whole-trip
		await expect(phaseTwo).toContainText('5 days');

		// --- Delete "Phase Two" → merges back into Phase 1 (8 days again) ---
		const phaseTwoRow = phaseTwo.locator('..'); // the flex row holding name + actions
		await phaseTwoRow.getByRole('button', { name: 'Delete phase' }).click();
		await phaseTwoRow.getByRole('button', { name: 'Delete?' }).click();

		await expect(
			page.getByRole('heading', { name: 'Phase Two', level: 3 }).filter({ visible: true })
		).toHaveCount(0, { timeout: 5000 });
		const seedMerged = page
			.locator('a', { has: page.getByRole('heading', { name: 'Phase 1', level: 3 }) })
			.filter({ visible: true })
			.first();
		await expect(seedMerged).toContainText('8 days'); // merged back to whole trip
	});
});
