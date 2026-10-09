import { test, expect, type Page } from '@playwright/test';
import { E2E_BASE, E2E_PB_BASE } from './e2e-env';

// #429 — Trip Mode lists on the rail (Earlier today, Coming up, Next 3 days). Seeds via
// PB (seed-visual-trip { now: 'rail' }: the Hero state plus three Earlier today items,
// Coming up with a two-code item, an overlapping pair, a booked item without a code and
// an untimed one, and a booked-with-code item tomorrow). Owns its slug. AppShell renders
// the page twice, so every locator is scoped to the visible tree.

const BASE = E2E_BASE;
const SLUG = `e2e-rail-${Date.now().toString(36)}`;

const card = (page: Page, title: string) =>
	page.locator('.no-callout').filter({ hasText: title }).filter({ visible: true }).first();

test.describe('Trip Mode rail lists (#429)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeAll(async () => {
		const res = await fetch(`${E2E_PB_BASE}/api/dev/seed-visual-trip`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ slug: SLUG, now: 'rail' })
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

	test('a booked item with codes shows ✓ {code} +n; tap copies and does not open the item', async ({ page }) => {
		const chip = card(page, 'Sunset cruise').locator('[data-strip="code"]');
		await expect(chip).toContainText('SUN-5521 +1');
		expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
		const before = page.url();
		await chip.click();
		await expect(page.getByText('Code copied').filter({ visible: true }).first()).toBeVisible();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('SUN-5521');
		expect(page.url()).toBe(before);
	});

	test('a booked item without a code keeps ✓ Booked', async ({ page }) => {
		const c = card(page, 'Fireside tacos');
		await expect(c.locator('[data-strip="booked"]')).toContainText('Booked');
		await expect(c.locator('[data-strip="code"]')).toHaveCount(0);
	});

	test('no overlap note and no red rail time in Trip Mode, even for an overlapping pair', async ({ page }) => {
		await expect(card(page, 'Wine tasting')).toBeVisible();
		await expect(page.locator('[data-strip="overlap"]').filter({ visible: true })).toHaveCount(0);
		await expect(page.locator('[data-rail^="time"].text-error').filter({ visible: true })).toHaveCount(0);
	});

	test('no accent on the next item: the Hero is the only clay border', async ({ page }) => {
		await expect(page.locator('[data-hero]').filter({ visible: true })).toHaveCount(1);
		// "Night walk" is the next item. Its card carries the plain 1px line border.
		const border = await card(page, 'Night walk').evaluate((el) => {
			const s = getComputedStyle(el.querySelector('.border-line') as HTMLElement);
			return { w: s.borderTopWidth, c: s.borderTopColor };
		});
		const other = await card(page, 'Fireside tacos').evaluate((el) => {
			const s = getComputedStyle(el.querySelector('.border-line') as HTMLElement);
			return { w: s.borderTopWidth, c: s.borderTopColor };
		});
		expect(border).toEqual(other);
	});

	test('Earlier today: full cards, muted without opacity, still tappable', async ({ page }) => {
		const section = page.locator('section[aria-label="Earlier today"]').filter({ visible: true });
		await expect(section.locator('.no-callout')).toHaveCount(3);
		const c = card(page, 'Kayak rental pickup');
		// The booked-with-code chip is still there, and the white fill is gone.
		await expect(c.locator('[data-strip="code"]')).toContainText('KYK-20931');
		const facts = await c.evaluate((el) => {
			const surface = el.querySelector('.border-line') as HTMLElement;
			let op = 1;
			for (let n: HTMLElement | null = el as HTMLElement; n; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity);
			return { bg: getComputedStyle(surface).backgroundColor, op };
		});
		expect(facts.op).toBe(1);
		expect(facts.bg).toBe('rgba(0, 0, 0, 0)');
		await c.getByRole('link', { name: /Kayak rental pickup/ }).click();
		await page.waitForURL(/\/items\//);
	});

	test('owner skips a Coming up card from its ⋯: the card goes and the replace-it strip opens', async ({ page }) => {
		const c = card(page, 'Stargazing');
		await c.getByRole('button', { name: 'Item actions' }).click();
		await page.getByRole('menuitem', { name: /Skip/ }).click();
		await page.getByRole('button', { name: 'Skip', exact: true }).filter({ visible: true }).click();
		await expect(card(page, 'Stargazing').locator('a[aria-label*="Stargazing"]')).toHaveCount(0, { timeout: 7000 });
		await expect(page.locator('section[aria-label="Ideas for now"]:visible').first()).toBeVisible({ timeout: 7000 });
	});

	test('Next 3 days uses the same rail and card: code chip, no cost, no ⋯', async ({ page }) => {
		await page.goto(`${BASE}/trips/${SLUG}/today/upcoming`, { waitUntil: 'networkidle' });
		const c = card(page, 'Breakfast at Sip Coffeehouse');
		await expect(c.locator('[data-strip="code"]')).toContainText('SIP-7742');
		await expect(c.locator('[data-card="cost"]')).toHaveCount(0);
		await expect(c.getByRole('button', { name: 'Item actions' })).toHaveCount(0);
		await expect(c.locator('[data-rail="stack"]')).toBeVisible();
	});
});
