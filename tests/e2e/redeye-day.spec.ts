import { test, expect, type Page } from '@playwright/test';
import { E2E_BASE } from './e2e-env';

// #538 — a red-eye on the Day page: a card on both days. Day 1 places it by
// take-off (Evening); day 2 by landing (Morning) and won't let it be dragged,
// since the item belongs to day 1. Seeded by seed-visual-trip's { redeye: true }:
// UA 1 departs day 1 23:30, lands day 2 06:40.

const BASE = E2E_BASE;
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';
const SLUG = 'e2e-redeye-538';
const FLIGHT = 'UA 1 to Denver';

test.describe.configure({ mode: 'serial' });

let day1 = '';
let day2 = '';

test.beforeAll(async () => {
	const res = await fetch(`${PB_BASE}/api/dev/seed-visual-trip`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ slug: SLUG, redeye: true })
	});
	if (!res.ok) throw new Error(`seed-visual-trip failed (${res.status}): ${await res.text()}`);
	const { days } = (await res.json()) as { days: { id: string }[] };
	[day1, day2] = [days[0].id, days[1].id];
});

// AppShell renders the page twice (one CSS-hidden): scope to the visible tree.
const zone = (page: Page) => page.locator('[data-day-timeline]').filter({ visible: true });
const wrappers = (page: Page) => zone(page).locator('> div');

async function openDay(page: Page, dayId: string) {
	const email = encodeURIComponent(process.env.E2E_TEST_EMAIL!);
	await page.goto(`${BASE}/api/dev/login?email=${email}`);
	await page.waitForURL(/\/(trips|claim)/, { timeout: 15000 });
	await page.goto(`${BASE}/trips/${SLUG}/days/${dayId}`, { waitUntil: 'networkidle' });
	await expect(zone(page)).toBeVisible();
}

test('departure day: a card by take-off, saying when it lands', async ({ page }) => {
	await openDay(page, day1);
	const card = wrappers(page).filter({ hasText: FLIGHT });
	await expect(card).toHaveCount(1);
	await expect(card).toContainText('Lands tomorrow 6:40a');
	await expect(card).toContainText('Evening');
	await expect(card).not.toHaveAttribute('data-pinned');
	// #498 rule: never a Span banner.
	await expect(page.locator('main').filter({ visible: true })).not.toContainText(
		/Night \d|Day \d of/
	);
});

test('landing day: a card by landing time that cannot be dragged off', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 812 });
	await openDay(page, day2);
	const card = wrappers(page).first();
	await expect(card).toHaveAttribute('aria-label', FLIGHT);
	await expect(card).toHaveAttribute('data-pinned', 'true');
	await expect(card).toContainText('Lands 6:40a · departed yesterday');
	await expect(card).toContainText('Morning');

	// Mouse-drag it onto the parking strip. A movable card would be unscheduled
	// (pushToParking); a pinned one never starts a drag.
	const from = (await card.boundingBox())!;
	const strip = page.locator('.parking-dropzone').filter({ visible: true }).first();
	const to = (await strip.boundingBox())!;
	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	for (let i = 1; i <= 12; i++)
		await page.mouse.move(
			from.x + from.width / 2,
			from.y + from.height / 2 + ((to.y + to.height / 2 - from.y - from.height / 2) * i) / 12
		);
	await page.mouse.up();
	await page.waitForTimeout(500);

	await page.reload({ waitUntil: 'networkidle' });
	await expect(wrappers(page).first()).toHaveAttribute('aria-label', FLIGHT);

	// Still scheduled on its departure day.
	await page.goto(`${BASE}/trips/${SLUG}/days/${day1}`, { waitUntil: 'networkidle' });
	await expect(wrappers(page).filter({ hasText: FLIGHT })).toHaveCount(1);
});

test('control: an ordinary card on the landing day still drags', async ({ page }) => {
	// Proves the gesture above is a real drag — otherwise the pinned test is vacuous.
	await page.setViewportSize({ width: 375, height: 812 });
	await openDay(page, day2);
	const card = wrappers(page).nth(1);
	const title = await card.getAttribute('aria-label');
	await expect(card).not.toHaveAttribute('data-pinned');
	const from = (await card.boundingBox())!;
	const strip = page.locator('.parking-dropzone').filter({ visible: true }).first();
	const to = (await strip.boundingBox())!;
	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	for (let i = 1; i <= 12; i++)
		await page.mouse.move(
			from.x + from.width / 2,
			from.y + from.height / 2 + ((to.y + to.height / 2 - from.y - from.height / 2) * i) / 12
		);
	await page.mouse.up();
	await expect(zone(page).locator(`> div[aria-label="${title}"]`)).toHaveCount(0, {
		timeout: 10000
	});
});
