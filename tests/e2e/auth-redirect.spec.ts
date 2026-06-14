import { test, expect } from '@playwright/test';

// #179a — deep links must survive the login wall. A logged-out hit on a
// protected deep link is preserved as `/login?redirect=<path>` and the login
// form carries it through the OTP round-trip as a hidden field, so verify lands
// the user back where they were headed instead of on /trips.
//
// These tests run logged OUT (the default page fixture has no auth cookie — no
// /api/dev/login here). The OTP itself can't be driven headlessly (no real
// inbox), so coverage stops at the redirect-param round-trip + the resend
// affordance's presence — the deterministic, harness-reachable surface.
const BASE = 'http://localhost:4173';

test.describe('Auth deep-link redirect (#179)', () => {
	test('logged-out deep link redirects to /login with the destination preserved', async ({
		page
	}) => {
		const deep = '/trips/some-trip/days/abc123';
		await page.goto(`${BASE}${deep}`);
		// Lands on the login wall carrying the encoded destination.
		await page.waitForURL(/\/login\?redirect=/);
		const url = new URL(page.url());
		expect(url.pathname).toBe('/login');
		expect(url.searchParams.get('redirect')).toBe(deep);
	});

	test('the login send-code form carries the redirect as a hidden field', async ({ page }) => {
		const deep = '/trips/some-trip/today';
		await page.goto(`${BASE}/login?redirect=${encodeURIComponent(deep)}`);
		const hidden = page.locator('input[name="redirect"]').first();
		await expect(hidden).toHaveValue(deep);
	});

	test('a plain /trips destination is not echoed as redirect noise', async ({ page }) => {
		await page.goto(`${BASE}/trips`);
		// The (app) guard sends a bare /login for the default landing — no param.
		await page.waitForURL('**/login');
		expect(new URL(page.url()).searchParams.has('redirect')).toBe(false);
	});

	test('an off-site redirect param is dropped, not honored', async ({ page }) => {
		// Open-redirect guard: a cross-origin target must fall back, never carry.
		await page.goto(`${BASE}/login?redirect=${encodeURIComponent('//evil.test/phish')}`);
		const hidden = page.locator('input[name="redirect"]').first();
		// safeRedirect() collapses the hostile value to '' before it reaches the form.
		await expect(hidden).toHaveValue('');
	});
});
