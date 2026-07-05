import { test, expect } from '@playwright/test';

// #278 First-run for the signed-up-but-trip-less user (grill 2026-07-05, BINDING).
// The bare "/trips" empty state is a WARM ORIENTATION, not marketing:
//   - one plain sentence on what a trip is,
//   - a prominent "Plan your first trip" CTA → the name-first forming create (#270),
//   - a quieter "Have an invite? Paste your link." escape hatch that resolves a
//     pasted invite URL *or* a bare token to the EXISTING /join/[token] flow.
//
// Requires: PB with WAYPOINT_DEV_MODE=true + E2E_TEST_EMAILS set. Runs against a
// FRESH isolated PB (pnpm test:e2e:clean, :8097) so the whitelisted identity below
// genuinely owns zero trips. `rules-nonmember@e2e.test` is the harness identity that
// is deliberately never made a member of any trip — the natural trip-less user.

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173';
const TRIP_LESS_EMAIL = 'rules-nonmember@e2e.test';

test.describe('#278 first-run — trip-less user', () => {
	test.skip(!process.env.E2E_TEST_EMAILS, 'Set E2E_TEST_EMAILS to run this E2E test');
	test.skip(
		!(process.env.E2E_TEST_EMAILS ?? '').includes(TRIP_LESS_EMAIL),
		`Requires ${TRIP_LESS_EMAIL} whitelisted (rules harness)`
	);

	test.beforeEach(async ({ page }) => {
		await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(TRIP_LESS_EMAIL)}`);
		await page.waitForURL(`${BASE}/trips`, { timeout: 10000 });
	});

	test('sees warm orientation + both CTAs', async ({ page }) => {
		const onramp = page.getByTestId('trips-empty-onramp');
		await expect(onramp).toBeVisible();

		// Orientation: a plain sentence on what a trip is (not marketing copy).
		await expect(onramp.getByText(/a trip is a shared place to plan/i)).toBeVisible();

		// Prominent CTA → the name-first forming create (#270).
		const plan = onramp.getByRole('link', { name: /plan your first trip/i });
		await expect(plan).toBeVisible();
		await expect(plan).toHaveAttribute('href', '/trips/new');

		// Quieter escape hatch present.
		await expect(onramp.getByText(/have an invite\?/i)).toBeVisible();
		await expect(onramp.getByPlaceholder(/paste link or code/i)).toBeVisible();
	});

	test('paste a bare token → lands on /join/<token>', async ({ page }) => {
		const onramp = page.getByTestId('trips-empty-onramp');
		// 40 alphanumerics, the $security.randomString(40) shape. This token won't
		// resolve to a real invite, so /join renders its not_found state — but the
		// point of THIS test is that the paste-input routes to /join with the token.
		const token = 'abcDEF123456ghiJKL789012mnoPQR345678stuv';
		await onramp.getByPlaceholder(/paste link or code/i).fill(token);
		await onramp.getByRole('button', { name: /^go$/i }).click();
		await page.waitForURL(`${BASE}/join/${token}`, { timeout: 10000 });
		expect(page.url()).toBe(`${BASE}/join/${token}`);
	});

	test('paste a full invite URL → extracts token and lands on /join', async ({ page }) => {
		const onramp = page.getByTestId('trips-empty-onramp');
		const token = 'ZZZyyy111222xxx333444www555666vvv777888U';
		await onramp
			.getByPlaceholder(/paste link or code/i)
			.fill(`https://app.vandenwarsen.com/join/${token}`);
		await onramp.getByRole('button', { name: /^go$/i }).click();
		await page.waitForURL(`${BASE}/join/${token}`, { timeout: 10000 });
		expect(page.url()).toBe(`${BASE}/join/${token}`);
	});

	test('paste garbage → stays put with an inline error', async ({ page }) => {
		const onramp = page.getByTestId('trips-empty-onramp');
		await onramp.getByPlaceholder(/paste link or code/i).fill('not a token!!!');
		await onramp.getByRole('button', { name: /^go$/i }).click();
		await expect(onramp.getByRole('alert')).toBeVisible();
		expect(page.url()).toBe(`${BASE}/trips`);
	});

	test('375px: no horizontal overflow', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto(`${BASE}/trips`);
		await expect(page.getByTestId('trips-empty-onramp')).toBeVisible();
		const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
		const viewportWidth = await page.evaluate(() => window.innerWidth);
		expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
	});
});
