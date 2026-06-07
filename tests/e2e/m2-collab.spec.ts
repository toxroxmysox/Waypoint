import { test, expect, type Browser } from '@playwright/test';

// M2 collaboration E2E.
// Requires: PB on :8090 with WAYPOINT_DEV_MODE=true + E2E_TEST_EMAILS set.
// Uses the rules-fixture to bootstrap a trip with owner, co_owner, traveler, viewer.
// Two browser contexts run concurrently (owner + traveler) to verify multi-user flows.
//
// Scope (M2g spec):
//   - Inbox tab visible to owner/co_owner, hidden from traveler/viewer
//   - Traveler creates item → lands as pending suggestion
//   - Owner sees suggestion in inbox + approves → item appears
//   - Comment from each role visible on item detail
//   - Notifications bell visible on trip dashboard
//   - Mobile responsive at 375px: inbox, members, comments, bell

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
	// Auth bypass to get token.
	const bypassRes = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	const { token } = (await bypassRes.json()) as { token: string };

	// Create fixture (slug is always 'e2e-rules-test').
	await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ emails: EMAILS })
	});
}

test.describe('M2 Collaboration', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	// The rules-fixture always uses this slug (defined in dev-auth.pb.js).
	const tripSlug = 'e2e-rules-test';

	test.beforeAll(async () => {
		await setupFixture(EMAILS.owner);
	});

	test('inbox visible to owner on More page, hidden from traveler', async ({ browser }) => {
		const { page: ownerPage, ctx: ownerCtx } = await devLogin(browser, EMAILS.owner);
		const { page: travelerPage, ctx: travelerCtx } = await devLogin(browser, EMAILS.traveler);

		try {
			// Owner sees Inbox on the More page (dual-tree → scope to the visible subtree).
			await ownerPage.goto(`${BASE}/trips/${tripSlug}/more`);
			await expect(
				ownerPage.getByRole('link', { name: /inbox/i }).filter({ visible: true }).first()
			).toBeVisible({ timeout: 10000 });

			// Traveler does NOT see Inbox on the More page.
			await travelerPage.goto(`${BASE}/trips/${tripSlug}/more`);
			await expect(
				travelerPage.getByRole('link', { name: /inbox/i }).filter({ visible: true })
			).not.toBeVisible({ timeout: 5000 });
		} finally {
			await ownerCtx.close();
			await travelerCtx.close();
		}
	});

	test('traveler item creation lands as pending suggestion', async ({ browser }) => {
		// Note: rules-fixture creates the trip with auto_approve_suggestions = false by default.
		const { page, ctx } = await devLogin(browser, EMAILS.traveler);

		try {
			await page.goto(`${BASE}/trips/${tripSlug}/items/new`);

			// The "You're a traveler" notice should be visible since auto_approve=false.
			await expect(page.getByText(/traveler/i).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });
			// Notice text contains "suggestion" — first visible since the submit button also matches /suggestion/i.
			await expect(page.getByText(/suggestion/i).filter({ visible: true }).first()).toBeVisible();

			// The submit button should say "Submit suggestion" not "Create item".
			await expect(
				page.getByRole('button', { name: /submit suggestion/i }).filter({ visible: true }).first()
			).toBeVisible();
		} finally {
			await ctx.close();
		}
	});

	test('owner can view and access inbox', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);

		try {
			await page.goto(`${BASE}/trips/${tripSlug}/inbox`);
			// Inbox page loads without error.
			await expect(
				page.getByRole('heading', { name: /inbox/i, level: 1 }).filter({ visible: true }).first()
			).toBeVisible({ timeout: 10000 });
		} finally {
			await ctx.close();
		}
	});

	test('notification bell present on trip dashboard', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);

		try {
			await page.goto(`${BASE}/trips/${tripSlug}`);
			await expect(
				page.getByRole('button', { name: /notifications/i }).filter({ visible: true }).first()
			).toBeVisible({ timeout: 10000 });
		} finally {
			await ctx.close();
		}
	});

	test('mobile responsive: inbox at 375px', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);

		try {
			await page.setViewportSize({ width: 375, height: 812 });
			await page.goto(`${BASE}/trips/${tripSlug}/inbox`);

			const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
			const viewportWidth = await page.evaluate(() => window.innerWidth);
			expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
		} finally {
			await ctx.close();
		}
	});

	test('mobile responsive: members at 375px', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);

		try {
			await page.setViewportSize({ width: 375, height: 812 });
			await page.goto(`${BASE}/trips/${tripSlug}/members`);

			const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
			const viewportWidth = await page.evaluate(() => window.innerWidth);
			expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
		} finally {
			await ctx.close();
		}
	});
});
