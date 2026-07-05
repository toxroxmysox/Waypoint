import { test, expect } from '@playwright/test';

// #270 / ADR-0022 — the forming (dateless) trip lifecycle, end-to-end:
// name-first dateless create → forming home (gated nav + set-dates door +
// phase-less idea capture) → promotion (set dates) → seeded days + Phase 1
// visible, idea intact.
//
// playwright.config.ts boots `npm run build && npm run preview` on :4173.
// /api/dev/login issues a real auth cookie via a PB bypass endpoint (404s unless
// WAYPOINT_DEV_MODE=true, so production stays safe).
const BASE = 'http://localhost:4173';

// The trip layout is dual-tree (mobile + desktop, one CSS-hidden). Scope every
// content locator to the visible subtree (#239 guardrail: AppShell renders
// +page.svelte twice).

test.describe('Forming lifecycle (#270)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeEach(async ({ page }) => {
		const email = encodeURIComponent(process.env.E2E_TEST_EMAIL!);
		await page.goto(`${BASE}/api/dev/login?email=${email}`);
		await page.waitForURL(`${BASE}/trips`, { timeout: 10000 });
	});

	test('dateless create → forming surfaces → promote → seeded days, ideas intact', async ({
		page
	}) => {
		const stamp = Date.now().toString(36);
		const title = `E2E Forming ${stamp}`;
		// Deterministic slug from the title (lowercase, spaces→hyphens).
		const slug = title.toLowerCase().replace(/\s+/g, '-');

		// --- 1. Name-first create: skip the dates expander entirely.
		await page.goto(`${BASE}/trips/new`);
		await page.waitForURL('**/trips/new');
		await page.fill('input[name="title"]', title);
		await page.fill('input[name="location_summary"]', 'Forming Location');
		await page.getByRole('button', { name: /create/i }).click();
		await page.waitForURL(`${BASE}/trips/${slug}`, { timeout: 10000 });

		// --- 2. Forming home: "No dates yet" + the set-dates door.
		await expect(
			page.getByText('No dates yet').filter({ visible: true }).first()
		).toBeVisible();
		await expect(
			page.locator('[data-testid="set-dates-form"]:visible').first()
		).toBeVisible();

		// Nav is gated to the forming scope: Ideas + Members + Goals + More; the
		// date-scoped planning tabs are hidden until promotion.
		const nav = page.locator('nav.fixed.bottom-0');
		await expect(nav.getByText('Ideas')).toBeVisible();
		await expect(nav.getByText('Members')).toBeVisible();
		await expect(nav.getByText('Goals')).toBeVisible();
		await expect(nav.getByText('Itinerary')).toHaveCount(0);
		await expect(nav.getByText('Docs')).toHaveCount(0);

		// --- 3. Capture a phase-less idea (the sheet skips fork + phase picker).
		await page
			.getByRole('button', { name: 'Add an idea' })
			.filter({ visible: true })
			.first()
			.click();
		const ideaTitle = `Forming idea ${stamp}`;
		// The sheet's title input — scope to the visible one inside the open sheet.
		await page.locator('#idea-cap-title:visible').fill(ideaTitle);
		await page.getByRole('button', { name: 'Add idea', exact: true }).click();
		// Forming idea submits redirect back to the trip home; the idea list shows it.
		await expect(
			page.getByText(ideaTitle).filter({ visible: true }).first()
		).toBeVisible({ timeout: 10000 });

		// --- 4. Trips list: 'No dates yet' badge, sorted ahead of Past.
		await page.goto(`${BASE}/trips`);
		await expect(
			page.getByText(title).filter({ visible: true }).first()
		).toBeVisible();
		await expect(
			page.getByText(/no dates yet/i).filter({ visible: true }).first()
		).toBeVisible();

		// --- 5. Promote: set dates via the affordance. The PB update hook seeds
		// "Phase 1" + generates days and re-homes the phase-less idea into it.
		await page.goto(`${BASE}/trips/${slug}`);
		const start = new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0];
		const end = new Date(Date.now() + 33 * 86_400_000).toISOString().split('T')[0];
		await page.locator('#forming-start:visible').fill(start);
		await page.locator('#forming-end:visible').fill(end);
		await page
			.getByRole('button', { name: 'Set the dates' })
			.filter({ visible: true })
			.first()
			.click();

		// --- 6. Promoted: the planning Overview renders with the seeded days
		// (4-day span) + Phase 1; the planning nav is back.
		await expect(
			page.getByText('4 days').filter({ visible: true }).first()
		).toBeVisible({ timeout: 15000 });
		await expect(
			page.getByText('Phase 1').filter({ visible: true }).first()
		).toBeVisible();
		await expect(nav.getByText('Itinerary')).toBeVisible();
		await expect(
			page.getByText('No dates yet').filter({ visible: true })
		).toHaveCount(0);

		// Ideas intact: the idea was re-homed into Phase 1 — visible on its page.
		const phaseLink = page
			.locator(`a[href^="/trips/${slug}/phases/"]:visible`)
			.first();
		await phaseLink.click();
		await expect(
			page.getByText(ideaTitle).filter({ visible: true }).first()
		).toBeVisible({ timeout: 10000 });
	});

	test('clearing dates on a dated trip is rejected (one-way promotion)', async ({ page }) => {
		const stamp = Date.now().toString(36);
		const title = `E2E Undate ${stamp}`;
		const slug = title.toLowerCase().replace(/\s+/g, '-');

		// Dated create.
		await page.goto(`${BASE}/trips/new`);
		await page.waitForURL('**/trips/new');
		await page.fill('input[name="title"]', title);
		// #270: dates live behind the optional "I know the dates" expander.
		await page.locator('summary', { hasText: 'I know the dates' }).click();
		const start = new Date(Date.now() + 10 * 86_400_000).toISOString().split('T')[0];
		const end = new Date(Date.now() + 12 * 86_400_000).toISOString().split('T')[0];
		await page.fill('input[name="start_date"]', start);
		await page.fill('input[name="end_date"]', end);
		await page.getByRole('button', { name: /create/i }).click();
		await page.waitForURL(`${BASE}/trips/${slug}`, { timeout: 10000 });

		// Settings: blank out both dates → the action rejects with the friendly 400.
		await page.goto(`${BASE}/trips/${slug}/settings`);
		await page.locator('input[name="start_date"]:visible').fill('');
		await page.locator('input[name="end_date"]:visible').fill('');
		// The inputs are required on a dated trip (client-side); strip the attribute
		// to prove the SERVER rejection (the PB hook + action, not just the browser).
		await page
			.locator('input[name="start_date"]:visible')
			.evaluate((el) => el.removeAttribute('required'));
		await page
			.locator('input[name="end_date"]:visible')
			.evaluate((el) => el.removeAttribute('required'));
		await page
			.getByRole('button', { name: /save/i })
			.filter({ visible: true })
			.first()
			.click();
		await expect(
			page
				.getByText(/they can be changed, but not removed/i)
				.filter({ visible: true })
				.first()
		).toBeVisible({ timeout: 10000 });
	});
});
