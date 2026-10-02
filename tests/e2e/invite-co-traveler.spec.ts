import { test, expect, type Browser } from '@playwright/test';
import { E2E_BASE } from './e2e-env';

// #352 — invite a past co-traveler without knowing their email.
//
// Binding acceptance (Scott's "Grill DECIDED 2026-09-17"):
//   - The members page lists people you've shared a trip with: NAME + AVATAR
//     only, never an address.
//   - Picking someone creates a PENDING INVITE they accept (no direct add),
//     through the existing pending_invites + invite-email flow.
//   - The pool excludes tombstoned memberships, placeholders with no account,
//     yourself, and anyone already on (or already invited to) this trip.
//   - The inviter must never see the address — not in the HTML, not in a form
//     value, not in the action's response.
//
// Fixture (/api/dev/cotraveler-fixture) seeds two trips:
//   PAST   — owner + co_owner + traveler, plus viewer and non_member TOMBSTONED
//   TARGET — owner + traveler (already a member here)
// so the owner's pool on TARGET is exactly [co_owner].
//
// Isolation note: the pool is GLOBAL to the user, so a fixture sharing the
// rules-* owner with the other spec files would inherit their trips' members
// and make the exclusion assertions order-dependent. The owner here is
// E2E_TEST_EMAIL, whose only multi-member trips are the two this file seeds.

const BASE = E2E_BASE;
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';

const OWNER_EMAIL = process.env.E2E_TEST_EMAIL ?? 'e2e@waypoint.local';
const EMAILS = {
	owner: OWNER_EMAIL,
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

const PREFIX = 'e2e-cotraveler';
const TARGET_SLUG = `${PREFIX}-target`;
const PAST_SLUG = `${PREFIX}-past`;

type Fixture = {
	targetTripId: string;
	userIds: Record<string, string>;
};

let fixture: Fixture;

async function token(email: string): Promise<string> {
	const res = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	const { token } = (await res.json()) as { token: string };
	return token;
}

async function setupFixture(): Promise<Fixture> {
	const t = await token(EMAILS.owner);
	const res = await fetch(`${PB_BASE}/api/dev/cotraveler-fixture`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
		body: JSON.stringify({ emails: EMAILS, prefix: PREFIX })
	});
	if (!res.ok) throw new Error(`cotraveler-fixture failed: ${await res.text()}`);
	return (await res.json()) as Fixture;
}

async function devLogin(browser: Browser, email: string) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { ctx, page };
}

