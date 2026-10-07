import { test, expect, type Browser, type Page } from '@playwright/test';
import { E2E_BASE, E2E_PB_BASE } from './e2e-env';

// #416 — item detail shows only the actions the server allows, and a refused
// action says so in place instead of failing silently.
//
// The server gates (items.pb.js, documents.pb.js, checklists/tasks hooks,
// votes.createRule 0055, the skipItem action) are the source of truth; the page
// gates every control with `itemPermissions()` (src/lib/itinerary/item-permissions.ts).
// This spec drives the real roles through the UI:
//   - a traveler who isn't the creator sees no Move, Skip, Delete or Edit
//   - a viewer additionally sees no upload, checklist or vote controls
//   - the creator gets Move + Edit, never Delete or Skip
//   - a member whose role is lowered while the page is open gets an in-context
//     error from Move, Skip and Delete (was: nothing)
//   - Skip stays on the item page in Planning Mode, goes to Now in Trip Mode
//
// Fixture: the rules-fixture (owner / co_owner / traveler / viewer) under its own
// slug. Its trip (2026-06-01..03) is in the past, so it renders Planning Mode.
// The Trip Mode case creates its own active trip. AppShell renders the page twice
// (mobile + desktop), so every locator — negatives included — is visible-scoped.

const BASE = E2E_BASE;
const PB_BASE = E2E_PB_BASE;

const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

const FIXTURE_SLUG = 'e2e-item-role-gating';
const ITEM_TITLE = 'Test Activity';

type FixtureIds = {
	tripId: string;
	phaseId: string;
	dayId: string;
	dayId2: string;
	itemId: string;
	memberIds: { owner: string; co_owner: string; traveler: string; viewer: string };
	userIds: { owner: string };
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

async function setupFixture(ownerToken: string): Promise<FixtureIds> {
	const res = await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
		body: JSON.stringify({ emails: EMAILS, slug: FIXTURE_SLUG })
	});
	expect(res.ok, `rules-fixture: ${res.status}`).toBe(true);
	return (await res.json()) as FixtureIds;
}

