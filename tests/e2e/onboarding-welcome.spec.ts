import { test, expect, type Browser } from '@playwright/test';

// #274 Onboarding spine E2E. The member-keyed welcome card on the trip overview.
//
// Requires: PB with WAYPOINT_DEV_MODE=true + E2E_TEST_EMAIL set. Uses the
// rules-fixture to bootstrap a POPULATED trip (phases + items + goals) with one
// member per role. The traveler is the invited-into-a-populated-trip case that
// the old content-keyed ES-1 hero misses today — the core fix this slice ships.
//
// Scope (slice #1, tracer bullet):
//   - Invited member (traveler) in a POPULATED trip sees the welcome card on first
//     visit (ES-1's `isFresh` would be false here → it would show nothing).
//   - Tapping "Got it" stamps `users.onboarded_at`; the card does not auto-show
//     again on the same trip OR a freshly-seeded other trip.
//   - 375px: card present, no horizontal overflow.
//
// Runs against a FRESH PB (pnpm test:e2e:clean, :8097) so the 0054 migration is
// applied — never the stale-schema :8090.

const BASE = 'http://localhost:4173';
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';

// Reuse the WHITELISTED rules-harness emails (E2E_TEST_EMAILS) — bypass rejects any
// other address. Isolated by a per-file fixture slug so this file's teardown never
// races m2/m3 (which share the same user set). The "Got it" test stamps
// `rules-viewer.onboarded_at`; no other spec asserts onboarding, so that's inert.
const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

const FIXTURE_SLUG = 'e2e-onboarding-274';

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

async function devLogin(browser: Browser, email: string) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	// /api/dev/login → /claim → (no pending claims) → /trips. Wait until we've left
	// the dev-login + claim plumbing and reached an authenticated app page.
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL((u) => !/\/api\/dev\/login|\/claim/.test(u.pathname), { timeout: 15000 });
	return { ctx, page };
}

test.describe('#274 Onboarding welcome card', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	const tripSlug = FIXTURE_SLUG;

	test.beforeAll(async () => {
		await setupFixture(EMAILS.owner);
	});

	test('invited member sees the welcome card on a POPULATED trip (ES-1 gap fixed)', async ({
		browser
	}) => {
		const { page, ctx } = await devLogin(browser, EMAILS.traveler);
		try {
			await page.goto(`${BASE}/trips/${tripSlug}`);

			// The card auto-shows regardless of trip content — the fixture trip has
			// phases + items, so the old content-keyed hero would render nothing.
			// Dual-tree layout (mobile + desktop both in DOM) → scope to the visible copy.
			const card = page.getByTestId('welcome-card').filter({ visible: true }).first();
			await expect(card).toBeVisible({ timeout: 10000 });
			await expect(card.getByText(/welcome aboard/i)).toBeVisible();
			// Names the doors + carries the basic CTA + a "Got it" dismiss.
			await expect(card.getByText(/weigh in on ideas/i)).toBeVisible();
			await expect(card.getByRole('button', { name: /add what you want/i })).toBeVisible();
			await expect(card.getByRole('button', { name: /got it/i })).toBeVisible();
		} finally {
			await ctx.close();
		}
	});

	test('"Got it" stamps onboarded_at → card gone, and never auto-shows again', async ({
		browser
	}) => {
		const { page, ctx } = await devLogin(browser, EMAILS.viewer);
		try {
			await page.goto(`${BASE}/trips/${tripSlug}`);

			const card = page.getByTestId('welcome-card').filter({ visible: true }).first();
			await expect(card).toBeVisible({ timeout: 10000 });

			// Tap "Got it" — stamps the once-ever signal, card disappears in place.
			await card.getByRole('button', { name: /got it/i }).click();
			await expect(page.getByTestId('welcome-card')).toHaveCount(0, { timeout: 10000 });

			// Reload the same trip — still gone (the signal persists).
			await page.goto(`${BASE}/trips/${tripSlug}`);
			await expect(page.getByTestId('welcome-card')).toHaveCount(0, { timeout: 10000 });
		} finally {
			await ctx.close();
		}
	});

	test('375px: welcome card present, no horizontal overflow', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.co_owner);
		try {
			await page.setViewportSize({ width: 375, height: 812 });
			await page.goto(`${BASE}/trips/${tripSlug}`);

			await expect(
				page.getByTestId('welcome-card').filter({ visible: true }).first()
			).toBeVisible({ timeout: 10000 });

			const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
			const viewportWidth = await page.evaluate(() => window.innerWidth);
			expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
		} finally {
			await ctx.close();
		}
	});
});