test.describe('#352 past co-traveler picker', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	// Re-seeded per test: the happy path consumes the one poolable co-traveler
	// (an open invite drops them from the pool), so tests must not inherit each
	// other's state.
	test.beforeEach(async () => {
		fixture = await setupFixture();
	});

	test('picker lists a past co-traveler by name, and excludes members + tombstones', async ({
		browser
	}) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);
		try {
			await page.goto(`${BASE}/trips/${TARGET_SLUG}/members`);

			// Dual-tree: AppShell renders the page twice, one copy CSS-hidden.
			const picker = page
				.locator('[data-testid="co-traveler-picker"]')
				.filter({ visible: true })
				.first();
			await expect(picker).toBeVisible({ timeout: 10000 });

			const rows = picker.locator('[data-testid="co-traveler-row"]');
			await expect(rows).toHaveCount(1);
			await expect(rows.first()).toContainText('E2E co_owner');

			// Excluded: already an active member of THIS trip.
			await expect(picker.getByText('E2E traveler')).toHaveCount(0);
			// Excluded: tombstoned on the only shared trip (real removal shape —
			// removed_at stamped, `user` severed).
			await expect(picker.getByText('E2E viewer')).toHaveCount(0);
			// Excluded: tombstoned with `user` retained — the shape that catches a
			// pool query missing `&& removed_at = ""` (#133 invariant).
			await expect(picker.getByText('E2E non_member')).toHaveCount(0);
			// Excluded: yourself — the single row above is the co_owner, so the
			// owner's own account never appears in their own pool.

			// No address anywhere on the page — the whole point of the feature.
			const html = await page.content();
			expect(html).not.toContain('rules-coowner@e2e.test');
			expect(html).not.toContain('@e2e.test');
		} finally {
			await ctx.close();
		}
	});

	test('picking a co-traveler creates a pending invite, and never reveals their email', async ({
		browser
	}) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);
		try {
			// Capture the form action's own response body: the address must not be
			// in the payload either, not just absent from the rendered DOM.
			const actionBodies: string[] = [];
			page.on('response', async (res) => {
				if (res.url().includes('inviteCoTraveler')) {
					actionBodies.push(await res.text().catch(() => ''));
				}
			});

			await page.goto(`${BASE}/trips/${TARGET_SLUG}/members`);
			const picker = page
				.locator('[data-testid="co-traveler-picker"]')
				.filter({ visible: true })
				.first();
			await expect(picker).toBeVisible({ timeout: 10000 });

			const row = picker.locator('[data-testid="co-traveler-row"]').first();
			await expect(row).toContainText('E2E co_owner');
			await row.getByRole('button', { name: /invite/i }).click();

			// They land in Pending invites — labelled by NAME, not by address.
			const pending = page
				.getByText(/pending invites/i)
				.filter({ visible: true })
				.first();
			await expect(pending).toBeVisible({ timeout: 10000 });
			await expect(page.getByText('E2E co_owner').filter({ visible: true }).first()).toBeVisible();

			// …and they drop out of the pool (already invited).
			await expect(picker.locator('[data-testid="co-traveler-row"]')).toHaveCount(0);

			// It is a real pending_invites row for the right person — verified
			// server-side, where the address legitimately lives.
			const t = await token(EMAILS.owner);
			const invites = (await (
				await fetch(
					`${PB_BASE}/api/collections/pending_invites/records?filter=${encodeURIComponent(
						`trip="${fixture.targetTripId}"`
					)}`,
					{ headers: { Authorization: `Bearer ${t}` } }
				)
			).json()) as { items: Array<{ email: string; role: string }> };
			expect(invites.items).toHaveLength(1);
			expect(invites.items[0].email).toBe(EMAILS.co_owner);
			expect(invites.items[0].role).toBe('traveler');

			// The inviter's side never saw it: not in the HTML, not in the action
			// response, not in a form value.
			const html = await page.content();
			expect(html).not.toContain(EMAILS.co_owner);
			expect(html).not.toContain('@e2e.test');
			expect(actionBodies.length).toBeGreaterThan(0);
			for (const body of actionBodies) {
				expect(body).not.toContain(EMAILS.co_owner);
				expect(body).not.toContain('@e2e.test');
			}
		} finally {
			await ctx.close();
		}
	});

	test('a forged user id is refused server-side (the client id is never trusted)', async ({
		browser
	}) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);
		try {
			await page.goto(`${BASE}/trips/${TARGET_SLUG}/members`);
			await expect(
				page.locator('[data-testid="co-traveler-picker"]').filter({ visible: true }).first()
			).toBeVisible({ timeout: 10000 });

			// non_member's only shared membership is TOMBSTONED, so they are not a
			// co-traveler however convincing the id looks.
			const forgedId = fixture.userIds.non_member;
			const result = await page.evaluate(
				async ([slug, userId]) => {
					const body = new URLSearchParams({ user_id: userId, role: 'traveler' });
					const res = await fetch(`/trips/${slug}/members?/inviteCoTraveler`, {
						method: 'POST',
						headers: { 'x-sveltekit-action': 'true' },
						body
					});
					return { status: res.status, text: await res.text() };
				},
				[TARGET_SLUG, forgedId]
			);

			expect(result.text).toMatch(/travelled with that person/i);
			expect(result.text).not.toContain('@e2e.test');

			// Nothing was created.
			const t = await token(EMAILS.owner);
			const invites = (await (
				await fetch(
					`${PB_BASE}/api/collections/pending_invites/records?filter=${encodeURIComponent(
						`trip="${fixture.targetTripId}"`
					)}`,
					{ headers: { Authorization: `Bearer ${t}` } }
				)
			).json()) as { items: unknown[] };
			expect(invites.items).toHaveLength(0);
		} finally {
			await ctx.close();
		}
	});

	test('375px: populated picker and empty state', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);
		try {
			await page.setViewportSize({ width: 375, height: 812 });

			// Populated — the TARGET trip has one poolable co-traveler.
			await page.goto(`${BASE}/trips/${TARGET_SLUG}/members`);
			const picker = page
				.locator('[data-testid="co-traveler-picker"]')
				.filter({ visible: true })
				.first();
			await expect(picker).toBeVisible({ timeout: 10000 });
			await page.screenshot({ path: '.visual/352-picker-populated-375.png', fullPage: true });

			// Empty — on the PAST trip every co-traveler is already a member.
			await page.goto(`${BASE}/trips/${PAST_SLUG}/members`);
			await expect(
				page.locator('[data-testid="co-traveler-empty"]').filter({ visible: true }).first()
			).toBeVisible({ timeout: 10000 });
			await page.screenshot({ path: '.visual/352-picker-empty-375.png', fullPage: true });

			// No horizontal overflow at phone width.
			const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
			const viewportWidth = await page.evaluate(() => window.innerWidth);
			expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
		} finally {
			await ctx.close();
		}
	});
});
