import { test, expect, type Browser } from '@playwright/test';
import { E2E_BASE } from './e2e-env';

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

const BASE = E2E_BASE;
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
			await traveler.page.goto(`${BASE}/trips/${FIXTURE_SLUG}/items/new?phase=${ids.phaseId}`, { waitUntil: 'networkidle' });
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
			await coOwner.page.goto(phaseUrl, { waitUntil: 'networkidle' });
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
			await owner.page.goto(phaseUrl, { waitUntil: 'networkidle' });
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
			// #361: item links now carry `?from=<origin>`. Strip it — this id goes
			// into a PB filter string, where a trailing query silently matches
			// nothing (the item fetch still worked, so only the vote count went to
			// zero, which read like a broken approval rather than a broken id).
			realItemId = ((href ?? '').split('/items/')[1] ?? '').split('?')[0];
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
	// #444 — Edit opens the Suggestion's edit view (Reject / Save / Approve). Save
	// keeps the edits and leaves it pending; Approve then lands the SAVED edit with
	// the author's not going (carried from #402).
	test('Inbox Edit -> Save keeps it pending -> Approve lands the saved edit', async ({ browser }) => {
		const stamp = Date.now();
		const title = `Edit me ${stamp}`;
		const savedTitle = `Edited ${stamp}`;
		const travelerToken = await token(EMAILS.traveler);
		const created = await fetch(`${PB_BASE}/api/suggestions/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${travelerToken}` },
			body: JSON.stringify({
				trip_id: ids.tripId,
				payload: {
					title,
					type: 'activity',
					phase: ids.phaseId,
					not_going: [ids.memberIds.traveler]
				}
			})
		});
		expect(created.ok).toBeTruthy();
		const { suggestion_id } = (await created.json()) as { suggestion_id: string };

		const ownerToken = await token(EMAILS.owner);
		const listPending = async () => {
			const r = await fetch(
				`${PB_BASE}/api/suggestions/list?trip_id=${ids.tripId}&status=pending`,
				{ headers: { Authorization: `Bearer ${ownerToken}` } }
			);
			return ((await r.json()) as { items: Array<{ id: string; payload: { title: string } }> }).items;
		};

		const owner = await devLogin(browser, EMAILS.owner);
		try {
			const inbox = `${BASE}/trips/${FIXTURE_SLUG}/inbox`;
			await owner.page.goto(inbox, { waitUntil: 'networkidle' });
			const card = owner.page
				.locator('[aria-label="Pending idea: ' + title + '"]')
				.filter({ visible: true })
				.first();
			await expect(card).toBeVisible({ timeout: 10000 });
			await card.getByRole('link', { name: /^edit$/i }).click();
			await owner.page.waitForURL(/items\/new\?.*suggestion=/, { timeout: 10000 });

			// The edit view's three actions.
			const vis = (name: RegExp) =>
				owner.page.getByRole('button', { name }).filter({ visible: true }).first();
			await expect(vis(/^reject$/i)).toBeVisible();
			await expect(vis(/^save$/i)).toBeVisible();
			await expect(vis(/^approve$/i)).toBeVisible();

			await owner.page.locator('input[name="title"]:visible').first().fill(savedTitle);
			await vis(/^save$/i).click();
			await expect(
				owner.page.getByText('Saved. Still pending.').filter({ visible: true }).first()
			).toBeVisible({ timeout: 10000 });

			// Still pending, with the saved title (ground truth from the endpoint).
			const after = (await listPending()).find((s) => s.id === suggestion_id);
			expect(after?.payload.title).toBe(savedTitle);

			// Approve from the same edit view -> back to the Inbox, the item exists.
			await vis(/^approve$/i).click();
			await owner.page.waitForURL(/\/inbox$/, { timeout: 10000 });
			expect((await listPending()).some((s) => s.id === suggestion_id)).toBe(false);
		} finally {
			await owner.ctx.close();
		}

		const itemsRes = await fetch(
			`${PB_BASE}/api/collections/items/records?filter=${encodeURIComponent(`title = "${savedTitle}"`)}`,
			{ headers: { Authorization: `Bearer ${ownerToken}` } }
		);
		const found = ((await itemsRes.json()) as { items: Array<{ not_going: string[] }> }).items;
		expect(found.length).toBe(1);
		// Carried from #402: Edit & Approve keeps the author's not going.
		expect(found[0].not_going).toEqual([ids.memberIds.traveler]);
	});
});
