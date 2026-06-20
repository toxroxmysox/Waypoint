import { test, expect, type Browser } from '@playwright/test';

// #250 / PRD #202 — Contribution Slice 3: reject a ghost → required note + archive.
//
// Binding acceptance flow:
//   owner rejects a pending ghost → a NOTE is required (no one-tap reject) → on
//   reject the ghost leaves every member's parking lot (status → rejected) → the
//   suggestion is retained (surfaces in the Inbox Rejected tab, asserted in the
//   #251 spec) → the AUTHOR — and only the author — is notified, the note carried.
//
// Drives the reject through the in-place Ghost Card affordance on the phase
// parking lot (#249/#250 canReview). Dual-tree scar: scope to the visible subtree.

const BASE = 'http://localhost:4173';
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';

const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test'
};

const FIXTURE_SLUG = 'e2e-rules-test-contrib-rej';

type FixtureIds = { tripId: string; phaseId: string };

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
	return (await res.json()) as FixtureIds;
}

async function devLogin(browser: Browser, email: string) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { ctx, page };
}

test.describe('#250 reject ghost → note + archive', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	let ids: FixtureIds;

	test.beforeAll(async () => {
		ids = await setupFixture();
	});

	test('owner rejects → note required → ghost leaves parking lot → author notified with the note', async ({
		browser
	}) => {
		const ideaTitle = `Reject me ${Date.now()}`;
		const note = 'Out of budget this trip';
		const phaseUrl = `${BASE}/trips/${FIXTURE_SLUG}/phases/${ids.phaseId}`;

		// Traveler submits an idea (auto_approve OFF → a pending Ghost Card).
		const traveler = await devLogin(browser, EMAILS.traveler);
		try {
			await traveler.page.goto(`${BASE}/trips/${FIXTURE_SLUG}/items/new?phase=${ids.phaseId}`);
			await traveler.page.getByLabel(/title/i).filter({ visible: true }).first().fill(ideaTitle);
			await traveler.page
				.getByRole('button', { name: /submit suggestion/i })
				.filter({ visible: true })
				.first()
				.click();
			await traveler.page.waitForURL(new RegExp(`/trips/${FIXTURE_SLUG}`), { timeout: 10000 });
		} finally {
			await traveler.ctx.close();
		}

		// Owner rejects the ghost in place — a note is required.
		const owner = await devLogin(browser, EMAILS.owner);
		try {
			await owner.page.goto(phaseUrl);
			const ghost = owner.page
				.locator('[aria-label="Pending idea: ' + ideaTitle + '"]')
				.filter({ visible: true })
				.first();
			await expect(ghost).toBeVisible({ timeout: 10000 });

			// Open the reject affordance → reveals the required note field.
			await ghost.getByRole('button', { name: /^reject$/i }).first().click();
			const noteField = ghost.getByLabel(/reason for rejecting/i).first();
			await expect(noteField).toBeVisible();

			// Confirm is disabled until a note is typed (no one-tap reject).
			const confirm = ghost.getByRole('button', { name: /confirm reject/i }).first();
			await expect(confirm).toBeDisabled();

			await noteField.fill(note);
			await expect(confirm).toBeEnabled();
			await confirm.click();

			// The ghost leaves the parking lot (status → rejected, no longer pending).
			await expect(
				owner.page
					.locator('[aria-label="Pending idea: ' + ideaTitle + '"]')
					.filter({ visible: true })
			).toHaveCount(0, { timeout: 10000 });
		} finally {
			await owner.ctx.close();
		}

		// The author (traveler) — and only the author — is notified, the note carried.
		const travelerToken = await token(EMAILS.traveler);
		const notifRes = await fetch(`${PB_BASE}/api/notifications/list?limit=50`, {
			headers: { Authorization: `Bearer ${travelerToken}` }
		});
		const notifs = (await notifRes.json()) as { items: Array<{ type: string; body: string }> };
		const rejNotif = notifs.items.find((n) => n.type === 'suggestion_rejected' && n.body.includes(note));
		expect(rejNotif).toBeTruthy();

		// No group rejection noise: the co_owner did NOT get a suggestion_rejected.
		const coOwnerToken = await token(EMAILS.co_owner);
		const coNotifRes = await fetch(`${PB_BASE}/api/notifications/list?limit=50`, {
			headers: { Authorization: `Bearer ${coOwnerToken}` }
		});
		const coNotifs = (await coNotifRes.json()) as { items: Array<{ type: string; body: string }> };
		expect(coNotifs.items.some((n) => n.type === 'suggestion_rejected' && n.body.includes(note))).toBe(
			false
		);
	});
});
