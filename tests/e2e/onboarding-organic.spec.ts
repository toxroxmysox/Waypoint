import { test, expect, type Browser } from '@playwright/test';

// #277 Organic-path onboarding E2E (ONBOARDING_PRD §Slices #4, Design §7).
//
// The convergence point: an invited member and a DIRECT/organic creator both end
// up in a trip, and both should hit the SAME member-keyed welcome card. #274
// covers the invited member; this covers the organic on-ramp:
//
//   empty /trips on-ramp → "New trip" → fill the create form → land on the trip
//   overview → the unified welcome card auto-shows (the fresh user's
//   `onboarded_at` is null → `needsOnboarding` true).
//
// Drives the REAL browser UI (not page.request form POSTs) so the on-ramp is
// exercised end-to-end — the empty-state CTA, the create form, and the redirect
// into the overview are all the production path. No SvelteKit-CSRF Origin-header
// concern arises because a real submit sets Origin itself.
//
// Uses the rules-harness WHITELISTED `non_member` email: that user is created by
// the rules-fixture but added to NO trip, so /trips is empty for them, and no
// other spec logs in as them or stamps their `onboarded_at` — so this file owns
// their onboarding state and the welcome card reliably auto-shows.
//
// Runs against a FRESH PB (pnpm test:e2e:clean, :8097) so migration 0054
// (`users.onboarded_at`) is applied — never the stale-schema :8090.

const BASE = 'http://localhost:4173';
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';

// Reuse the WHITELISTED rules-harness emails (E2E_TEST_EMAILS) — bypass rejects
// any other address. `non_member` belongs to no trip, so their /trips is empty.
const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

// Ensure the whitelisted users exist (find-or-create) by running the standard
// fixture once. We only need `non_member` to be a real, trip-less user.
async function ensureUsers() {
	const bypassRes = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: EMAILS.owner })
	});
	const { token } = (await bypassRes.json()) as { token: string };

	await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ emails: EMAILS, slug: 'e2e-onboarding-277' })
	});
}

async function devLogin(browser: Browser, email: string) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	// /api/dev/login → /claim → (no pending claims) → /trips. Wait until we've
	// left the dev-login + claim plumbing and reached an authenticated app page.
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL((u) => !/\/api\/dev\/login|\/claim/.test(u.pathname), { timeout: 15000 });
	return { ctx, page };
}

test.describe('#277 Organic-path onboarding (empty /trips → welcome card)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeAll(async () => {
		await ensureUsers();
	});

	// The 375px on-ramp check runs FIRST: it needs `non_member`'s /trips EMPTY, and
	// the create test below adds a trip for that same (only trip-less) user.
	test('375px: empty /trips on-ramp present, no horizontal overflow', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.non_member);
		try {
			await page.setViewportSize({ width: 375, height: 812 });
			await page.goto(`${BASE}/trips`);

			await expect(page.getByTestId('trips-empty-onramp')).toBeVisible({ timeout: 10000 });

			const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
			const viewportWidth = await page.evaluate(() => window.innerWidth);
			expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
		} finally {
			await ctx.close();
		}
	});

	test('empty /trips on-ramp → new trip → unified welcome card auto-shows', async ({
		browser
	}) => {
		const { page, ctx } = await devLogin(browser, EMAILS.non_member);
		try {
			await page.goto(`${BASE}/trips`);

			// The on-ramp: the empty state is a clear door into a trip + the shared
			// intro (NOT a dead-end "No trips yet."). It names the welcome card's doors
			// so the user knows what's on the other side of "New trip".
			const onramp = page.getByTestId('trips-empty-onramp');
			await expect(onramp).toBeVisible({ timeout: 10000 });
			await expect(onramp.getByText(/start your first trip/i)).toBeVisible();
			await expect(onramp.getByText(/see the plan/i)).toBeVisible();
			await expect(onramp.getByText(/weigh in on ideas/i)).toBeVisible();

			// Walk the real create path: empty state → "New trip" → fill → submit.
			await onramp.getByRole('link', { name: /new trip/i }).click();
			await page.waitForURL(/\/trips\/new$/, { timeout: 10000 });

			// timezone auto-fills from the browser zone on mount; title + dates are the
			// only fields the user must supply.
			await page.fill('input[name="title"]', 'Organic Onramp Trip');
			await page.fill('input[name="start_date"]', '2026-09-01');
			await page.fill('input[name="end_date"]', '2026-09-05');
			await page.getByRole('button', { name: /create trip/i }).click();

			// The create action redirects (303) to /trips/<slug>: the convergence point.
			// Wait for a slug that is NOT `new` — `/trips/new` itself matches a naive
			// `/trips/[^/]+` pattern and would resolve before the redirect even fires.
			await page.waitForURL(
				(url) => /^\/trips\/[^/]+$/.test(url.pathname) && url.pathname !== '/trips/new',
				{ timeout: 15000 }
			);

			// The SAME member-keyed welcome card an invited member sees. The organic
			// creator's trip is brand-new + empty, so the unified card folds the
			// empty-trip owner branch in (PRD §6) — one card, "Got it" to dismiss.
			const card = page.getByTestId('welcome-card').filter({ visible: true }).first();
			await expect(card).toBeVisible({ timeout: 10000 });
			await expect(card.getByRole('button', { name: /got it/i })).toBeVisible();
		} finally {
			await ctx.close();
		}
	});
});
