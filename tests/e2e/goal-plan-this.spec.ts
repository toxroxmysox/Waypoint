import { test, expect, type Browser } from '@playwright/test';

// #263 — Goal → "Plan this" pathway (items/new?goal={id}).
//
// Binding acceptance (issue #263):
//   - A Trip Goal surfaces a "Plan this" action.
//   - It routes to the item composer pre-filled from the goal (title/notes).
//   - The new item links back to the originating goal (goal-side `items` relation).
//
// The rules-fixture seeds one goal titled "Test Goal" (authored by the traveler)
// and returns its id as `goalId`. We drive the OWNER (direct-create path — a
// traveler would reroute through suggestions) so the created item exists
// immediately and the goal-side link is assertable via ground truth.
//
// Dual-tree scar (cerebrum): the item-form title input has a duplicate id across
// the responsive trees, so target the visible subtree via input[name=...]:visible.

const BASE = 'http://localhost:4173';
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';

const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

const FIXTURE_SLUG = 'e2e-rules-test-goalplan';

type FixtureIds = { tripId: string; goalId: string };

async function token(email: string): Promise<string> {
	const res = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	const { token } = (await res.json()) as { token: string };
	return token;
}

async function setupFixture(): Promise<FixtureIds> {
	const t = await token(EMAILS.owner);
	const res = await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
		body: JSON.stringify({ emails: EMAILS, slug: FIXTURE_SLUG })
	});
	return (await res.json()) as FixtureIds;
}

async function devLogin(browser: Browser, email: string) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { ctx, page };
}

test.describe('#263 Goal → "Plan this"', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	let ids: FixtureIds;

	test.beforeAll(async () => {
		ids = await setupFixture();
	});

	test('goal detail surfaces "Plan this" → composer prefilled from the goal → item links back', async ({
		browser
	}) => {
		const owner = await devLogin(browser, EMAILS.owner);
		try {
			// The goal detail surfaces the "Plan this" affordance.
			await owner.page.goto(`${BASE}/trips/${FIXTURE_SLUG}/goals/${ids.goalId}`);
			const planThis = owner.page
				.getByRole('link', { name: /plan this/i })
				.filter({ visible: true })
				.first();
			await expect(planThis).toBeVisible({ timeout: 10000 });

			// It routes to the composer carrying the goal id.
			await planThis.click();
			await owner.page.waitForURL(new RegExp(`/items/new\\?goal=${ids.goalId}`), { timeout: 10000 });

			// Title is pre-filled from the goal ("Test Goal"). Target the visible tree.
			const titleField = owner.page.locator('input[name="title"]:visible').first();
			await expect(titleField).toHaveValue(/test goal/i, { timeout: 10000 });

			// The originating goal is pre-checked under "Addresses goal(s)".
			const goalCheckbox = owner.page
				.locator(`input[name="goals"][value="${ids.goalId}"]:visible`)
				.first();
			await expect(goalCheckbox).toBeChecked();

			// Give the item a phase so the unscheduled-item invariant passes, then submit.
			// (The fixture trip has phases; an unscheduled item needs one.) The phase
			// select sits in the form — pick its first real option in the visible tree.
			const itemTitle = `Plan-this item ${Date.now()}`;
			await titleField.fill(itemTitle);

			const phaseSelect = owner.page.locator('select[name="phase"]:visible').first();
			if (await phaseSelect.count()) {
				const optionValue = await phaseSelect
					.locator('option')
					.nth(1)
					.getAttribute('value')
					.catch(() => null);
				if (optionValue) await phaseSelect.selectOption(optionValue);
			}

			// Submit via Enter on the title (cerebrum: the fixed Save bar can be
			// occlusion-stolen on a synthetic click at mobile).
			await titleField.press('Enter');

			// Owner direct-create lands away from the composer (overview / day view).
			await owner.page.waitForURL((url) => !url.pathname.endsWith('/items/new'), {
				timeout: 15000
			});
		} finally {
			await owner.ctx.close();
		}

		// Ground truth: the goal now links the new item (goal-side `items` relation).
		const ownerToken = await token(EMAILS.owner);
		const goalRes = await fetch(
			`${PB_BASE}/api/collections/trip_goals/records/${ids.goalId}`,
			{ headers: { Authorization: `Bearer ${ownerToken}` } }
		);
		const goalRec = (await goalRes.json()) as { items: string[] };
		expect(Array.isArray(goalRec.items)).toBe(true);
		expect(goalRec.items.length).toBeGreaterThan(0);
	});
});
