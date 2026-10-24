import { test, expect } from '@playwright/test';
import { E2E_BASE, E2E_PB_BASE } from './e2e-env';

// #510 link defaults + #523 per-trip daily email toggles on /account.
// Own user so the saved defaults never leak into another spec's link assertions.
const BASE = E2E_BASE;
const EMAIL = 'rules-viewer@e2e.test';
const TITLE = `E2E email prefs ${Date.now().toString(36)}`;

test.describe.configure({ mode: 'serial' });

let token = '';

test.beforeAll(async () => {
	const res = await fetch(`${E2E_PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: EMAIL })
	});
	token = ((await res.json()) as { token: string }).token;
	const me = await fetch(`${E2E_PB_BASE}/api/collections/users/auth-refresh`, {
		method: 'POST',
		headers: { Authorization: token }
	}).then((r) => r.json());
	const trip = await fetch(`${E2E_PB_BASE}/api/collections/trips/records`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: token },
		body: JSON.stringify({
			title: TITLE,
			slug: `e2e-email-prefs-${Date.now().toString(36)}`,
			created_by: me.record.id
		})
	});
	expect(trip.ok, `trip create ${trip.status}`).toBe(true);
});

test.afterAll(async () => {
	// Back to the defaults so a rerun starts clean.
	const me = await fetch(`${E2E_PB_BASE}/api/collections/users/auth-refresh`, {
		method: 'POST',
		headers: { Authorization: token }
	}).then((r) => r.json());
	await fetch(`${E2E_PB_BASE}/api/collections/users/records/${me.record.id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', Authorization: token },
		body: JSON.stringify({ search_engine: '', maps_app: '' })
	});
});

test.beforeEach(async ({ page }) => {
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(EMAIL)}`);
	await page.waitForURL(/\/(trips|claim)/);
});

test('#510 search + maps defaults save and persist', async ({ page }) => {
	await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
	await expect(page.locator('#search_engine')).toHaveValue('google');
	await expect(page.locator('#maps_app')).toHaveValue('google');

	await page.locator('#search_engine').selectOption('duckduckgo');
	await page.locator('#maps_app').selectOption('apple');
	await page
		.locator('form[action="?/updateLinkDefaults"]')
		.getByRole('button', { name: 'Save' })
		.click();
	await expect(page.getByText('Defaults saved')).toBeVisible();

	await page.reload({ waitUntil: 'networkidle' });
	await expect(page.locator('#search_engine')).toHaveValue('duckduckgo');
	await expect(page.locator('#maps_app')).toHaveValue('apple');
});

test('#523 a trip email toggle saves to that trip', async ({ page }) => {
	await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
	const box = page
		.locator('[data-trip-emails] label', { hasText: TITLE })
		.locator('input[type=checkbox]');
	await expect(box).toBeChecked();

	await box.uncheck();
	await page
		.locator('form[action="?/updateTripEmails"]')
		.getByRole('button', { name: 'Save' })
		.click();
	await expect(page.getByText('Email preferences saved')).toBeVisible();

	await page.reload({ waitUntil: 'networkidle' });
	await expect(
		page.locator('[data-trip-emails] label', { hasText: TITLE }).locator('input[type=checkbox]')
	).not.toBeChecked();
});
