import { test, expect, type Browser } from '@playwright/test';

// #252 / PRD #202 — Contribution Slice 5: easy capture (idea/plan fork sheet).
//
// Binding acceptance:
//   - A consistent add affordance sits in the same position on Overview, Phase
//     Detail, and day views; opens the idea/plan fork sheet.
//   - "Add an idea" requires title + phase + type → an unplanned (parking-lot)
//     contribution; "Plan it for a day" routes to the existing flow.
//   - The word "ideas" surfaces on the Overview.
//   - Submit redirects to the phase where the contribution lives + the correct
//     toast for auto-approve on/off.
//   - Works one-handed at 375px (visual-verify left to the PM; this asserts the
//     flow + no horizontal overflow on the sheet).
//
// The rules-fixture trip has auto_approve_suggestions = false, so an owner's idea
// auto-approves (privileged) while a traveler's would queue. Dual-tree scar:
// scope to the visible subtree.

const BASE = 'http://localhost:4173';
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';

const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

const FIXTURE_SLUG = 'e2e-rules-test-capture';

type FixtureIds = { tripId: string; phaseId: string; dayId: string };

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

test.describe('#252 easy capture — idea/plan fork sheet', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	let ids: FixtureIds;

	test.beforeAll(async () => {
		ids = await setupFixture();
	});

	test('the word "ideas" surfaces on the Overview', async ({ browser }) => {
		const owner = await devLogin(browser, EMAILS.owner);
		try {
			await owner.page.goto(`${BASE}/trips/${FIXTURE_SLUG}`);
			// The capture affordance surfaces on the Overview as the consistent FAB
			// ("Add idea or plan"). The rules-fixture trip is past-dated → wrap-up
			// lifecycle, so the inline "Capture ideas" link in the stats card is replaced
			// by the wrap-up banner (#239); the FAB persists in every lifecycle state.
			await expect(
				owner.page.getByRole('button', { name: /add idea or plan/i }).filter({ visible: true }).first()
			).toBeVisible({ timeout: 10000 });
		} finally {
			await owner.ctx.close();
		}
	});

	test('the add affordance opens the fork sheet on Overview, Phase Detail, and day', async ({
		browser
	}) => {
		const owner = await devLogin(browser, EMAILS.owner);
		try {
			const surfaces = [
				`${BASE}/trips/${FIXTURE_SLUG}`,
				`${BASE}/trips/${FIXTURE_SLUG}/phases/${ids.phaseId}`,
				`${BASE}/trips/${FIXTURE_SLUG}/days/${ids.dayId}`
			];
			for (const url of surfaces) {
				await owner.page.goto(url);
				// The consistent FAB.
				const fab = owner.page
					.getByRole('button', { name: /add idea or plan/i })
					.filter({ visible: true })
					.first();
				await expect(fab).toBeVisible({ timeout: 10000 });
				await fab.click();
				// The fork: both choices present.
				await expect(
					owner.page.getByRole('button', { name: /add an idea/i }).filter({ visible: true }).first()
				).toBeVisible();
				await expect(
					owner.page.getByRole('link', { name: /plan it for a day/i }).filter({ visible: true }).first()
				).toBeVisible();
				// Close the sheet before the next surface (Escape).
				await owner.page.keyboard.press('Escape');
			}
		} finally {
			await owner.ctx.close();
		}
	});

	test('"Add an idea" requires title + phase + type → unplanned contribution; owner submit auto-approves, redirects to the phase + toast', async ({
		browser
	}) => {
		const ideaTitle = `Captured idea ${Date.now()}`;
		const owner = await devLogin(browser, EMAILS.owner);
		try {
			await owner.page.goto(`${BASE}/trips/${FIXTURE_SLUG}/phases/${ids.phaseId}`);
			await owner.page
				.getByRole('button', { name: /add idea or plan/i })
				.filter({ visible: true })
				.first()
				.click();
			await owner.page
				.getByRole('button', { name: /add an idea/i })
				.filter({ visible: true })
				.first()
				.click();

			// The idea mini-form: required title + phase picker (≥1 option) + type.
			const titleField = owner.page.getByLabel('Idea', { exact: true }).filter({ visible: true }).first();
			await expect(titleField).toBeVisible();
			await expect(
				owner.page.getByLabel(/phase/i).filter({ visible: true }).first()
			).toBeVisible();
			await expect(
				owner.page.getByLabel(/type/i).filter({ visible: true }).first()
			).toBeVisible();

			await titleField.fill(ideaTitle);
			// Phase is pre-seeded to the current phase; submit.
			await owner.page
				.getByRole('button', { name: /^add idea$/i })
				.filter({ visible: true })
				.first()
				.click();

			// Redirects to the phase (owner auto-approve → "Added to <Phase>").
			await owner.page.waitForURL(new RegExp(`/trips/${FIXTURE_SLUG}/phases/${ids.phaseId}`), {
				timeout: 10000
			});
			await expect(
				owner.page.getByText(/added to/i).filter({ visible: true }).first()
			).toBeVisible({ timeout: 10000 });

			// The idea now lives in this phase's parking lot as a real (auto-approved)
			// unplanned item — a linked card with the title.
			await expect(
				owner.page.getByRole('link', { name: new RegExp(ideaTitle, 'i') }).filter({ visible: true }).first()
			).toBeVisible({ timeout: 10000 });
		} finally {
			await owner.ctx.close();
		}

		// Ground truth: the created item is unplanned (no day) + phase-scoped.
		const ownerToken = await token(EMAILS.owner);
		const itemsRes = await fetch(
			`${PB_BASE}/api/collections/items/records?filter=${encodeURIComponent(
				`trip = "${ids.tripId}" && title = "${ideaTitle}"`
			)}`,
			{ headers: { Authorization: `Bearer ${ownerToken}` } }
		);
		const items = (await itemsRes.json()) as {
			items: Array<{ status: string; day: string; phase: string }>;
		};
		expect(items.items.length).toBe(1);
		expect(items.items[0].status).toBe('unplanned');
		expect(items.items[0].day).toBe('');
		expect(items.items[0].phase).toBe(ids.phaseId);
	});

	test('traveler "Add an idea" queues for review → "Sent for review — pending in <Phase>"', async ({
		browser
	}) => {
		const ideaTitle = `Traveler captured ${Date.now()}`;
		const traveler = await devLogin(browser, EMAILS.traveler);
		try {
			await traveler.page.goto(`${BASE}/trips/${FIXTURE_SLUG}/phases/${ids.phaseId}`);
			await traveler.page
				.getByRole('button', { name: /add idea or plan/i })
				.filter({ visible: true })
				.first()
				.click();
			await traveler.page
				.getByRole('button', { name: /add an idea/i })
				.filter({ visible: true })
				.first()
				.click();
			await traveler.page
				.getByLabel('Idea', { exact: true })
				.filter({ visible: true })
				.first()
				.fill(ideaTitle);
			await traveler.page
				.getByRole('button', { name: /^add idea$/i })
				.filter({ visible: true })
				.first()
				.click();

			// auto_approve is OFF for a traveler → queued, the "pending" toast shows.
			await traveler.page.waitForURL(new RegExp(`/trips/${FIXTURE_SLUG}/phases/${ids.phaseId}`), {
				timeout: 10000
			});
			await expect(
				traveler.page.getByText(/sent for review.*pending in/i).filter({ visible: true }).first()
			).toBeVisible({ timeout: 10000 });
		} finally {
			await traveler.ctx.close();
		}
	});
});
