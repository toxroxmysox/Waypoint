import { test, expect, type Browser } from '@playwright/test';

// #249 / PRD #202 — Contribution Slice 2: approve a ghost → real item.
//
// Binding acceptance flow:
//   auto-approve OFF → a traveler adds an idea → it lands as a pending Ghost Card
//   → a 2nd member (co_owner) votes the ghost → the owner approves (in place on the
//   ghost card) → a real item appears, attributed to the AUTHOR (the traveler, not
//   the reviewing owner), carrying the migrated vote → the author is notified.
//
// Runs against the shared :8090 dev PB (or an isolated PB via PUBLIC_PB_URL). Uses
// the rules-fixture (owner / co_owner / traveler / viewer, auto_approve=false) and
// drives everything through the UI on the phase-detail parking lot, the canonical
// Ghost Card surface (#248).
//
// Dual-tree scar: AppShell renders +page.svelte twice (mobile + desktop). Scope
// every assertion to the visible subtree (.filter({ visible: true }).first()).

const BASE = 'http://localhost:4173';
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';

const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

// Isolated slug so this file's fixture teardown can't collide with m2-collab's.
const FIXTURE_SLUG = 'e2e-rules-test-contrib';

type FixtureIds = {
	tripId: string;
	phaseId: string;
	memberIds: { owner: string; co_owner: string; traveler: string; viewer: string };
};

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
	const data = (await res.json()) as FixtureIds;
	return data;
}

async function devLogin(browser: Browser, email: string) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { ctx, page };
}

test.describe('#249 approve ghost → real item', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	let ids: FixtureIds;

	test.beforeAll(async () => {
		ids = await setupFixture();
	});

	test('traveler idea → ghost → vote → owner approve → author-attributed item carries vote → author notified', async ({
		browser
	}) => {
		const ideaTitle = `Approve me ${Date.now()}`;
		const phaseUrl = `${BASE}/trips/${FIXTURE_SLUG}/phases/${ids.phaseId}`;

		// 1) Traveler submits an idea. auto_approve is OFF, so the traveler's
		//    items/new submit routes to /api/suggestions/create → a pending suggestion
		//    scoped to this phase (a Ghost Card).
		const traveler = await devLogin(browser, EMAILS.traveler);
		try {
			await traveler.page.goto(`${BASE}/trips/${FIXTURE_SLUG}/items/new?phase=${ids.phaseId}`);
			// input[name="title"]:visible — the title input has a duplicate id across the
			// dual tree (#56), so getByLabel fills the hidden tree; scope to the visible one.
			const titleField = traveler.page.locator('input[name="title"]:visible').first();
			await titleField.fill(ideaTitle);
			await traveler.page
				.getByRole('button', { name: /submit suggestion/i })
				.filter({ visible: true })
				.first()
				.click();
			// Lands back somewhere in the trip (Slice 5 redirects to the phase; the
			// pre-Slice-5 behavior redirects to Overview). Either is fine here — we
			// assert the ghost on the phase page next.
			await traveler.page.waitForURL(new RegExp(`/trips/${FIXTURE_SLUG}`), { timeout: 10000 });
		} finally {
			await traveler.ctx.close();
		}

		// 2) The ghost is visible on the phase parking lot to all members. The
		//    co_owner (a 2nd member, not the author) votes it.
		const coOwner = await devLogin(browser, EMAILS.co_owner);
		try {
			await coOwner.page.goto(phaseUrl);
			const ghost = coOwner.page
				.locator('[aria-label="Pending idea: ' + ideaTitle + '"]')
				.filter({ visible: true })
				.first();
			await expect(ghost).toBeVisible({ timeout: 10000 });

			// Cast a "Love" vote on the ghost (the co_owner is not the author → allowed).
			await ghost.getByRole('button', { name: /love/i }).first().click();
			// The vote stack / count appears once the vote persists + load re-runs.
			await expect(ghost.getByRole('button', { name: /love/i }).first()).toHaveAttribute(
				'aria-pressed',
				'true',
				{ timeout: 10000 }
			);
		} finally {
			await coOwner.ctx.close();
		}

		// 3) The owner approves the ghost in place on the parking lot.
		const owner = await devLogin(browser, EMAILS.owner);
		let realItemId = '';
		try {
			await owner.page.goto(phaseUrl);
			const ghost = owner.page
				.locator('[aria-label="Pending idea: ' + ideaTitle + '"]')
				.filter({ visible: true })
				.first();
			await expect(ghost).toBeVisible({ timeout: 10000 });
			await ghost.getByRole('button', { name: /^approve$/i }).first().click();

			// The ghost promotes in place → a real (linked) idea card with the same
			// title appears; the dotted ghost for that title is gone.
			await expect(
				owner.page
					.locator('[aria-label="Pending idea: ' + ideaTitle + '"]')
					.filter({ visible: true })
			).toHaveCount(0, { timeout: 10000 });
			const realCard = owner.page
				.getByRole('link', { name: new RegExp(ideaTitle, 'i') })
				.filter({ visible: true })
				.first();
			await expect(realCard).toBeVisible({ timeout: 10000 });
			const href = await realCard.getAttribute('href');
			realItemId = (href ?? '').split('/items/')[1] ?? '';
			expect(realItemId).not.toBe('');
		} finally {
			await owner.ctx.close();
		}

		// 4) Verify attribution + vote migration directly against PB (the ground
		//    truth). created_by must be the TRAVELER's member id (not the owner's),
		//    and the item must carry a votes row mirroring the ghost's love vote.
		const ownerToken = await token(EMAILS.owner);

		const itemRes = await fetch(`${PB_BASE}/api/collections/items/records/${realItemId}`, {
			headers: { Authorization: `Bearer ${ownerToken}` }
		});
		const item = (await itemRes.json()) as { created_by: string };
		expect(item.created_by).not.toBe('');

		// The traveler's own membership id — from the fixture's authoritative memberIds
			// map (querying trip_members by user.email returns empty: listRule + emailVisibility).
			const travMemberId = ids.memberIds.traveler;
		expect(travMemberId).not.toBe('');
		// created_by === the AUTHOR (traveler), never the reviewing owner.
		expect(item.created_by).toBe(travMemberId);

		// A votes row was migrated onto the real item (love, by the co_owner).
		const votesRes = await fetch(
			`${PB_BASE}/api/collections/votes/records?filter=${encodeURIComponent(
				`item = "${realItemId}"`
			)}`,
			{ headers: { Authorization: `Bearer ${ownerToken}` } }
		);
		const votes = (await votesRes.json()) as { items: Array<{ value: string }> };
		expect(votes.items.length).toBeGreaterThanOrEqual(1);
		expect(votes.items.some((v) => v.value === 'love')).toBe(true);

		// 5) The author (traveler) is notified of the approval (#260 fixed: 0053
		//    materializes the notifications fields so the hook persists the record).
		const travelerToken = await token(EMAILS.traveler);
		const notifRes = await fetch(`${PB_BASE}/api/notifications/list?limit=50`, {
			headers: { Authorization: `Bearer ${travelerToken}` }
		});
		const notifs = (await notifRes.json()) as { items: Array<{ type: string; body: string }> };
		expect(notifs.items.some((n) => n.type === 'suggestion_approved')).toBe(true);
	});
});
