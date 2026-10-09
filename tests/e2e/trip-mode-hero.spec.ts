import { test, expect } from '@playwright/test';
import { E2E_BASE, E2E_PB_BASE } from './e2e-env';

// #428 — the Hero on Now. Seeds via PB (seed-visual-trip { now: 'hero' }: a dinner
// that began 65 min ago and ends in 55, with place + address, booked, two codes and
// three Going members), never by driving the UI. Owns its slug: the seed endpoint is
// destructive per slug. AppShell renders the page twice, so every locator is
// scoped to the visible tree.

const BASE = E2E_BASE;
const SLUG = `e2e-hero-${Date.now().toString(36)}`;

test.describe('Now Hero (#428)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeAll(async () => {
		const res = await fetch(`${E2E_PB_BASE}/api/dev/seed-visual-trip`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ slug: SLUG, now: 'hero' })
		});
		if (!res.ok) throw new Error(`seed-visual-trip failed (${res.status}): ${await res.text()}`);
	});

	test.beforeEach(async ({ page, context }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {});
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(process.env.E2E_TEST_EMAIL!)}`);
		await page.waitForURL(/\/(trips|claim)/, { timeout: 15000 });
		await page.goto(`${BASE}/trips/${SLUG}/now`, { waitUntil: 'networkidle' });
	});

	test('shows the whole Hero: place, NOW line, codes, booked, Going names', async ({ page }) => {
		const hero = page.locator('[data-hero]').filter({ visible: true });
		await expect(hero).toHaveCount(1);
		await expect(hero.getByRole('heading', { name: 'Dinner at The Immigrant' })).toBeVisible();
		await expect(hero.getByTestId('hero-place')).toContainText('1 Main St, Kohler, WI 53044');
		await expect(hero.getByTestId('hero-status')).toHaveText(/NOW · until \d{1,2}:\d{2}[ap] · (5\d|4\d)m left/);
		await expect(hero.getByTestId('code-row')).toHaveCount(2);
		await expect(hero.getByTestId('hero-booked')).toBeVisible();
		await expect(hero.getByTestId('hero-going')).toContainText('Kim');
		await expect(hero.getByTestId('hero-going')).toContainText('Dev');
		// 44px hit areas.
		for (const row of await hero.getByTestId('code-row').all()) {
			expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
		}
	});

	test('tapping a code copies it', async ({ page }) => {
		const hero = page.locator('[data-hero]').filter({ visible: true });
		await hero.getByTestId('code-row').first().click();
		await expect(page.getByText('Code copied').filter({ visible: true }).first()).toBeVisible();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('IMM-48213');
	});

	test('owner skips from the Hero ⋯: the Hero goes and the replace-it strip opens', async ({ page }) => {
		const hero = page.locator('[data-hero]').filter({ visible: true });
		await hero.getByRole('button', { name: 'Item actions' }).click();
		await page.getByRole('menuitem', { name: /Skip/ }).click();
		await page.getByRole('button', { name: 'Skip', exact: true }).filter({ visible: true }).click();
		await expect(page.locator('[data-hero]').filter({ visible: true })).toHaveCount(0, { timeout: 7000 });
		await expect(page.locator('section[aria-label="Ideas for now"]:visible').first()).toBeVisible({ timeout: 7000 });
	});
});
