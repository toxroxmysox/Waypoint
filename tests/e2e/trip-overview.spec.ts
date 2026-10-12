import { test, expect } from '@playwright/test';
import { E2E_BASE } from './e2e-env';
import { EMAILS, devLogin, seedJapanTrip, type JapanFx } from './japan-fixture';

// #401 — the trip Overview's Level Header: span with phase count, trip notes,
// phase chips that open Phase Detail; no "Capture ideas".

const BASE = E2E_BASE;
const SLUG = 'e2e-trip-overview';
let fx: JapanFx;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
	fx = await seedJapanTrip(SLUG);
});

test('trip header: span · phases, chips open Phase Detail, no Capture ideas', async ({ browser }) => {
	const { page, close } = await devLogin(browser, EMAILS.owner);
	await page.goto(`${BASE}/trips/${SLUG}`, { waitUntil: 'networkidle' });
	await expect(page.getByText('7 days · 6 nights · 2 phases').filter({ visible: true }).first()).toBeVisible();
	await expect(page.getByText('Capture ideas').filter({ visible: true })).toHaveCount(0);
	const chips = page.getByRole('navigation', { name: /open$/ }).filter({ visible: true }).first();
	await chips.getByRole('link', { name: /^Kanazawa/ }).click();
	await page.waitForURL(`${BASE}/trips/${SLUG}/phases/${fx.kanazawa}`);
	await close();
});

test('trip notes persist; viewer gets no edit', async ({ browser }) => {
	const t = await devLogin(browser, EMAILS.traveler);
	await t.page.goto(`${BASE}/trips/${SLUG}`, { waitUntil: 'networkidle' });
	await t.page.getByRole('button', { name: 'Add trip notes' }).filter({ visible: true }).click();
	await t.page.locator('textarea[name="notes"]').filter({ visible: true }).fill('JR passes ordered.');
	await t.page.getByRole('button', { name: 'Save', exact: true }).filter({ visible: true }).click();
	await expect(t.page.getByText('Notes saved')).toBeVisible();
	await t.page.reload({ waitUntil: 'networkidle' });
	await expect(t.page.getByText('JR passes ordered.').filter({ visible: true }).first()).toBeVisible();
	await t.close();

	const vw = await devLogin(browser, EMAILS.viewer);
	await vw.page.goto(`${BASE}/trips/${SLUG}`, { waitUntil: 'networkidle' });
	await expect(vw.page.getByText('JR passes ordered.').filter({ visible: true }).first()).toBeVisible();
	await expect(vw.page.getByRole('button', { name: 'Edit notes' }).filter({ visible: true })).toHaveCount(0);
	await vw.close();
});

test('itinerary: Compact rows by default, Details persists, phase cards open Phase Detail', async ({ browser }) => {
	const { page, close } = await devLogin(browser, EMAILS.owner);
	await page.goto(`${BASE}/trips/${SLUG}`, { waitUntil: 'networkidle' });
	const main = page.locator('main').filter({ visible: true });

	// Compact (default): one row per day with "N planned"; Mon 22 is a Travel Day.
	const mon22 = main.locator(`a[href="/trips/${SLUG}/days/${fx.days['2027-11-22']}"][data-compact-day]`).first();
	await expect(mon22).toContainText('1 planned');
	await expect(mon22).toContainText('⇄');
	await expect(main.locator('[data-compact-day]').first()).toContainText('0 planned');

	// Each phase is a bordered card whose header opens Phase Detail.
	const kanCard = main.locator(`[data-phase-card="${fx.kanazawa}"]`);
	await expect(kanCard.locator('a[data-level-link]')).toHaveAttribute('href', `/trips/${SLUG}/phases/${fx.kanazawa}`);

	// No lists or Flights & stays on the Overview.
	await expect(page.getByText('Flights & stays').filter({ visible: true })).toHaveCount(0);
	await expect(page.getByText(/Whole-trip lists/).filter({ visible: true })).toHaveCount(0);

	// Details → DayCards; the choice survives reload.
	await main.getByRole('button', { name: 'Details' }).click();
	await expect(main.locator('[data-compact-day]')).toHaveCount(0);
	await expect(main.locator(`a[href="/trips/${SLUG}/days/${fx.days['2027-11-22']}"]`).filter({ hasText: / item/ }).first()).toBeVisible();
	await page.reload({ waitUntil: 'networkidle' });
	await expect(page.locator('main').filter({ visible: true }).locator('[data-compact-day]')).toHaveCount(0);
	await page.locator('main').filter({ visible: true }).getByRole('button', { name: 'Compact' }).click();

	await mon22.click();
	await page.waitForURL(`${BASE}/trips/${SLUG}/days/${fx.days['2027-11-22']}`);
	await close();
});
