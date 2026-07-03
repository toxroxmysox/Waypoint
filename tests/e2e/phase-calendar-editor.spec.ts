import { test, expect, type Browser } from '@playwright/test';

// #330 — phase calendar editor lifecycle. Uses the global-setup e2e-active-trip
// (a clean single phase over a 9-day trip). Split → rename → delete in ONE flow so
// the trip ends exactly as it started (single phase). The DRAG gesture (move a
// boundary) can't be faithfully automated (Pointer-Event sequence + elementFromPoint
// — the #201/#234/#324 scar); its logic is covered by validateMovePhaseStart unit
// tests, and the gesture is dogfood-verified.

const BASE = 'http://localhost:4173';

async function devLogin(browser: Browser) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { ctx, page };
}

test.describe('#330 phase calendar editor', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test('renders the calendar, then split → rename → delete round-trips', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser);
		try {
			await page.setViewportSize({ width: 375, height: 812 });
			await page.goto(`${BASE}/trips/e2e-active-trip/phases`);

			// Editor renders: hint, weekday header, calendar cells, single-phase summary.
			await expect(page.getByText(/tap a day to split/i).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });
			await expect(page.locator('[data-day]:visible').first()).toBeVisible();
			const summary = page.getByText(/phase.*travel day.*days/i).filter({ visible: true }).first();
			await expect(summary).toHaveText(/1 phase · 0 travel days/);

			// Split at day 5 → 2 phases, 1 travel day. On the 9-day trip the split tiles
			// into Days 1–5 (5d) and Days 5–9 (5d) — the tiling invariant, verified end to end.
			await page.locator('[data-day="5"]:visible').first().click();
			await expect(page.getByText(/2 phases · 1 travel day/).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });
			await expect(page.getByText('New phase').filter({ visible: true }).first()).toBeVisible();
			await expect(page.getByText('Days 1–5').filter({ visible: true }).first()).toBeVisible();
			await expect(page.getByText('Days 5–9').filter({ visible: true }).first()).toBeVisible();
			// Phase Detail is still reachable from each row (add-ideas path preserved).
			await expect(page.locator('a[href^="/trips/e2e-active-trip/phases/"]:visible').first()).toBeVisible();

			// Rename the new phase via its pill → inline input → Enter.
			await page.getByRole('button', { name: 'New phase', exact: true }).filter({ visible: true }).first().click();
			const input = page.locator('input:not([type="hidden"]):visible').first();
			await input.fill('Islands');
			await input.press('Enter');
			await expect(page.getByText('Islands').filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });

			// Delete the new phase (its list-row trash) → merge back to a single phase.
			await page.getByRole('button', { name: /^Remove Islands/ }).filter({ visible: true }).first().click();
			await expect(page.getByText(/1 phase · 0 travel days/).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });
			await expect(page.getByText('Islands')).toHaveCount(0);
		} finally {
			await ctx.close();
		}
	});
});
