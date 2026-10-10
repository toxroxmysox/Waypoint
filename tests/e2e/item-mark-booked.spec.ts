import { test, expect, type Browser, type Page } from '@playwright/test';
import { E2E_BASE, E2E_PB_BASE } from './e2e-env';

// #441 (spec stories 64, 65): Book ↗ and Mark booked on the item page. Mark booked with a
// code, tick "Log what I paid next", land on the EXISTING Add expense prefilled from the
// estimate. Booked and paid stay separate (ADR-0014). AppShell renders each page twice, so
// locators are visible-scoped. Prefer `pnpm test:e2e:clean`.

const BASE = E2E_BASE;
const PB = E2E_PB_BASE;
const SLUG = 'e2e-mark-booked-441';
const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};
const EST = 180;

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

test.describe('Book and Mark booked (#441)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');
	test.describe.configure({ retries: 0 });

	let ownerToken = '';
	let tripId = '';
	let dayId = '';
	let dayDate = '';
	const ids: Record<string, string> = {};

	async function makeItem(key: string, title: string) {
		const it = await pb(ownerToken, 'POST', '/api/collections/items/records', {
			trip: tripId,
			day: dayId,
			type: 'lodging',
			title,
			start_time: `${dayDate} 15:00:00.000Z`,
			status: 'planned',
			requires_booking: true,
			booked: false,
			cost_estimate_usd: EST,
			reservation_url: 'https://example.com/book'
		});
		ids[key] = it.id;
	}

	test.beforeAll(async () => {
		const owner = await bypass(EMAILS.owner);
		ownerToken = owner.token;
		const fx = await pb(ownerToken, 'POST', '/api/dev/rules-fixture', { emails: EMAILS, slug: SLUG });
		tripId = fx.tripId;
		const day = (
			await pb(
				ownerToken,
				'GET',
				`/api/collections/days/records?filter=${encodeURIComponent(`trip="${tripId}"`)}&perPage=1&sort=date`
			)
		).items[0];
		dayId = day.id;
		dayDate = day.date.split(' ')[0];
		await makeItem('pay', 'Harbor Hotel');
		await makeItem('plain', 'Beach Cabin');
	});

	test('Mark booked with a code, then the prefilled Add expense', async ({ browser }) => {
		const { ctx, page } = await devLogin(browser, EMAILS.owner);
		try {
			await page.goto(`${BASE}/trips/${SLUG}/items/${ids.pay}`);
			await expect(page.getByRole('heading', { name: 'Harbor Hotel' }).filter({ visible: true }).first()).toBeVisible({
				timeout: 10000
			});
			await page.waitForLoadState('networkidle');

			const actions = vis(page, '[data-testid="hero-booking-actions"]').first();
			await expect(vis(page, '[data-needs-booking]').first()).toBeVisible();
			await expect(actions.getByRole('link', { name: /Book ↗/ })).toHaveAttribute('href', 'https://example.com/book');

			await actions.getByRole('button', { name: 'Mark booked' }).click();
			const form = vis(page, '[data-testid="mark-booked-form"]').first();
			await form.getByLabel(/Confirmation code/).fill('HB-4471');
			await form.getByLabel('Log what I paid next').check();
			await form.getByRole('button', { name: 'Save' }).click();

			// The existing Add expense, prefilled from the estimate.
			await page.waitForURL('**/expenses**', { timeout: 10000 });
			await expect(page.locator('input[name="amount_usd"]:visible').first()).toHaveValue(String(EST), { timeout: 5000 });
			await expect(page.locator('input[name="description"]:visible').first()).toHaveValue('Harbor Hotel');

			// Booked, not paid: no expense was written by Mark booked itself (ADR-0014).
			const expenses = await pb(
				ownerToken,
				'GET',
				`/api/collections/expenses/records?filter=${encodeURIComponent(`linked_item="${ids.pay}"`)}`
			);
			expect(expenses.items).toHaveLength(0);

			// The item is booked and carries the code.
			await page.goto(`${BASE}/trips/${SLUG}/items/${ids.pay}`);
			await page.waitForLoadState('networkidle');
			await expect(vis(page, '[data-testid="hero-booked"]').first()).toBeVisible();
			await expect(vis(page, '[data-needs-booking]')).toHaveCount(0);
			await expect(vis(page, '[data-testid="hero-booking-actions"]')).toHaveCount(0);
			await expect(page.getByText('HB-4471').filter({ visible: true }).first()).toBeVisible();
		} finally {
			await ctx.close();
		}
	});

	test('unticked: stays on the item page, booked, no expense screen', async ({ browser }) => {
		const { ctx, page } = await devLogin(browser, EMAILS.owner);
		try {
			await page.goto(`${BASE}/trips/${SLUG}/items/${ids.plain}`);
			await expect(page.getByRole('heading', { name: 'Beach Cabin' }).filter({ visible: true }).first()).toBeVisible({
				timeout: 10000
			});
			await page.waitForLoadState('networkidle');
			await vis(page, '[data-testid="hero-booking-actions"]').first().getByRole('button', { name: 'Mark booked' }).click();
			await vis(page, '[data-testid="mark-booked-form"]').first().getByRole('button', { name: 'Save' }).click();
			await expect(vis(page, '[data-testid="hero-booked"]').first()).toBeVisible({ timeout: 10000 });
			expect(page.url()).toContain(`/items/${ids.plain}`);
		} finally {
			await ctx.close();
		}
	});

	test('a traveler who did not create it, and a viewer, get no booking controls', async ({ browser }) => {
		// A fresh open item so the owner-booked ones above do not matter.
		await makeItem('gate', 'Mountain Lodge');
		for (const email of [EMAILS.traveler, EMAILS.viewer]) {
			const { ctx, page } = await devLogin(browser, email);
			try {
				await page.goto(`${BASE}/trips/${SLUG}/items/${ids.gate}`);
				await expect(page.getByRole('heading', { name: 'Mountain Lodge' }).filter({ visible: true }).first()).toBeVisible({
					timeout: 10000
				});
				await page.waitForLoadState('networkidle');
				await expect(vis(page, '[data-needs-booking]').first()).toBeVisible();
				await expect(vis(page, '[data-testid="hero-booking-actions"]')).toHaveCount(0);
			} finally {
				await ctx.close();
			}
		}
	});
});
