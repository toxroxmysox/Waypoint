import { test, expect, type Browser, type Page } from '@playwright/test';

// #387 — "expense tray sticks": after saving an expense, the add sheet came back.
//
// THE MECHANISM, so this file makes sense to the next reader: the expenses page
// opens its add sheet from `?action=add` (Trip Mode's Add, and a planned item's
// "Log payment", which also passes prefill params). It then tried to strip the
// params with SvelteKit's SHALLOW `replaceState` — but shallow `replaceState`
// never updates `page.url`. So the `?action=add` the app reads was never gone,
// and the `$effect` watching it reopened the sheet the moment the post-save
// `update()` re-rendered the page. With a prefill, #370's dirty guard then asked
// "Discard this expense?" before it would close — two taps to escape.
//
// WHY THIS SPEC EXISTS AT ALL: paid-moment.spec.ts already drives this exact
// flow and was green the whole time. It asserts the expense APPEARS after save.
// It never asserted the sheet GOES AWAY — which is the only thing the user felt.

const BASE = 'http://localhost:4173';
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';
const SLUG = 'e2e-expense-sheet-387';
const OWNER = 'rules-owner@e2e.test';
const EMAILS = {
	owner: OWNER,
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

async function bypass(email: string): Promise<{ token: string }> {
	const res = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	if (!res.ok) throw new Error(`auth-bypass ${email} failed: ${res.status}`);
	return res.json();
}

async function devLogin(browser: Browser) {
	const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(OWNER)}`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { ctx, page };
}

// Visible-scoped: AppShell renders every page TWICE (mobile + desktop trees, one
// CSS-hidden), so an unscoped count sees two sheets for one open sheet.
const openSheets = (page: Page) => page.locator('[data-sheet-panel]').filter({ visible: true });

/**
 * Reach `?action=add` the way a USER does — a client-side navigation.
 *
 * Trip Mode's Add does `goto('/trips/…/expenses?action=add')` and an item's
 * "Log payment" is a link: both are client navigations with the router already
 * running. A cold `page.goto` of the same URL is a different code path, and in
 * a first draft of this spec it never opened the sheet at all — every test went
 * red at SETUP, which looked like a reproduction and wasn't one. An injected
 * same-origin anchor click is intercepted by SvelteKit exactly like a real link.
 */
async function clientNavigate(page: Page, href: string) {
	await page.evaluate((h) => {
		const a = document.createElement('a');
		a.href = h;
		document.body.appendChild(a);
		a.click();
		a.remove();
	}, href);
}

/** Land on the expenses page first so the router is up, then navigate in. */
async function openAddVia(page: Page, query: string) {
	await page.goto(`${BASE}/trips/${SLUG}/expenses`);
	await page.waitForLoadState('networkidle');
	await clientNavigate(page, `/trips/${SLUG}/expenses?${query}`);
	await expect(openSheets(page), 'the add sheet should open from ?action=add').toHaveCount(1, {
		timeout: 10000
	});
}

/**
 * The sheet must be closed AND STAY closed. The reopen happened a beat after the
 * save — once `update()` re-rendered — so a single instantaneous check can pass
 * in the gap. Hold the assertion across that window instead.
 */
async function expectStaysClosed(page: Page) {
	await expect(openSheets(page)).toHaveCount(0, { timeout: 10000 });
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(1500);
	await expect(openSheets(page), 'the add sheet reopened after save (#387)').toHaveCount(0);
}

async function submitVisible(page: Page) {
	await page
		.getByRole('button', { name: 'Add Expense', exact: true })
		.filter({ visible: true })
		.first()
		.click();
}

test.describe('Expense sheet stays closed after save (#387)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');
	test.describe.configure({ retries: 0 });

	test.beforeAll(async () => {
		const owner = await bypass(OWNER);
		const res = await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
			body: JSON.stringify({ emails: EMAILS, slug: SLUG })
		});
		if (!res.ok) throw new Error(`rules-fixture failed: ${await res.text()}`);
	});

	test('a PREFILLED add (Log payment) closes on save and does not come back', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser);
		try {
			// Exactly what an item's "Log payment" deep-link produces.
			const title = `Snorkel ${Date.now()}`;
			await openAddVia(page, `action=add&amount=240&description=${encodeURIComponent(title)}`);
			await expect(page.locator('input[name="description"]:visible').first()).toHaveValue(title);

			await submitVisible(page);
			await expect(page.getByText(title).filter({ visible: true }).first()).toBeVisible({
				timeout: 10000
			});
			await expectStaysClosed(page);
		} finally {
			await ctx.close();
		}
	});

	test('a plain Trip-Mode Add (?action=add, no prefill) closes on save too', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser);
		try {
			const title = `Coffee ${Date.now()}`;
			await openAddVia(page, 'action=add');

			await page.locator('input[name="amount_usd"]:visible').first().fill('4.50');
			await page.locator('input[name="description"]:visible').first().fill(title);
			await submitVisible(page);

			await expect(page.getByText(title).filter({ visible: true }).first()).toBeVisible({
				timeout: 10000
			});
			await expectStaysClosed(page);
		} finally {
			await ctx.close();
		}
	});

	test('the FAB path still works — and a second add opens clean, not prefilled', async ({
		browser
	}) => {
		const { page, ctx } = await devLogin(browser);
		try {
			// Arrive via the prefilled deep-link first, save it, then use the FAB.
			// If the consumed `?action=add` leaked, the FAB's sheet would open carrying
			// the previous prefill — which would be its own version of this bug.
			const first = `Taxi ${Date.now()}`;
			await openAddVia(page, `action=add&amount=30&description=${encodeURIComponent(first)}`);
			await submitVisible(page);
			await expectStaysClosed(page);

			await page.getByRole('button', { name: 'Add expense' }).filter({ visible: true }).first().click();
			await expect(openSheets(page)).toHaveCount(1, { timeout: 10000 });
			await expect(page.locator('input[name="description"]:visible').first()).toHaveValue('');
		} finally {
			await ctx.close();
		}
	});
});
