import { test, expect, type Browser, type Page } from '@playwright/test';
import { E2E_BASE, E2E_PB_BASE } from './e2e-env';

// #440 (CARD_SYSTEM D6): "Are you going?" on the item page Hero. Answer Going, change
// to Not going, see the struck bubble on the day page; no "+ Me" anywhere; viewers
// get no controls. AppShell renders each page twice, so locators are visible-scoped.
// Prefer `pnpm test:e2e:clean`.

const BASE = E2E_BASE;
const PB = E2E_PB_BASE;
const SLUG = 'e2e-item-going-440';
const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

async function bypass(email: string): Promise<{ token: string }> {
	const res = await fetch(`${PB}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	if (!res.ok) throw new Error(`auth-bypass: ${res.status}`);
	return res.json();
}

async function pb(token: string, method: string, path: string, body?: unknown) {
	const res = await fetch(`${PB}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const data = (await res.json().catch(() => ({}))) as any;
	if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(data)}`);
	return data;
}

async function devLogin(browser: Browser, email: string, width = 375, height = 900) {
	const ctx = await browser.newContext({ viewport: { width, height } });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { ctx, page };
}

const vis = (page: Page, sel: string) => page.locator(sel).filter({ visible: true });

test.describe('Are you going? (#440)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');
	test.describe.configure({ retries: 0 });

	const TITLE = 'Boat tour';
	let itemId = '';
	let dayId = '';

	test.beforeAll(async () => {
		const owner = await bypass(EMAILS.owner);
		const fx = await pb(owner.token, 'POST', '/api/dev/rules-fixture', { emails: EMAILS, slug: SLUG });
		const day = (
			await pb(
				owner.token,
				'GET',
				`/api/collections/days/records?filter=${encodeURIComponent(`trip="${fx.tripId}"`)}&perPage=1&sort=date`
			)
		).items[0];
		dayId = day.id;
		const item = await pb(owner.token, 'POST', '/api/collections/items/records', {
			trip: fx.tripId,
			day: day.id,
			type: 'activity',
			title: TITLE,
			start_time: `${day.date.split(' ')[0]} 10:00:00.000Z`,
			status: 'planned',
			assigned_to: [fx.memberIds.owner]
		});
		itemId = item.id;
	});

	test('answer Going, change to Not going, see the struck bubble on the day page', async ({ browser }) => {
		const { ctx, page } = await devLogin(browser, EMAILS.traveler);
		try {
			await page.goto(`${BASE}/trips/${SLUG}/items/${itemId}`);
			await expect(page.getByRole('heading', { name: TITLE }).filter({ visible: true }).first()).toBeVisible({
				timeout: 10000
			});
			await page.waitForLoadState('networkidle');
			const answer = vis(page, '[data-testid="going-answer"]').first();
			await expect(answer).toContainText('Are you going?');
			await answer.getByRole('button', { name: 'Going', exact: true }).click();
			await expect(answer).toContainText("You're going");
			await expect(answer).toContainText('change');
			// Others' bubbles carry names; the owner is going.
			await expect(vis(page, '[data-testid="hero-going"]').first()).toContainText('Going');

			await answer.getByRole('button', { name: 'change' }).click();
			await answer.getByRole('button', { name: 'Not going', exact: true }).click();
			await expect(answer).toContainText("You're not going");
			await expect(vis(page, '[data-testid="hero-not-going"]').first()).toBeVisible();

			// Survives a reload.
			await page.reload();
			await page.waitForLoadState('networkidle');
			await expect(vis(page, '[data-testid="going-answer"]').first()).toContainText("You're not going");

			// Day page: a struck bubble after the going one, and no "+ Me" chip.
			await page.goto(`${BASE}/trips/${SLUG}/days/${dayId}`);
			await expect(page.getByText(TITLE).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });
			await page.waitForLoadState('networkidle');
			await expect(page.locator('[aria-label$=", not going"]').filter({ visible: true }).first()).toBeVisible();
			await expect(page.getByText('+ Me', { exact: true }).filter({ visible: true })).toHaveCount(0);
		} finally {
			await ctx.close();
		}
	});

	test('viewers get no Going controls', async ({ browser }) => {
		const { ctx, page } = await devLogin(browser, EMAILS.viewer);
		try {
			await page.goto(`${BASE}/trips/${SLUG}/items/${itemId}`);
			await expect(page.getByRole('heading', { name: TITLE }).filter({ visible: true }).first()).toBeVisible({
				timeout: 10000
			});
			await page.waitForLoadState('networkidle');
			await expect(vis(page, '[data-testid="going-answer"]')).toHaveCount(0);
			await expect(vis(page, '[data-testid="hero-going"]').first()).toContainText('Going');
		} finally {
			await ctx.close();
		}
	});
});
