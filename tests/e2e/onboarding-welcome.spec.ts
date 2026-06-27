import { test, expect, type Browser } from '@playwright/test';

// #274 + #275 Onboarding E2E. The member-keyed welcome card on the trip overview,
// and its ADAPTIVE primary CTA.
//
// Requires: PB with WAYPOINT_DEV_MODE=true + E2E_TEST_EMAIL set. Uses the
// rules-fixture to bootstrap a POPULATED trip (phases + VOTABLE items + goals) with
// one member per role. The traveler is the invited-into-a-populated-trip case that
// the old content-keyed ES-1 hero misses today — the core fix #274 ships.
//
// Scope:
//   #274 (spine):
//     - Invited member (traveler) in a POPULATED trip sees the welcome card on first
//       visit (ES-1's `isFresh` would be false here → it would show nothing).
//     - Tapping "Got it" stamps `users.onboarded_at`; the card does not auto-show
//       again on the same trip OR a freshly-seeded other trip.
//     - 375px: card present, no horizontal overflow.
//   #275 (adaptive CTA):
//     - VOTABLE content present → primary CTA "Weigh in on what's been suggested".
//     - Member has rated everything (no votable content left) → primary CTA falls
//       back to "Add what you want" (→ goals). Both doors are always NAMED.
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

type Fixture = { tripId: string; phaseId: string; itemId: string; itemId2: string };

async function bypassAuth(email: string): Promise<{ token: string; userId: string }> {
	const res = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	const body = (await res.json()) as { token: string; record: { id: string } };
	return { token: body.token, userId: body.record.id };
}

async function setupFixture(email: string): Promise<Fixture> {
	const { token } = await bypassAuth(email);

	const res = await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ emails: EMAILS, slug: FIXTURE_SLUG })
	});
	return (await res.json()) as Fixture;
}