async function pb(
	t: string,
	method: string,
	path: string,
	body?: unknown
): Promise<Record<string, unknown>> {
	const res = await fetch(`${PB_BASE}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	expect(res.ok, `${method} ${path}: ${res.status} ${JSON.stringify(json)}`).toBe(true);
	return json;
}

async function devLogin(
	browser: Browser,
	email: string
): Promise<{ page: Page; close: () => Promise<void> }> {
	const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { page, close: () => ctx.close() };
}

/** Open the item and wait for it to render (the positive control every negative needs). */
async function openItem(page: Page, slug: string, itemId: string, title = ITEM_TITLE) {
	await page.goto(`${BASE}/trips/${slug}/items/${itemId}`);
	await expect(
		page.getByRole('heading', { name: title }).filter({ visible: true }).first()
	).toBeVisible({
		timeout: 10000
	});
	await expect(
		page.getByRole('button', { name: 'Post' }).filter({ visible: true }).first()
	).toBeVisible();
}

const visible = (page: Page) => ({
	move: page.getByRole('button', { name: 'Move', exact: true }).filter({ visible: true }),
	edit: page.getByRole('link', { name: 'Edit', exact: true }).filter({ visible: true }),
	skip: page.getByRole('button', { name: /Skip — not happening/ }).filter({ visible: true }),
	del: page.getByRole('button', { name: 'Delete', exact: true }).filter({ visible: true }),
	upload: page.getByRole('button', { name: 'Upload', exact: true }).filter({ visible: true }),
	addChecklist: page.getByRole('button', { name: 'Add checklist' }).filter({ visible: true }),
	votes: page.getByRole('group', { name: 'Vote on this item' }).filter({ visible: true })
});

/**
 * A Planning Mode skip finished AND left us on the item page. Waits on the
 * confirmation toast (the skip's completion signal), then for the reload to
 * settle, so a late navigation to Now can't slip past the URL check.
 */
async function expectStayedAfterSkip(page: Page, itemPath: string) {
	await expect(
		page
			.getByRole('status')
			.filter({ hasText: /back in your ideas/ })
			.first()
	).toBeVisible({
		timeout: 10000
	});
	await page.waitForLoadState('networkidle');
	expect(new URL(page.url()).pathname).toBe(itemPath);
	// The panel is gone: the item is an idea again, so there is nothing to skip.
	await expect(
		page.getByRole('heading', { name: 'Not happening?' }).filter({ visible: true })
	).toHaveCount(0);
}

test.describe('#416 item detail role gating', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	let ownerToken = '';
	let ids: FixtureIds;

	test.beforeEach(async () => {
		ownerToken = await token(EMAILS.owner);
		ids = await setupFixture(ownerToken);
	});

	test("a traveler who isn't the creator sees no Delete, Move, Skip or Edit", async ({
		browser
	}) => {
		const traveler = await devLogin(browser, EMAILS.traveler);
		try {
			const { page } = traveler;
			await openItem(page, FIXTURE_SLUG, ids.itemId);
			const c = visible(page);

			await expect(c.del).toHaveCount(0);
			await expect(c.move).toHaveCount(0);
			await expect(c.skip).toHaveCount(0);
			await expect(c.edit).toHaveCount(0);

			// A traveler may still upload, keep a checklist and vote (server allows it).
			await expect(c.upload.first()).toBeVisible();
			await expect(c.addChecklist.first()).toBeVisible();
			await expect(c.votes.first()).toBeVisible();
		} finally {
			await traveler.close();
		}
	});

	test('a viewer sees no write controls', async ({ browser }) => {
		const viewer = await devLogin(browser, EMAILS.viewer);
		try {
			const { page } = viewer;
			await openItem(page, FIXTURE_SLUG, ids.itemId);
			const c = visible(page);

			await expect(c.del).toHaveCount(0);
			await expect(c.move).toHaveCount(0);
			await expect(c.skip).toHaveCount(0);
			await expect(c.edit).toHaveCount(0);
			await expect(c.upload).toHaveCount(0);
			await expect(c.addChecklist).toHaveCount(0);
			await expect(c.votes).toHaveCount(0);
		} finally {
			await viewer.close();
		}
	});

	test('the owner sees every action; the creator gets Move and Edit only', async ({ browser }) => {
		// An item the TRAVELER created (created_by = their member id).
		const created = await pb(ownerToken, 'POST', '/api/collections/items/records', {
			trip: ids.tripId,
			phase: ids.phaseId,
			day: ids.dayId,
			type: 'activity',
			title: 'Traveler-made dinner',
			status: 'planned',
			created_by: ids.memberIds.traveler
		});
		const travelerItemId = created.id as string;

		const owner = await devLogin(browser, EMAILS.owner);
		try {
			const { page } = owner;
			await openItem(page, FIXTURE_SLUG, ids.itemId);
			const c = visible(page);
			await expect(c.move.first()).toBeVisible();
			await expect(c.edit.first()).toBeVisible();
			await expect(c.skip.first()).toBeVisible();
			await expect(c.del.first()).toBeVisible();
		} finally {
			await owner.close();
		}

		const traveler = await devLogin(browser, EMAILS.traveler);
		try {
			const { page } = traveler;
			await openItem(page, FIXTURE_SLUG, travelerItemId, 'Traveler-made dinner');
			const c = visible(page);
			await expect(c.move.first()).toBeVisible();
			await expect(c.edit.first()).toBeVisible();
			await expect(c.del).toHaveCount(0);
			await expect(c.skip).toHaveCount(0);
		} finally {
			await traveler.close();
		}
	});

	test('a refused Move, Skip or Delete shows an in-context error', async ({ browser }) => {
		const coOwner = await devLogin(browser, EMAILS.co_owner);
		try {
			const { page } = coOwner;
			await openItem(page, FIXTURE_SLUG, ids.itemId);
			const c = visible(page);
			await expect(c.del.first()).toBeVisible();

			// The owner lowers the co-owner to traveler while their page is open: the
			// controls are still on screen, and the server now refuses all three.
			await pb(
				ownerToken,
				'PATCH',
				`/api/collections/trip_members/records/${ids.memberIds.co_owner}`,
				{
					role: 'traveler'
				}
			);

			// Move → the sheet stays open and says it failed.
			await c.move.first().click();
			const sheet = page.locator('[data-sheet-panel]').filter({ visible: true }).first();
			await expect(sheet).toBeVisible();
			await sheet.locator('select[name="day"]').selectOption(ids.dayId2);
			await sheet.getByRole('button', { name: 'Move', exact: true }).click();
			await expect(sheet.getByRole('alert')).toContainText("Couldn't move this item");
			await page.keyboard.press('Escape');
			await expect(page.locator('[data-sheet-panel]').filter({ visible: true })).toHaveCount(0);

			// Skip → error in the Skip panel, and we stay on the page.
			await c.skip.first().click();
			await expect(
				page.getByRole('alert').filter({ hasText: "Couldn't skip this" }).first()
			).toBeVisible();
			expect(page.url()).toContain(`/items/${ids.itemId}`);

			// Delete → Confirm → error in the Delete panel.
			await c.del.first().click();
			await page.getByRole('button', { name: 'Confirm' }).filter({ visible: true }).first().click();
			await expect(
				page.getByRole('alert').filter({ hasText: "Couldn't delete this" }).first()
			).toBeVisible();
			expect(page.url()).toContain(`/items/${ids.itemId}`);
		} finally {
			await coOwner.close();
		}

		// Nothing changed server-side.
		const item = await pb(ownerToken, 'GET', `/api/collections/items/records/${ids.itemId}`);
		expect(item.day).toBe(ids.dayId);
		expect(item.status).toBe('planned');
	});

	test('Skip in Planning Mode stays on the item page and returns it to the ideas', async ({
		browser
	}) => {
		const owner = await devLogin(browser, EMAILS.owner);
		try {
			const { page } = owner;
			await openItem(page, FIXTURE_SLUG, ids.itemId);
			const c = visible(page);
			await c.skip.first().click();
			await expectStayedAfterSkip(page, `/trips/${FIXTURE_SLUG}/items/${ids.itemId}`);
		} finally {
			await owner.close();
		}

		const item = await pb(ownerToken, 'GET', `/api/collections/items/records/${ids.itemId}`);
		expect(item.status).toBe('unplanned');
		expect(item.day).toBe('');
		expect(item.phase).toBe(ids.phaseId);
	});

	test('Skip in Trip Mode goes to Now; after switching to Planning Mode it stays', async ({
		browser
	}) => {
		// An ACTIVE trip (yesterday → +2 days, UTC), owned by the fixture owner.
		const stamp = Date.now().toString(36);
		const day = (offset: number) =>
			new Date(Date.now() + offset * 86400000).toISOString().split('T')[0] + ' 00:00:00.000Z';
		const trip = await pb(ownerToken, 'POST', '/api/collections/trips/records', {
			title: `E2E 416 live ${stamp}`,
			slug: `e2e-416-live-${stamp}`,
			start_date: day(-1),
			end_date: day(2),
			timezone: 'UTC',
			created_by: ids.userIds.owner
		});
		const slug = trip.slug as string;
		const tripId = trip.id as string;
		const filter = (f: string) => encodeURIComponent(f);
		const today = new Date().toISOString().split('T')[0];
		const days = (await pb(
			ownerToken,
			'GET',
			`/api/collections/days/records?filter=${filter(`trip = "${tripId}"`)}&perPage=50`
		)) as { items: Array<{ id: string; date: string }> };
		const todayDay = days.items.find((d) => d.date.startsWith(today));
		expect(todayDay, 'active trip has a day for today').toBeTruthy();
		const phases = (await pb(
			ownerToken,
			'GET',
			`/api/collections/phases/records?filter=${filter(`trip = "${tripId}"`)}`
		)) as { items: Array<{ id: string }> };
		const members = (await pb(
			ownerToken,
			'GET',
			`/api/collections/trip_members/records?filter=${filter(`trip = "${tripId}"`)}`
		)) as { items: Array<{ id: string }> };

		const newItem = async (title: string) =>
			(
				await pb(ownerToken, 'POST', '/api/collections/items/records', {
					trip: tripId,
					phase: phases.items[0].id,
					day: todayDay!.id,
					type: 'activity',
					title,
					status: 'planned',
					created_by: members.items[0].id
				})
			).id as string;
		const liveItem = await newItem('Live skip');
		const plannedItem = await newItem('Planning skip');

		const owner = await devLogin(browser, EMAILS.owner);
		try {
			const { page } = owner;

			// Trip Mode (an active trip's item page defaults to it) → Skip → Now.
			await openItem(page, slug, liveItem, 'Live skip');
			await visible(page).skip.first().click();
			await page.waitForURL(`${BASE}/trips/${slug}/now`, { timeout: 10000 });

			// Switch to Planning Mode, then drill to the other item in-app (the mode
			// is in-memory, so this must be client-side navigation) → Skip → stay.
			await page
				.getByRole('button', { name: 'Planning Mode' })
				.filter({ visible: true })
				.first()
				.click();
			await page.waitForURL(`${BASE}/trips/${slug}`, { timeout: 10000 });
			await page
				.locator(`a[href^="/trips/${slug}/days/${todayDay!.id}"]`)
				.filter({ visible: true })
				.first()
				.click();
			await page.waitForURL(new RegExp(`/trips/${slug}/days/${todayDay!.id}`), { timeout: 10000 });
			await page
				.locator(`a[href*="/items/${plannedItem}"]`)
				.filter({ visible: true })
				.first()
				.click();
			await page.waitForURL(new RegExp(`/items/${plannedItem}`), { timeout: 10000 });
			await expect(
				page.getByRole('button', { name: 'Trip Mode' }).filter({ visible: true }).first()
			).toBeVisible();

			await visible(page).skip.first().click();
			await expectStayedAfterSkip(page, `/trips/${slug}/items/${plannedItem}`);
		} finally {
			await owner.close();
		}
	});
});
