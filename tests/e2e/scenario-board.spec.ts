import { test, expect, type Browser } from '@playwright/test';

// #337 — Candidate Scenarios end to end: pitch → fork → vote + pros/cons → promote,
// then assert the trip is dated, its phases match the winning sketch, the decision
// record is readable, and the board is retired. Runs against the isolated PB the
// e2e harness stands up (PUBLIC_PB_URL); the dev user (E2E_TEST_EMAIL) owns a fresh
// forming trip minted per-run via the PB dev routes.

const BASE = 'http://localhost:4173';
const PB = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';
const EMAIL = process.env.E2E_TEST_EMAIL ?? '';

async function pb(path: string, body: unknown, token?: string) {
	const res = await fetch(`${PB}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
		body: JSON.stringify(body)
	});
	if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
	return res.json();
}

// Create a fresh FORMING (dateless) trip owned by the dev user, return its slug.
async function seedFormingTrip(): Promise<string> {
	const auth = await pb('/api/dev/auth-bypass', { email: EMAIL });
	const token = auth.token as string;
	const slug = `e2e-scenario-${Date.now()}`;
	await fetch(`${PB}/api/collections/trips/records`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: token },
		// No dates → forming. created_by → the after-create hook adds the owner member.
		body: JSON.stringify({ slug, title: 'E2E Scenario Trip', timezone: 'UTC', created_by: auth.record.id })
	}).then((r) => {
		if (!r.ok) throw new Error('trip create failed');
	});
	return slug;
}

async function devLogin(browser: Browser) {
	const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login`);
	await page.waitForURL(/\/(trips|claim)/, { timeout: 15000 });
	return { ctx, page };
}

test.describe('#337 candidate scenarios', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test('pitch → fork → vote + pros/cons → promote → dated trip + decision', async ({ browser }) => {
		const slug = await seedFormingTrip();
		const { page, ctx } = await devLogin(browser);
		try {
			// The forming home leads with the scenario board — empty → "Pitch the first scenario".
			await page.goto(`${BASE}/trips/${slug}`);
			await expect(page.getByTestId('scenario-empty').filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });

			// --- PITCH a scenario WITH dates (promotable) + a two-leg sketch. ------
			// AppShell renders mobile + desktop variants into the DOM (one hidden by
			// CSS), so every shared control resolves to 2 nodes — use .first().
			await page.goto(`${BASE}/trips/${slug}/scenarios/new`);
			await page.getByTestId('sc-title').first().fill('Northern loop');
			await page.locator('input[name="date_start"]').first().fill('2027-09-01');
			await page.locator('input[name="date_end"]').first().fill('2027-09-08'); // 7 nights
			// Sketch: two legs.
			await page.getByRole('button', { name: /add a leg/i }).first().click();
			await page.locator('input[placeholder*="Leg name"]').first().fill('Reykjavik');
			await page.getByRole('button', { name: /add a leg/i }).first().click();
			await page.locator('input[placeholder*="Leg name"]').nth(1).fill('Highlands');
			await page.getByRole('button', { name: /pitch it/i }).first().click();

			// Lands on the detail sheet.
			await page.waitForURL(new RegExp(`/trips/${slug}/scenarios/[^/]+$`), { timeout: 10000 });
			await expect(page.getByRole('heading', { name: 'Northern loop' }).first()).toBeVisible();

			// --- VOTE (Love) + a pro. ---------------------------------------------
			await page.getByTestId('vote-love').first().click();
			await expect(page.getByTestId('vote-love').first()).toHaveAttribute('aria-pressed', 'true');
			await page.getByTestId('point-input').first().fill('Cheapest flights that week');
			await page.getByRole('button', { name: /^add$/i }).first().click();
			await expect(page.getByText('Cheapest flights that week').first()).toBeVisible({ timeout: 8000 });

			// --- FORK it → a second scenario, pre-filled. -------------------------
			await page.getByTestId('fork-scenario').first().click();
			await page.waitForURL(/\/scenarios\/new\?fork=/, { timeout: 10000 });
			// Retitle the fork and pitch it (dates carry over from the source).
			await page.getByTestId('sc-title').first().fill('Northern loop — but longer');
			await page.getByRole('button', { name: /pitch this fork/i }).first().click();
			await page.waitForURL(new RegExp(`/trips/${slug}/scenarios/[^/]+$`), { timeout: 10000 });

			// Back on the board there are now two candidates.
			await page.goto(`${BASE}/trips/${slug}`);
			await expect(page.getByText(/2 candidates/i).first()).toBeVisible({ timeout: 10000 });

			// --- PROMOTE the original. Open it, "Go with this one", confirm. -------
			await page.getByRole('heading', { name: 'Northern loop', exact: true }).first().click();
			await page.waitForURL(new RegExp(`/trips/${slug}/scenarios/[^/]+$`), { timeout: 10000 });
			await page.getByTestId('promote').first().click();
			await page.getByTestId('promote-confirm').first().click();

			// Promotion redirects home — the trip is now dated (board retired → the
			// normal planning overview with Overview/Phases/Lists/Goals sub-tabs).
			await page.waitForURL(new RegExp(`/trips/${slug}$`), { timeout: 15000 });
			await expect(page.getByRole('link', { name: 'Phases', exact: true }).first()).toBeVisible({ timeout: 10000 });
			await expect(page.getByTestId('scenario-board')).toHaveCount(0);

			// The itinerary shows the phases laid out from the sketch.
			await expect(page.getByText('Reykjavik', { exact: true }).first()).toBeVisible({ timeout: 10000 });
			await expect(page.getByText('Highlands', { exact: true }).first()).toBeVisible();

			// --- DECISION record is readable forever (More → How we decided). -----
			await page.goto(`${BASE}/trips/${slug}/more`);
			await page.getByTestId('how-we-decided').first().click();
			await page.waitForURL(new RegExp(`/trips/${slug}/decision$`), { timeout: 10000 });
			await expect(page.getByText('The decision').first()).toBeVisible();
			await expect(page.getByText('Northern loop', { exact: true }).first()).toBeVisible();
			await expect(page.getByText('Chosen').first()).toBeVisible();
			// The losing fork is recorded too.
			await expect(page.getByText('Northern loop — but longer').first()).toBeVisible();
		} finally {
			await ctx.close();
		}
	});
});
