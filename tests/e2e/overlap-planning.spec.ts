import { test, expect, type Page } from '@playwright/test';
import { E2E_BASE, E2E_PB_BASE } from './e2e-env';

// #421 — Planning Mode overlaps. Seeds the rich day (seed-visual-trip { rich: true }):
// Brunch 10:30-12:30 x Red Rocks hike 11:30-14:30 share Kevin (red); Museum 15:00-17:30 x
// Spa hour 16:00-16:50 share nobody (ink). Trip Mode shows none: see trip-mode-rail.spec.ts.
// AppShell renders the page twice, so every locator is scoped to the visible tree.

const BASE = E2E_BASE;
const SLUG = `e2e-overlap-${Date.now().toString(36)}`;
let dayId = '';

const card = (page: Page, title: string) =>
	page
		.locator('.no-callout')
		.filter({ has: page.locator('[data-card="title"]', { hasText: new RegExp(`^${title}$`) }) })
		.filter({ visible: true })
		.first();
const note = (page: Page, title: string) => card(page, title).locator('[data-strip="overlap"]');
const isRed = (loc: ReturnType<Page['locator']>) => loc.evaluate((el) => el.classList.contains('text-error'));

test.describe('Planning Mode overlaps (#421)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeAll(async () => {
		const res = await fetch(`${E2E_PB_BASE}/api/dev/seed-visual-trip`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ slug: SLUG, rich: true })
		});
		if (!res.ok) throw new Error(`seed-visual-trip failed (${res.status}): ${await res.text()}`);
		dayId = (await res.json()).days[4].id;
	});

	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(process.env.E2E_TEST_EMAIL!)}`);
		await page.waitForURL(/\/(trips|claim)/, { timeout: 15000 });
		await page.goto(`${BASE}/trips/${SLUG}/days/${dayId}`, { waitUntil: 'networkidle' });
	});

	test('shared people: both cards say Overlaps {partner} in red; earlier end + later start are red', async ({ page }) => {
		await expect(note(page, 'Brunch')).toContainText('Overlaps Red Rocks hike');
		await expect(note(page, 'Red Rocks hike')).toContainText('Overlaps Brunch');
		expect(await isRed(note(page, 'Brunch'))).toBe(true);
		expect(await isRed(note(page, 'Red Rocks hike'))).toBe(true);
		// First in the strip.
		expect(await card(page, 'Brunch').locator('[data-card-strip] [data-strip]').first().getAttribute('data-strip')).toBe('overlap');
		const t = (title: string, which: 'top' | 'bottom') => card(page, title).locator(`[data-rail="time-${which}"]`);
		expect(await isRed(t('Brunch', 'bottom'))).toBe(true);
		expect(await isRed(t('Brunch', 'top'))).toBe(false);
		expect(await isRed(t('Red Rocks hike', 'top'))).toBe(true);
		expect(await isRed(t('Red Rocks hike', 'bottom'))).toBe(false);
	});

	test('nobody shared: plain ink note on both, no red anywhere on the pair', async ({ page }) => {
		await expect(note(page, 'Museum')).toContainText('Overlaps Spa hour');
		await expect(note(page, 'Spa hour')).toContainText('Overlaps Museum');
		for (const title of ['Museum', 'Spa hour']) {
			expect(await isRed(note(page, title))).toBe(false);
			await expect(card(page, title).locator('.text-error')).toHaveCount(0);
			await expect(card(page, title).locator('[data-rail^="time"].text-error')).toHaveCount(0);
		}
	});
});
