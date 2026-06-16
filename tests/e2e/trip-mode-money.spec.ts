import { test, expect, type Browser } from '@playwright/test';

// Trip-Mode Money summary (#227) E2E + visual verification.
// Requires: WAYPOINT_DEV_MODE=true + E2E_TEST_EMAILS (whitelisted bypass emails).
// Prefer `pnpm test:e2e:clean` (isolated PB on :8097) per CLAUDE.md — :8090 carries
// stale schema.
//
// Uses the admin-side rules-fixture (owner + co_owner + traveler + viewer, real
// whitelisted users — direct trip_members.create is admin-only by rule) under its OWN
// slug, then PATCHes the trip dates ACTIVE (owner can update trip dates) so the trip
// renders Trip-Mode (clay) chrome, and seeds a budget + two equally-split expenses + a
// couple of unbooked items. Verifies the per-person glance shows BOTH N1 (left to
// spend) and N2 (left for unplanned) and screenshots it at 375px (clay) + desktop.

const BASE = 'http://localhost:4173';
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';
const SLUG = 'e2e-money-227';

const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

interface Bypass {
	token: string;
	record: { id: string };
}

async function bypass(email: string): Promise<Bypass> {
	const res = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	if (!res.ok) throw new Error(`auth-bypass ${email} failed: ${res.status} ${await res.text()}`);
	return res.json();
}

