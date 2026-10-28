import { test, expect } from '@playwright/test';
import { E2E_BASE } from './e2e-env';
import { EMAILS, token, pb, devLogin, seedOwnTrip } from './japan-fixture';

// #242 critical path: trip ended → wrap-up banner → launch closeout → walk to the
// publish step → "Publish now" → finish → the closed Overview is the read-only Record
// view with a LIVE, copyable ABSOLUTE share link. Prior art: wrap-up-banner.spec.ts,
// trip-mode-views.spec.ts.
//
// playwright.config.ts boots `npm run build && npm run preview` on :4173.
// The trip layout is dual-tree (mobile + desktop, one CSS-hidden) — scope every content
// locator to the visible subtree (#239 guardrail). Forms below the fold behind the
// fixed FAB/BottomNav are occlusion-stolen on a synthetic click (#168) — but the
// closeout finish button sits in flow, so a normal click is fine here.
const BASE = E2E_BASE;

// Create a trip whose dates are entirely in the PAST → derives to `wrap-up` (today >
// end_date, not archived). Unique stamp so repeated CI runs don't collide on the
// trips.slug unique index. The app slugifies the title (lowercase, spaces→hyphens).
async function createPastTrip(page: import('@playwright/test').Page): Promise<string> {
	const stamp = Date.now().toString(36);
	const title = `Record E2E ${stamp}`;
	const slug = title.toLowerCase().replace(/\s+/g, '-');

	await page.goto(`${BASE}/trips/new`, { waitUntil: 'networkidle' });
	await page.waitForURL('**/trips/new');

	await page.fill('input[name="title"]', title);
	const start = new Date(Date.now() - 35 * 86_400_000).toISOString().split('T')[0];
	const end = new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0];
	// #270 (name-first create): dates are OPTIONAL and shown INLINE — no "I know the
	// dates" disclosure anymore. Fill the visible date fields directly to make a dated
	// (past) trip → wrap-up. (The old <summary> expander was removed with #270.)
	await page.fill('input[name="start_date"]', start);
	await page.fill('input[name="end_date"]', end);
	await page.fill('input[name="location_summary"]', 'Record Location');

	await page.getByRole('button', { name: /create|save/i }).click();
	await page.waitForURL(`${BASE}/trips/${slug}`, { timeout: 10000 });
	return slug;
}

// Walk the closeout day-by-day wizard from the first day to the Summary step,
// where the "Finish & close out trip" button lives. The forward button reads
// "Next Day" mid-walk, then "Review ideas" or "Review Summary" on the last day;
// an optional ideas-review step ("Continue") may sit between the last day and the
// summary. Click whichever forward affordance is present each iteration until the
// finish button shows. Bounded so a stuck wizard fails the assertion, not hangs.
async function walkCloseoutToSummary(page: import('@playwright/test').Page) {
	const finishBtn = page
		.getByRole('button', { name: /Finish & close out trip/i })
		.filter({ visible: true });
	const forwardNames = ['Review Summary', 'Review ideas', 'Continue', 'Next Day'];
	for (let i = 0; i < 30; i++) {
		if ((await finishBtn.count()) > 0) return;
		let advanced = false;
		for (const name of forwardNames) {
			const btn = page.getByRole('button', { name }).filter({ visible: true }).first();
			if (await btn.isVisible().catch(() => false)) {
				await btn.click();
				advanced = true;
				break;
			}
		}
		if (!advanced) {
			// No forward affordance and no finish button yet — wait briefly for the
			// next step to render, then re-check (covers a load()/enhance refresh).
			await page.waitForTimeout(250);
		}
	}
	// Surface a clear failure if the summary never appeared.
	await expect(finishBtn.first()).toBeVisible({ timeout: 5000 });
}

// Select "Publish" on the summary's PublishControl. The radio is sr-only inside a
// <label>; click the label's visible "Publish" text — the label association toggles
// the radio. Then confirm the publish date field appeared (proves the toggle took).
async function selectPublish(page: import('@playwright/test').Page) {
	await page.getByText('Publish', { exact: true }).filter({ visible: true }).first().click();
	await expect(page.locator('input[name="publish_date"]:visible').first()).toBeVisible({
		timeout: 5000
	});
}

