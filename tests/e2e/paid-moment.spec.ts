import { test, expect, type Browser } from '@playwright/test';

// Paid-Moment affordance + prefilled add-expense (#265 / ADR-0014) E2E.
// Requires: WAYPOINT_DEV_MODE=true + E2E_TEST_EMAILS (whitelisted bypass emails).
// Prefer `pnpm test:e2e:clean` (isolated PB on :8097) per CLAUDE.md.
//
// Covers the slice's two layers end-to-end:
//   - Substrate (#228): the item's "Log payment" deep-link opens the add-expense
//     composer PREFILLED — amount ← cost_estimate_usd, description ← title,
//     linked_item ← this item (round-tripped through ?action=add).
//   - Affordance + DERIVED paid (#229 / ADR-0014): the item detail shows "Log payment"
//     when it has 0 linked expenses, and flips to "Paid $X" once ≥1 expense links it.
//     "Paid" is derived from the linked-expense predicate — there is NO `paid` flag.
//
// A cost-bearing `activity` item (estimate $240) is seeded so amount-prefill is provable.

const BASE = 'http://localhost:4173';
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';
const SLUG = 'e2e-paid-moment-265';

const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

interface Bypass {
	token: string;
	record: { id: string };
}

async function bypass(email: string): Promise<Bypass> {
	const res = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	if (!res.ok) throw new Error(`auth-bypass ${email} failed: ${res.status} ${await res.text()}`);
	return res.json();
}

async function pb(
	method: string,
	path: string,
	token: string,
	body?: unknown
): Promise<{ status: number; data: any }> {
	const res = await fetch(`${PB_BASE}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: body ? JSON.stringify(body) : undefined
	});
	let data: any = null;
	try {
		data = await res.json();
	} catch {
		/* empty body */
	}
	return { status: res.status, data };
}

async function devLogin(browser: Browser, email: string) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { ctx, page };
}

const EST = 240;
const ITEM_TITLE = 'Snorkeling tour';

test.describe('Paid-Moment affordance + prefilled add-expense (#265)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');
	// The fixture trip is seeded once in beforeAll under a fixed slug; a Playwright
	// retry would re-run beforeAll and collide on the slug (and the cross-test state —
	// the linked expense flips paid — is order-dependent). These assertions are
	// deterministic, so a failure is a real bug, not flake: no retries here.
	test.describe.configure({ retries: 0 });

	let itemId = '';

	test.beforeAll(async () => {
		const owner = await bypass(EMAILS.owner);

		const fixtureRes = await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
			body: JSON.stringify({ emails: EMAILS, slug: SLUG })
		});
		if (!fixtureRes.ok) throw new Error(`rules-fixture failed: ${await fixtureRes.text()}`);
		const { tripId } = (await fixtureRes.json()) as { tripId: string };

		// A cost-bearing activity item so amount-prefill (estimate → amount) is provable.
		const firstDay = await pb(
			'GET',
			`/api/collections/days/records?filter=${encodeURIComponent(`trip="${tripId}"`)}&perPage=1&sort=date`,
			owner.token
		);
		const dayId = firstDay.data.items?.[0]?.id;
		const created = await pb('POST', `/api/collections/items/records`, owner.token, {
			trip: tripId,
			day: dayId,
			type: 'activity',
			title: ITEM_TITLE,
			booked: false,
			cost_estimate_usd: EST,
			status: 'planned'
		});
		itemId = created.data.id;
		if (!itemId) throw new Error(`item seed failed: ${created.status} ${JSON.stringify(created.data)}`);
	});

	test('0 linked expenses → item shows "Log payment" (derived, not booked)', async ({
		browser
	}) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);
		try {
			await page.setViewportSize({ width: 375, height: 812 });
			await page.goto(`${BASE}/trips/${SLUG}/items/${itemId}`);

			// Derived paid state = false (no linked expense) → the affordance is "Log payment".
			await expect(
				page.getByRole('link', { name: /log payment/i }).filter({ visible: true }).first()
			).toBeVisible({ timeout: 10000 });
			// And NOT the paid summary.
			await expect(page.getByText(/^Paid \$/).filter({ visible: true })).toHaveCount(0);
		} finally {
			await ctx.close();
		}
	});

	test('"Log payment" opens the composer PREFILLED from the item (#228)', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);
		try {
			await page.setViewportSize({ width: 375, height: 812 });
			await page.goto(`${BASE}/trips/${SLUG}/items/${itemId}`);

			await page
				.getByRole('link', { name: /log payment/i })
				.filter({ visible: true })
				.first()
				.click();

			// Lands on the expenses page with the add sheet open (?action=add deep-link).
			await page.waitForURL('**/expenses**', { timeout: 10000 });

			// Composer is prefilled: amount ← estimate, description ← item title.
			const amount = page.locator('input[name="amount_usd"]:visible').first();
			const description = page.locator('input[name="description"]:visible').first();
			await expect(amount).toHaveValue(String(EST), { timeout: 5000 });
			await expect(description).toHaveValue(ITEM_TITLE);

			// linked_item is round-tripped as a hidden field so the expense links back.
			// (Dual-tree layout renders the form in both subtrees → ≥1, never exactly 1.)
			expect(
				await page.locator(`input[name="linked_item"][value="${itemId}"]`).count()
			).toBeGreaterThanOrEqual(1);

			// Submit the prefilled expense.
			await page
				.getByRole('button', { name: 'Add Expense', exact: true })
				.filter({ visible: true })
				.first()
				.click();

			await expect(
				page.getByText(ITEM_TITLE).filter({ visible: true }).first()
			).toBeVisible({ timeout: 10000 });
		} finally {
			await ctx.close();
		}
	});

	test('≥1 linked expense → item flips to "Paid $X" (derived) with a link-out', async ({
		browser
	}) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);
		try {
			await page.setViewportSize({ width: 375, height: 812 });
			// The prior test linked an expense to this item; the derived paid state flips.
			await page.goto(`${BASE}/trips/${SLUG}/items/${itemId}`);

			const paid = page
				.getByRole('link', { name: new RegExp(`Paid \\$${EST}`) })
				.filter({ visible: true })
				.first();
			await expect(paid).toBeVisible({ timeout: 10000 });

			// The flip replaces "Log payment" — never nags to log again.
			await expect(
				page.getByRole('link', { name: /log payment/i }).filter({ visible: true })
			).toHaveCount(0);

			// Link-out targets the item-filtered expenses view.
			await expect(paid).toHaveAttribute('href', new RegExp(`/expenses\\?item=${itemId}`));
		} finally {
			await ctx.close();
		}
	});

	test('viewer never sees the "Log payment" affordance', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.viewer);
		try {
			await page.goto(`${BASE}/trips/${SLUG}/items/${itemId}`);
			// The item is already paid, so a viewer sees the read-only "Paid $X" summary
			// (a plain link-out) but must NEVER get the write affordance.
			await expect(
				page.getByText(ITEM_TITLE).filter({ visible: true }).first()
			).toBeVisible({ timeout: 10000 });
			await expect(
				page.getByRole('link', { name: /log payment/i }).filter({ visible: true })
			).toHaveCount(0);
		} finally {
			await ctx.close();
		}
	});
});
