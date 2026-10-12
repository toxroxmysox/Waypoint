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
