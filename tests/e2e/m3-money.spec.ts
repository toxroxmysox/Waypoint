import { test, expect, type Browser } from '@playwright/test';

// M3 Money E2E.
// Requires: PB on :8090 with WAYPOINT_DEV_MODE=true + E2E_TEST_EMAILS set.
// Uses the rules-fixture to bootstrap a trip with owner, co_owner, traveler, viewer.
//
// Scope:
//   - Expenses page empty state
//   - Add expense via FAB → form → verify in list
//   - Budget page: set budget, save, verify
//   - Budget-vs-actual summary appears on expenses page
//   - Settle up flow accessible
//   - Mobile responsive at 375px for expenses + budget

const BASE = 'http://localhost:4173';
const PB_BASE = 'http://127.0.0.1:8090';

const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

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
		body: JSON.stringify({ emails: EMAILS })
	});
}

test.describe('M3 Money', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	const tripSlug = 'e2e-rules-test';

	test.beforeAll(async () => {
		await setupFixture(EMAILS.owner);
	});

	test('expenses page shows empty state initially', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);

		try {
			await page.goto(`${BASE}/trips/${tripSlug}/expenses`);
			await expect(page.getByText(/no expenses yet/i)).toBeVisible({ timeout: 10000 });
			await expect(page.getByRole('button', { name: /add expense/i })).toBeVisible();
		} finally {
			await ctx.close();
		}
	});

	test('add expense via FAB, verify it appears in list', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);

		try {
			await page.goto(`${BASE}/trips/${tripSlug}/expenses`);

			// Open Add Expense sheet via FAB
			await page.getByRole('button', { name: /add expense/i }).click();
			await expect(page.getByText(/amount/i)).toBeVisible({ timeout: 5000 });

			// Fill the form
			await page.fill('input[name="amount_usd"]', '42.50');
			await page.fill('input[name="description"]', 'E2E Test Dinner');

			// Submit (the form's submit button, not the FAB)
			await page.getByRole('button', { name: 'Add Expense', exact: true }).click();

			// Expense should appear in list
			await expect(page.getByText('E2E Test Dinner')).toBeVisible({ timeout: 10000 });
			await expect(page.getByText('$42.50')).toBeVisible();
		} finally {
			await ctx.close();
		}
	});

	test('budget page loads with categories, save works', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);

		try {
			await page.goto(`${BASE}/trips/${tripSlug}/budget`);

			// Category labels visible
			await expect(page.getByText('Lodging')).toBeVisible({ timeout: 10000 });
			await expect(page.getByText('Food')).toBeVisible();
			await expect(page.getByText('Transport')).toBeVisible();

			// Grand total header visible
			await expect(page.getByText(/estimated total/i)).toBeVisible();

			// Save button visible for owner
			await expect(page.getByRole('button', { name: /save budget/i })).toBeVisible();

			// Click Save Budget
			await page.getByRole('button', { name: /save budget/i }).click();
			await expect(page.getByText(/budget saved/i)).toBeVisible({ timeout: 5000 });
		} finally {
			await ctx.close();
		}
	});

	test('settle up flow opens from expenses page', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);

		try {
			await page.goto(`${BASE}/trips/${tripSlug}/expenses`);

			// After adding an expense in a prior test, either settle up button or
			// "all squared up" banner should be visible (depends on split config).
			// At minimum the expense list should not be empty.
			await expect(page.getByText('E2E Test Dinner')).toBeVisible({ timeout: 10000 });

			// If there are debts, the Settle Up button is shown.
			const settleBtn = page.getByRole('button', { name: /settle up/i });
			const squaredUp = page.getByText(/all squared up/i);

			const hasSettle = await settleBtn.isVisible().catch(() => false);
			const hasSquared = await squaredUp.isVisible().catch(() => false);

			expect(hasSettle || hasSquared).toBe(true);

			if (hasSettle) {
				await settleBtn.click();
				// Settle Up sheet should open — use .first() because both
				// the button label and a <p> contain "payment(s) needed"
				await expect(page.getByText(/payment.*needed/i).first()).toBeVisible({ timeout: 5000 });
			}
		} finally {
			await ctx.close();
		}
	});

	test('mobile responsive: expenses page at 375px', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);

		try {
			await page.setViewportSize({ width: 375, height: 812 });
			await page.goto(`${BASE}/trips/${tripSlug}/expenses`);
			// Wait for page to load — either expenses exist or the empty state shows
			await expect(
				page.getByText('E2E Test Dinner').or(page.getByText(/no expenses yet/i))
			).toBeVisible({ timeout: 10000 });

			const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
			const viewportWidth = await page.evaluate(() => window.innerWidth);
			expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
		} finally {
			await ctx.close();
		}
	});

	test('mobile responsive: budget page at 375px', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);

		try {
			await page.setViewportSize({ width: 375, height: 812 });
			await page.goto(`${BASE}/trips/${tripSlug}/budget`);
			await expect(page.getByText('Lodging')).toBeVisible({ timeout: 10000 });

			const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
			const viewportWidth = await page.evaluate(() => window.innerWidth);
			expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
		} finally {
			await ctx.close();
		}
	});
});