test.describe('Closed Record view + Share + reopen (#242)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeEach(async ({ page }) => {
		const email = encodeURIComponent(process.env.E2E_TEST_EMAIL!);
		await page.goto(`${BASE}/api/dev/login?email=${email}`);
		await page.waitForURL(`${BASE}/trips`, { timeout: 10000 });
	});

	test('wrap-up → closeout → Publish now → finish → record view with a live absolute link', async ({
		page
	}) => {
		const slug = await createPastTrip(page);

		// Launch closeout from the wrap-up banner.
		await page.locator('[data-testid="wrapup-closeout"]').filter({ visible: true }).first().click();
		await page.waitForURL(`**/trips/${slug}/closeout`);

		// Walk the day cards to the summary. The forward button reads "Next Day"
		// mid-walk, then "Review ideas" (if the trip has unplanned parking-lot ideas)
		// or "Review Summary" on the last day; a freshly created trip has no items so
		// it reads "Review Summary", but handle "Review ideas"→"Continue" defensively.
		await walkCloseoutToSummary(page);

		// Publish step (owner): select Publish. The radio is sr-only inside its <label>;
		// click the label (carrying the visible "Publish" text) to toggle it. Inline date
		// defaults to today = publish now.
		await selectPublish(page);

		// Finish & close out.
		await page
			.getByRole('button', { name: /Finish & close out trip/i })
			.filter({ visible: true })
			.first()
			.click();
		await page.waitForURL(`${BASE}/trips/${slug}`, { timeout: 10000 });

		// The closed Overview is the Record view: visibly marked closed + a Share panel
		// with a LIVE, copyable ABSOLUTE link (origin + /archive/<token>).
		await expect(page.getByText('Trip closed').filter({ visible: true }).first()).toBeVisible({
			timeout: 5000
		});

		const shareUrl = page.locator('[data-testid="share-url"]').filter({ visible: true }).first();
		await expect(shareUrl).toBeVisible();
		const urlText = await shareUrl.textContent();
		expect(urlText).toContain('/archive/');
		// Absolute — carries the origin, not a bare relative path.
		expect(urlText).toMatch(/^https?:\/\//);

		// The status line reads live.
		await expect(
			page
				.getByText(/Live now/i)
				.filter({ visible: true })
				.first()
		).toBeVisible();

		// #343 absence-is-silent: this trip was dated straight from /trips/new (never a
		// forming→scenario promotion), so it has no `decisions` record. The record view
		// must render NOTHING for the origin-story section — no empty heading leaks in.
		await expect(
			page.getByText('How this trip came together').filter({ visible: true })
		).toHaveCount(0);
	});

	test('closed record view + share are usable at 375px, and reopen is offered to the owner', async ({
		page
	}) => {
		await page.setViewportSize({ width: 375, height: 812 });
		const slug = await createPastTrip(page);

		// Fast-path to closed: walk closeout, finish (same as above).
		await page.locator('[data-testid="wrapup-closeout"]').filter({ visible: true }).first().click();
		await page.waitForURL(`**/trips/${slug}/closeout`);
		await walkCloseoutToSummary(page);
		// Keep private this time (default) — still closes; the record view still renders.
		await page
			.getByRole('button', { name: /Finish & close out trip/i })
			.filter({ visible: true })
			.first()
			.click();
		await page.waitForURL(`${BASE}/trips/${slug}`, { timeout: 10000 });

		// Closed marker visible in the 375px column.
		await expect(page.getByText('Trip closed').filter({ visible: true }).first()).toBeVisible({
			timeout: 5000
		});

		// Owner gets the low-emphasis Reopen control.
		await expect(
			page.locator('[data-testid="reopen-trip"]').filter({ visible: true }).first()
		).toBeVisible();
	});

	// #343 — when the trip DOES carry a scenario decision (#337), the closed record
	// surfaces it read-only as "How this trip came together": the chosen scenario,
	// picked over the others, on its date. `decisions` is hook-only/immutable, so we
	// mint the snapshot via the isolated PB's superuser API (bypasses the no-client-
	// write rule), then reload the closed record and assert the section renders.
	test('closed record surfaces the scenario decision as the origin-story section', async ({
		page,
		request
	}) => {
		const slug = await createPastTrip(page);

		// Close the trip via the closeout walk (keep private — the record still renders).
		await page.locator('[data-testid="wrapup-closeout"]').filter({ visible: true }).first().click();
		await page.waitForURL(`**/trips/${slug}/closeout`);
		await walkCloseoutToSummary(page);
		await page
			.getByRole('button', { name: /Finish & close out trip/i })
			.filter({ visible: true })
			.first()
			.click();
		await page.waitForURL(`${BASE}/trips/${slug}`, { timeout: 10000 });
		await expect(page.getByText('Trip closed').filter({ visible: true }).first()).toBeVisible({
			timeout: 5000
		});

		// Seed a decision snapshot directly on the isolated PB (superuser bypasses the
		// hook-only create rule). e2e-clean-pb.sh upserts admin@e2e.test/e2eAdminPass123.
		const PB = process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8099';
		const admin = await request.post(`${PB}/api/collections/_superusers/auth-with-password`, {
			data: { identity: 'admin@e2e.test', password: 'e2eAdminPass123' }
		});
		expect(admin.ok()).toBeTruthy();
		const adminToken = (await admin.json()).token as string;

		const tripRes = await request.get(
			`${PB}/api/collections/trips/records?filter=${encodeURIComponent(`slug="${slug}"`)}`,
			{ headers: { Authorization: adminToken } }
		);
		const tripId = (await tripRes.json()).items[0].id as string;

		const created = await request.post(`${PB}/api/collections/decisions/records`, {
			headers: { Authorization: adminToken },
			data: {
				trip: tripId,
				payload: {
					chosen_title: 'Coastal Portugal, 7 nights',
					chooser_name: 'Maya',
					decided_at: new Date().toISOString(),
					scenarios: [
						{ id: 'a', title: 'Coastal Portugal, 7 nights', champion_name: 'Maya', won: true },
						{ id: 'b', title: 'Swiss Alps hiking', champion_name: 'Theo', won: false },
						{ id: 'c', title: 'Kyoto in autumn', champion_name: 'Priya', won: false }
					]
				}
			}
		});
		expect(created.ok()).toBeTruthy();

		// Reload the closed record — the origin-story section now renders.
		await page.reload({ waitUntil: 'networkidle' });
		const section = page.getByText('How this trip came together').filter({ visible: true }).first();
		await expect(section).toBeVisible({ timeout: 5000 });
		// Names the chosen scenario, the runners-up, and the chooser.
		await expect(
			page
				.getByText(/Coastal Portugal, 7 nights/)
				.filter({ visible: true })
				.first()
		).toBeVisible();
		await expect(
			page
				.getByText(/Swiss Alps hiking and Kyoto in autumn/)
				.filter({ visible: true })
				.first()
		).toBeVisible();
		await expect(page.getByText('Chosen by Maya.').filter({ visible: true }).first()).toBeVisible();
		// Deep-links to the full "How we decided" record.
		await expect(
			page
				.getByRole('link', { name: /How we decided/ })
				.filter({ visible: true })
				.first()
		).toHaveAttribute('href', `/trips/${slug}/decision`);
	});
});