async function pb(
	method: string,
	path: string,
	token: string,
	body?: unknown
): Promise<{ status: number; data: any }> {
	const res = await fetch(`${PB_BASE}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: body ? JSON.stringify(body) : undefined
	});
	let data: any = null;
	try {
		data = await res.json();
	} catch {
		/* empty body */
	}
	return { status: res.status, data };
}

async function devLogin(browser: Browser, email: string) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { ctx, page };
}

const pad = (n: number) => String(n).padStart(2, '0');
function pbDate(d: Date): string {
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} 00:00:00.000Z`;
}

test.describe('Trip-Mode Money summary (#227)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeAll(async () => {
		const owner = await bypass(EMAILS.owner);

		// Admin-side fixture: owner + co_owner + traveler + viewer with real users.
		const fixtureRes = await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
			body: JSON.stringify({ emails: EMAILS, slug: SLUG })
		});
		if (!fixtureRes.ok) throw new Error(`rules-fixture failed: ${await fixtureRes.text()}`);
		const { tripId, memberIds } = (await fixtureRes.json()) as {
			tripId: string;
			memberIds: Record<string, string>;
		};

		// PATCH the trip ACTIVE (yesterday → +5d, UTC). Owner can update trip dates; the
		// update hook regenerates day records for the new range. UTC tz -> trip-local
		// today == UTC today, so today ∈ window -> Trip-Mode (clay) chrome.
		const now = new Date();
		const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		const end = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
		await pb('PATCH', `/api/collections/trips/records/${tripId}`, owner.token, {
			start_date: pbDate(start),
			end_date: pbDate(end)
		});

		// Budget (owner/co_owner only): lodging 1400 total + food 80/day + activity 600.
		await pb('POST', `/api/collections/trip_budgets/records`, owner.token, {
			trip: tripId,
			categories: [
				{ category: 'lodging', mode: 'total', daily_amount: null, total: 1400 },
				{ category: 'food', mode: 'per_day', daily_amount: 80, total: 0 },
				{ category: 'activity', mode: 'total', daily_amount: null, total: 600 }
			]
		});

		const today = new Date().toISOString().slice(0, 10);

		// Two expenses, each split equally across all four members:
		//  - $400 group dinner the TRAVELER paid -> owner's share $100 (the "I owe" side).
		//  - $80 cab the OWNER paid               -> owner's share $20.
		// Owner's reconciliation-aware share = $120 (independent of who fronted cash).
		const allMembers = [
			memberIds.owner,
			memberIds.co_owner,
			memberIds.traveler,
			memberIds.viewer
		];
		await pb('POST', `/api/collections/expenses/records`, owner.token, {
			trip: tripId,
			paid_by: memberIds.traveler,
			amount_usd: 400,
			description: 'Group dinner',
			date: today,
			category: 'food',
			split_mode: 'equal',
			split_data: { members: allMembers }
		});
		await pb('POST', `/api/collections/expenses/records`, owner.token, {
			trip: tripId,
			paid_by: memberIds.owner,
			amount_usd: 80,
			description: 'Airport cab',
			date: today,
			category: 'transportation',
			split_mode: 'equal',
			split_data: { members: allMembers }
		});

		// Two unbooked, unlinked items with estimates -> remaining planned (N2 + drill).
		const firstDay = await pb(
			'GET',
			`/api/collections/days/records?filter=${encodeURIComponent(`trip="${tripId}"`)}&perPage=1&sort=date`,
			owner.token
		);
		const dayId = firstDay.data.items?.[0]?.id;
		for (const [title, est] of [
			['Snorkeling tour', 240],
			['Cooking class', 160]
		] as const) {
			await pb('POST', `/api/collections/items/records`, owner.token, {
				trip: tripId,
				day: dayId,
				type: 'activity',
				title,
				booked: false,
				cost_estimate_usd: est,
				status: 'planned'
			});
		}
	});

	test('glance renders both N1 and N2, labeled, per-person', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);
		try {
			await page.goto(`${BASE}/trips/${SLUG}/money`);
			await page.waitForURL('**/money');

			await expect(page.getByText('Left to spend').filter({ visible: true }).first()).toBeVisible({
				timeout: 10000
			});
			await expect(
				page.getByText('Left for unplanned').filter({ visible: true }).first()
			).toBeVisible();

			// Per-day hero framing ("$X/day") appears (active trip -> remaining days > 0).
			await expect(page.getByText(/\$\d+\/day/).filter({ visible: true }).first()).toBeVisible();

			// Honest caveat surfaced.
			await expect(
				page.getByText(/logged expenses only/i).filter({ visible: true }).first()
			).toBeVisible();

			// Remaining-planned drill-down lists the unbooked items.
			await expect(
				page.getByText('Snorkeling tour').filter({ visible: true }).first()
			).toBeVisible();

			// Read-only: no expense/budget edit controls on the glance.
			await expect(page.getByRole('button', { name: /add expense/i })).toHaveCount(0);
			await expect(page.getByRole('button', { name: /save budget/i })).toHaveCount(0);
		} finally {
			await ctx.close();
		}
	});

	test('deep-links to the planning Money pages', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);
		try {
			await page.goto(`${BASE}/trips/${SLUG}/money`);
			await page.waitForURL('**/money');
			await expect(page.locator(`a[href="/trips/${SLUG}/expenses"]`).first()).toHaveCount(1);
		} finally {
			await ctx.close();
		}
	});

	test('visual: clay glance at 375px', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);
		try {
			await page.setViewportSize({ width: 375, height: 812 });
			await page.goto(`${BASE}/trips/${SLUG}/money`);
			await page.waitForURL('**/money');
			await expect(page.getByText('Left to spend').filter({ visible: true }).first()).toBeVisible({
				timeout: 10000
			});

			// Clay chrome assertion: the mode pill / accent is clay on an active trip.
			// (resolveChromeMode -> 'trip' for /money when date-active.) The "You" Pill
			// uses bg-clay; assert a clay element is present.
			await expect(page.locator('.bg-clay').first()).toBeVisible();

			// No horizontal overflow at mobile width.
			const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
			const viewportWidth = await page.evaluate(() => window.innerWidth);
			expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);

			await page.screenshot({ path: '/tmp/wp-227-money-375.png', fullPage: true });
		} finally {
			await ctx.close();
		}
	});

	test('visual: glance at desktop', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, EMAILS.owner);
		try {
			await page.setViewportSize({ width: 1280, height: 900 });
			await page.goto(`${BASE}/trips/${SLUG}/money`);
			await page.waitForURL('**/money');
			await expect(page.getByText('Left to spend').filter({ visible: true }).first()).toBeVisible({
				timeout: 10000
			});
			await page.screenshot({ path: '/tmp/wp-227-money-desktop.png', fullPage: true });
		} finally {
			await ctx.close();
		}
	});
});