// #276 — stamp a member's once-ever onboarding signal directly via PB REST, the
// same authed-self PATCH the app uses. `users.updateRule = SELF_ONLY` (0014) lets
// a member write their own `onboarded_at`. Hitting PB REST directly (rather than
// the welcome card's form action) keeps the test deterministic and dodges the
// SvelteKit CSRF/Origin form-POST scar — cerebrum [2026-06-26].
async function stampOnboarded(email: string): Promise<void> {
	const { token, userId } = await bypassAuth(email);
	const res = await fetch(`${PB_BASE}/api/collections/users/records/${userId}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ onboarded_at: new Date().toISOString().replace('T', ' ') })
	});
	expect(res.ok).toBeTruthy();
}

async function readOnboardedAt(email: string): Promise<string> {
	const { token, userId } = await bypassAuth(email);
	const res = await fetch(`${PB_BASE}/api/collections/users/records/${userId}`, {
		headers: { Authorization: `Bearer ${token}` }
	});
	const body = (await res.json()) as { onboarded_at?: string };
	return (body.onboarded_at ?? '').trim();
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

test.describe('#274 + #275 Onboarding welcome card', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	const tripSlug = FIXTURE_SLUG;
	let fixture: Fixture;

	test.beforeAll(async () => {
		fixture = await setupFixture(EMAILS.owner);
	});

	test('#275 populated trip → primary CTA is the VOTE deck (lowest-friction first win)', async ({
		browser
	}) => {
		const { page, ctx } = await devLogin(browser, EMAILS.traveler);
		try {
			await page.goto(`${BASE}/trips/${tripSlug}`);

			// The card auto-shows regardless of trip content — the fixture trip has
			// phases + VOTABLE items, so the old content-keyed hero would render nothing.
			// Dual-tree layout (mobile + desktop both in DOM) → scope to the visible copy.
			const card = page.getByTestId('welcome-card').filter({ visible: true }).first();
			await expect(card).toBeVisible({ timeout: 10000 });
			await expect(card.getByText(/welcome aboard/i)).toBeVisible();
			// Names the OTHER doors in the copy (regardless of which CTA is primary).
			await expect(card.getByText(/weigh in on ideas/i)).toBeVisible();
			// #275: the traveler hasn't voted on anything → primary CTA is the vote deck,
			// NOT the goals capture. "Got it" still dismisses.
			await expect(
				card.getByRole('button', { name: /weigh in on what's been suggested/i })
			).toBeVisible();
			await expect(card.getByRole('button', { name: /add what you want/i })).toHaveCount(0);
			await expect(card.getByRole('button', { name: /got it/i })).toBeVisible();
		} finally {
			await ctx.close();
		}
	});

	test('#275 nothing left to rate → primary CTA falls back to GOALS', async ({ browser }) => {
		// A member who has already voted on every votable item has no lowest-friction
		// vote left, so the adaptive CTA inverts back to the goals door. We use the
		// traveler (the previous test only READ the card — it never clicked a CTA, so
		// the traveler's onboarded_at is still unset and the card still auto-shows).
		// Cast votes through the deck's `vote` form action — voting does NOT stamp
		// onboarded_at, so the welcome card keeps auto-showing.
		const { page, ctx } = await devLogin(browser, EMAILS.traveler);
		try {
			// page.request shares the authenticated context cookies. The deck vote action
			// is a SvelteKit form action (`?/vote`) — the same endpoint the swipe UI posts
			// to. Any real phase segment matches the route; the action resolves the item's
			// own trip + the caller's membership, so the phaseId is incidental here.
			for (const itemId of [fixture.itemId, fixture.itemId2]) {
				const res = await page.request.post(
					`${BASE}/trips/${tripSlug}/swipe/${fixture.phaseId}?/vote`,
					// SvelteKit CSRF rejects a cross-origin form POST without an Origin
					// header (page.request omits it) — supply it so the action runs.
					{ form: { item: itemId, value: 'like' }, headers: { origin: BASE } }
				);
				expect(res.ok()).toBeTruthy();
			}

			await page.goto(`${BASE}/trips/${tripSlug}`);
			const card = page.getByTestId('welcome-card').filter({ visible: true }).first();
			await expect(card).toBeVisible({ timeout: 10000 });
			// Now there's nothing left to vote on → the goals CTA, NOT the vote deck.
			await expect(card.getByRole('button', { name: /add what you want/i })).toBeVisible();
			await expect(
				card.getByRole('button', { name: /weigh in on what's been suggested/i })
			).toHaveCount(0);
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

	test('#276 "Replay intro" force-shows the card for an onboarded member without altering onboarded_at', async ({
		browser
	}) => {
		// The owner is used only by beforeAll's auth-bypass (never clicks a card CTA),
		// so stamp its once-ever signal explicitly to make this test self-contained:
		// the subject is a fully ONBOARDED veteran whose card never auto-shows.
		await stampOnboarded(EMAILS.owner);
		const before = await readOnboardedAt(EMAILS.owner);
		expect(before).not.toEqual('');

		const { page, ctx } = await devLogin(browser, EMAILS.owner);
		try {
			// 1. Onboarded → the welcome card does NOT auto-show on the trip overview.
			await page.goto(`${BASE}/trips/${tripSlug}`);
			await expect(page.getByTestId('welcome-card')).toHaveCount(0, { timeout: 10000 });

			// 2. The "Replay intro" entry lives in the trip "More" menu.
			await page.goto(`${BASE}/trips/${tripSlug}/more`);
			const replay = page.getByTestId('replay-intro').filter({ visible: true }).first();
			await expect(replay).toBeVisible({ timeout: 10000 });

			// 3. Tapping it lands on the overview with the welcome card FORCE-SHOWN —
			//    the manual override ignores the once-ever signal (`?welcome=1`).
			await replay.click();
			await page.waitForURL((u) => /welcome=1/.test(u.search), { timeout: 10000 });
			const card = page.getByTestId('welcome-card').filter({ visible: true }).first();
			await expect(card).toBeVisible({ timeout: 10000 });
			await expect(card.getByText(/welcome aboard/i)).toBeVisible();

			// 4. The override neither depended on nor cleared the flag: still stamped,
			//    unchanged from before the replay (this is a manual override, not a reset).
			const after = await readOnboardedAt(EMAILS.owner);
			expect(after).toEqual(before);
		} finally {
			await ctx.close();
		}
	});

	test('#276 direct ?welcome=1 force-shows the card even for an onboarded member', async ({
		browser
	}) => {
		// The force-show mechanism is the `?welcome=1` query param itself — independent
		// of the More-menu link. An already-onboarded member who hits the URL directly
		// (e.g. the link the More entry points at) sees the card; the auto-show path
		// (no param) stays gated by onboarded_at.
		await stampOnboarded(EMAILS.owner);

		const { page, ctx } = await devLogin(browser, EMAILS.owner);
		try {
			// No param → gated → no card.
			await page.goto(`${BASE}/trips/${tripSlug}`);
			await expect(page.getByTestId('welcome-card')).toHaveCount(0, { timeout: 10000 });

			// ?welcome=1 → force-shown regardless of the stamped flag.
			await page.goto(`${BASE}/trips/${tripSlug}?welcome=1`);
			await expect(
				page.getByTestId('welcome-card').filter({ visible: true }).first()
			).toBeVisible({ timeout: 10000 });
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
