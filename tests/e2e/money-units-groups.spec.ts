import { test, expect, type Browser } from '@playwright/test';

// #332 — Money Units "Groups" sub-tab lifecycle.
// Requires: PB on :8090 (or an isolated instance via PUBLIC_PB_URL) with
// WAYPOINT_DEV_MODE=true + E2E_TEST_EMAIL set. Uses the rules-fixture to bootstrap a
// trip with owner/co_owner/traveler/viewer (≥2 members → a unit is possible).
//
// Scope:
//   - Groups tab renders (Expenses · Budget · Groups) + teaching empty state
//   - Create a 2-member unit → appears in the list (even-share budget)
//   - Edit → set a custom budget → the card reflects it
//   - Leave a 2-member unit → dissolves (drops below 2) → empty state
//   - Create + Delete → empty state
// Dual-tree layout → scope every content/form locator to the visible subtree.

const BASE = 'http://localhost:4173';
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';

const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

const FIXTURE_SLUG = 'e2e-rules-test-groups';

async function devLogin(browser: Browser, email: string) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { ctx, page };
}

async function setupFixture(email: string): Promise<void> {
	const bypassRes = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	const { token } = (await bypassRes.json()) as { token: string };
	await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ emails: EMAILS, slug: FIXTURE_SLUG })
	});
}

test.describe('#332 Money Units — Groups sub-tab', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	const tripSlug = FIXTURE_SLUG;
	const GROUPS = `${BASE}/trips/${tripSlug}/groups`;

	test.beforeAll(async () => {
		await setupFixture(EMAILS.owner);
	});

	// Open the create sheet and make a 2-member unit. "You" is pre-checked but its
	// position varies (members sort by id), so check the first UNCHECKED box, then wait
	// until exactly 2 are checked before submitting (the hidden members field is derived
	// from checkbox state — submitting before it flushes would fail the ≥2 guard).
	async function createUnit(page: import('@playwright/test').Page) {
		await page.getByRole('button', { name: 'New group', exact: true }).filter({ visible: true }).first().click();
		await expect(page.getByText(/who shares a card/i).filter({ visible: true }).first()).toBeVisible({ timeout: 5000 });
		await page.locator('input[type="checkbox"]:visible:not(:checked)').first().check();
		await expect(page.locator('input[type="checkbox"]:visible:checked')).toHaveCount(2);
		await page.getByRole('button', { name: 'Create group', exact: true }).filter({ visible: true }).first().click();
	}

	test('groups tab renders with the 3-tab nav + teaching empty state', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);
		try {
			await page.setViewportSize({ width: 375, height: 812 });
			await page.goto(GROUPS);
			await expect(page.getByText(/no groups yet/i).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });
			// The three money sub-tabs are all present.
			for (const label of ['Expenses', 'Budget', 'Groups']) {
				await expect(page.getByRole('link', { name: label, exact: true }).filter({ visible: true }).first()).toBeVisible();
			}
			await expect(page.getByRole('button', { name: 'New group', exact: true }).filter({ visible: true }).first()).toBeVisible();
			// No horizontal overflow at 375px.
			const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
			const viewportWidth = await page.evaluate(() => window.innerWidth);
			expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
		} finally {
			await ctx.close();
		}
	});

	test('create → edit budget → leave dissolves the unit', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);
		try {
			await page.setViewportSize({ width: 375, height: 812 });
			await page.goto(GROUPS);
			await expect(page.getByText(/no groups yet/i).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });

			// Create.
			await createUnit(page);
			await expect(page.getByText(/even-share budget/i).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });

			// Edit → custom budget.
			await page.getByRole('button', { name: 'Edit', exact: true }).filter({ visible: true }).first().click();
			await expect(page.getByText(/who shares a card/i).filter({ visible: true }).first()).toBeVisible({ timeout: 5000 });
			await page.locator('input[name="budget_usd"]:visible').first().fill('200');
			await page.getByRole('button', { name: 'Save changes', exact: true }).filter({ visible: true }).first().click();
			await expect(page.getByText(/\(custom\)/i).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });
			await expect(page.getByText('$200.00').filter({ visible: true }).first()).toBeVisible();

			// Leave a 2-member unit → drops below 2 → dissolves → empty state.
			await page.getByRole('button', { name: 'Leave', exact: true }).filter({ visible: true }).first().click();
			await expect(page.getByText(/leave this group/i).filter({ visible: true }).first()).toBeVisible({ timeout: 5000 });
			await page.getByRole('button', { name: 'Leave', exact: true }).filter({ visible: true }).first().click();
			await expect(page.getByText(/no groups yet/i).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });
		} finally {
			await ctx.close();
		}
	});

	test('create → delete removes the unit', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);
		try {
			await page.setViewportSize({ width: 375, height: 812 });
			await page.goto(GROUPS);
			await expect(page.getByText(/no groups yet/i).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });

			await createUnit(page);
			await expect(page.getByText(/even-share budget/i).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });

			// Delete → confirm → gone.
			await page.getByRole('button', { name: 'Delete', exact: true }).filter({ visible: true }).first().click();
			await expect(page.getByText(/delete this group for everyone/i).filter({ visible: true }).first()).toBeVisible({ timeout: 5000 });
			await page.getByRole('button', { name: 'Delete', exact: true }).filter({ visible: true }).first().click();
			await expect(page.getByText(/no groups yet/i).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });
		} finally {
			await ctx.close();
		}
	});
});
