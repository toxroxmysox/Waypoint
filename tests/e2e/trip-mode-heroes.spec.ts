import { test, expect } from '@playwright/test';
import { E2E_BASE, E2E_PB_BASE } from './e2e-env';

// #430 — several Heroes on Now. Seeds via PB (seed-visual-trip { now: 'multi' }):
// three ongoing timed items — 'Beach volleyball' (began first, not the viewer's),
// 'Dinner at The Immigrant' (began later, the viewer is going), 'Harbor walk' (began
// last, nobody assigned) — plus an ongoing multi-day 'Lakeside cabin' stay. Owns its
// slug: the seed endpoint is destructive per slug. AppShell renders the page twice,
// so every locator is scoped to the visible tree.

const BASE = E2E_BASE;
const SLUG = `e2e-heroes-${Date.now().toString(36)}`;

test.describe('Now: several Heroes (#430)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeAll(async () => {
		const res = await fetch(`${E2E_PB_BASE}/api/dev/seed-visual-trip`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ slug: SLUG, now: 'multi' })
		});
		if (!res.ok) throw new Error(`seed-visual-trip failed (${res.status}): ${await res.text()}`);
	});

	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(process.env.E2E_TEST_EMAIL!)}`);
		await page.waitForURL(/\/(trips|claim)/, { timeout: 15000 });
		await page.goto(`${BASE}/trips/${SLUG}/now`, { waitUntil: 'networkidle' });
	});

	test("every ongoing item is a Hero: the viewer's first, then the rest by start", async ({ page }) => {
		const heroes = page.locator('[data-hero]').filter({ visible: true });
		await expect(heroes).toHaveCount(3);
		await expect(heroes.nth(0).getByRole('heading')).toHaveText('Dinner at The Immigrant');
		await expect(heroes.nth(1).getByRole('heading')).toHaveText('Beach volleyball');
		await expect(heroes.nth(2).getByRole('heading')).toHaveText('Harbor walk');
		for (const h of await heroes.all()) {
			await expect(h.getByTestId('hero-status')).toHaveText(/^NOW · until /);
		}
	});

	test('a Multi-day Item stays a banner, never a Hero', async ({ page }) => {
		await expect(
			page.locator('[data-hero]').filter({ visible: true, hasText: 'Lakeside cabin' })
		).toHaveCount(0);
		await expect(page.getByText('Lakeside cabin').filter({ visible: true }).first()).toBeVisible();
	});

	test('no free-time card and no conflict note while items are ongoing', async ({ page }) => {
		await expect(page.getByText('Free time').filter({ visible: true })).toHaveCount(0);
		await expect(page.getByText(/overlap/i).filter({ visible: true })).toHaveCount(0);
	});

	test('each Hero has its own Skip: skipping the second removes only that Hero', async ({ page }) => {
		const heroes = page.locator('[data-hero]').filter({ visible: true });
		await heroes.nth(1).getByRole('button', { name: 'Item actions' }).click();
		await page.getByRole('menuitem', { name: /Skip/ }).click();
		await page.getByRole('button', { name: 'Skip', exact: true }).filter({ visible: true }).click();
		await expect(heroes).toHaveCount(2, { timeout: 7000 });
		await expect(heroes.nth(0).getByRole('heading')).toHaveText('Dinner at The Immigrant');
		await expect(heroes.nth(1).getByRole('heading')).toHaveText('Harbor walk');
	});
});
