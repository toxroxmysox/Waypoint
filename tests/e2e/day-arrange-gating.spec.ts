import { test, expect, type Browser } from '@playwright/test';
import { E2E_BASE, E2E_PB_BASE } from './e2e-env';

// #499 — the day page's arrange controls are role-gated like the item page (#416).
//   - Pull-up chevron: only on ideas the viewer may move (owner/co_owner, or creator).
//   - reorder / drag-to-plan rebalance the whole day → owner/co_owner only; a
//     traveler's POST is a 403, not a 500.

const BASE = E2E_BASE;
const PB_BASE = E2E_PB_BASE;

const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

const FIXTURE_SLUG = 'e2e-rules-test-dayarrange';

type Fixture = {
	tripId: string;
	dayId: string;
	itemId: string;
	memberIds: Record<string, string>;
};

async function token(email: string): Promise<string> {
	const res = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	return ((await res.json()) as { token: string }).token;
}

async function setupFixture(): Promise<Fixture> {
	const t = await token(EMAILS.owner);
	const res = await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
		body: JSON.stringify({ emails: EMAILS, slug: FIXTURE_SLUG })
	});
	const fx = (await res.json()) as Fixture;
	// One owner-created idea in the day's phase (days carry their phases): the
	// parking lot's only card.
	const day = (await (
		await fetch(`${PB_BASE}/api/collections/days/records/${fx.dayId}`, {
			headers: { Authorization: `Bearer ${t}` }
		})
	).json()) as { phases: string[] };
	const created = await fetch(`${PB_BASE}/api/collections/items/records`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
		body: JSON.stringify({
			trip: fx.tripId,
			phase: day.phases[0],
			type: 'activity',
			title: 'Owner idea (#499)',
			status: 'unplanned',
			created_by: fx.memberIds.owner
		})
	});
	if (!created.ok) throw new Error(`idea seed failed: ${created.status} ${await created.text()}`);
	return fx;
}

async function devLogin(browser: Browser, email: string) {
	// 375px: the parking divider (mobile/tablet) is where the chevron lives.
	const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { ctx, page };
}

test.describe('#499 day page arrange gating', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');
	test.describe.configure({ mode: 'serial' });

	let fx: Fixture;
	test.beforeAll(async () => {
		fx = await setupFixture();
	});

	async function chevronCount(browser: Browser, email: string): Promise<number> {
		const s = await devLogin(browser, email);
		try {
			await s.page.goto(`${BASE}/trips/${FIXTURE_SLUG}/days/${fx.dayId}`, {
				waitUntil: 'networkidle'
			});
			// Expand the (collapsed) parking divider so the idea cards render.
			await s.page
				.getByRole('button', { name: /Parking lot/ })
				.filter({ visible: true })
				.first()
				.click();
			await expect(
				s.page.getByText('Owner idea (#499)').filter({ visible: true }).first()
			).toBeVisible();
			return await s.page
				.getByRole('button', { name: 'Pull up to plan' })
				.filter({ visible: true })
				.count();
		} finally {
			await s.ctx.close();
		}
	}

	test('owner sees the pull-up chevron on the idea', async ({ browser }) => {
		expect(await chevronCount(browser, EMAILS.owner)).toBeGreaterThan(0);
	});

	test("traveler sees no chevron on someone else's idea", async ({ browser }) => {
		expect(await chevronCount(browser, EMAILS.traveler)).toBe(0);
	});

	test('traveler reorder POST is refused with 403', async ({ browser }) => {
		const s = await devLogin(browser, EMAILS.traveler);
		try {
			const res = await s.page.request.post(
				`${BASE}/trips/${FIXTURE_SLUG}/days/${fx.dayId}?/reorder`,
				{
					headers: { 'x-sveltekit-action': 'true', origin: BASE },
					form: { item_id: fx.itemId, order: fx.itemId }
				}
			);
			const body = (await res.json()) as { type: string; status?: number };
			expect(body.type).toBe('failure');
			expect(body.status).toBe(403);
		} finally {
			await s.ctx.close();
		}
	});
});