// #576 — ratings on the closed Record + the public archive, and the Rate activities
// link. Seeds a closed trip via the rules-fixture API (owner/traveler/viewer).
test.describe('Record + archive ratings (#576)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');
	test.describe.configure({ mode: 'serial' });

	const slug = 'e2e-record-rating-576';
	let shareToken = '';

	test.beforeAll(async () => {
		const { tripId, phaseId } = await seedOwnTrip(slug);
		const owner = await token(EMAILS.owner);
		const days = (
			await pb(
				owner,
				'GET',
				`/api/collections/days/records?perPage=50&sort=date&filter=${encodeURIComponent(`trip="${tripId}"`)}`
			)
		).items as { id: string }[];
		const mk = (title: string, status: string, rating = '') =>
			pb(owner, 'POST', '/api/collections/items/records', {
				trip: tripId,
				phase: phaseId,
				day: days[0].id,
				type: 'activity',
				title,
				status: 'planned',
				sort_order: 100 + Math.floor(Math.random() * 1000)
			}).then((it) =>
				pb(owner, 'PATCH', `/api/collections/items/records/${it.id}`, { status, rating })
			);
		await mk('Rated up item', 'done', 'recommend');
		await mk('Rated down item', 'done', 'not_recommend');
		await mk('Unrated item', 'done');
		await mk('Skipped item', 'considered');
		shareToken = `rating576${Date.now().toString(36)}`;
		await pb(owner, 'PATCH', `/api/collections/trips/records/${tripId}`, {
			archived: true,
			archive_enabled: true,
			archive_publish_at: '2026-01-01 00:00:00.000Z',
			public_share_token: shareToken
		});
	});

	const card = (page: import('@playwright/test').Page, title: string) =>
		page.locator('[data-record-card]').filter({ visible: true }).filter({ hasText: title });

	test('record shows 👍/👎 on rated items, nothing on an unrated one', async ({ browser }) => {
		const { page, close } = await devLogin(browser, EMAILS.owner);
		await page.goto(`${BASE}/trips/${slug}`, { waitUntil: 'networkidle' });
		await expect(card(page, 'Rated up item').getByLabel('Recommended')).toHaveText('👍');
		await expect(card(page, 'Rated down item').getByLabel('Not recommended')).toHaveText('👎');
		await expect(card(page, 'Unrated item')).toBeVisible();
		await expect(card(page, 'Unrated item').getByLabel('Recommended')).toHaveCount(0);
		await expect(card(page, 'Unrated item').getByLabel('Not recommended')).toHaveCount(0);
		await close();
	});

	test("Didn't do item sits under considered, not under done", async ({ browser }) => {
		const { page, close } = await devLogin(browser, EMAILS.owner);
		await page.goto(`${BASE}/trips/${slug}`, { waitUntil: 'networkidle' });
		await expect(card(page, 'Skipped item')).toHaveCount(0);
		await page
			.getByRole('button', { name: /What we considered/ })
			.filter({ visible: true })
			.click();
		await expect(
			page.locator('[data-considered]').filter({ visible: true }).getByText('Skipped item')
		).toBeVisible();
		await close();
	});

	test('traveler sees Rate activities; viewer does not', async ({ browser }) => {
		const t = await devLogin(browser, EMAILS.traveler);
		await t.page.goto(`${BASE}/trips/${slug}`, { waitUntil: 'networkidle' });
		const link = t.page.getByRole('link', { name: 'Rate activities' }).filter({ visible: true });
		await expect(link).toBeVisible();
		await expect(link).toHaveAttribute('href', `/trips/${slug}/closeout`);
		await t.close();
		const v = await devLogin(browser, EMAILS.viewer);
		await v.page.goto(`${BASE}/trips/${slug}`, { waitUntil: 'networkidle' });
		await expect(card(v.page, 'Rated up item')).toBeVisible();
		await expect(
			v.page.getByRole('link', { name: 'Rate activities' }).filter({ visible: true })
		).toHaveCount(0);
		await v.close();
	});

	test('public archive shows the same marks', async ({ page }) => {
		await page.goto(`${BASE}/archive/${shareToken}`, { waitUntil: 'networkidle' });
		await expect(card(page, 'Rated up item').getByLabel('Recommended')).toHaveText('👍');
		await expect(card(page, 'Rated down item').getByLabel('Not recommended')).toHaveText('👎');
		await expect(card(page, 'Unrated item').getByLabel('Recommended')).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Rate activities' })).toHaveCount(0);
	});
});
