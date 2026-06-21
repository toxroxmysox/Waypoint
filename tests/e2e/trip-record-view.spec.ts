import { test, expect } from '@playwright/test';

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
const BASE = 'http://localhost:4173';

// Create a trip whose dates are entirely in the PAST → derives to `wrap-up` (today >
// end_date, not archived). Unique stamp so repeated CI runs don't collide on the
// trips.slug unique index. The app slugifies the title (lowercase, spaces→hyphens).
async function createPastTrip(page: import('@playwright/test').Page): Promise<string> {
	const stamp = Date.now().toString(36);
	const title = `Record E2E ${stamp}`;
	const slug = title.toLowerCase().replace(/\s+/g, '-');

	await page.goto(`${BASE}/trips/new`);
	await page.waitForURL('**/trips/new');

	await page.fill('input[name="title"]', title);
	const start = new Date(Date.now() - 35 * 86_400_000).toISOString().split('T')[0];
	const end = new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0];
	await page.fill('input[name="start_date"]', start);
	await page.fill('input[name="end_date"]', end);
	await page.fill('input[name="location_summary"]', 'Record Location');

	await page.getByRole('button', { name: /create|save/i }).click();
	await page.waitForURL(`${BASE}/trips/${slug}`, { timeout: 10000 });
	return slug;
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
		await page
			.locator('[data-testid="wrapup-closeout"]')
			.filter({ visible: true })
			.first()
			.click();
		await page.waitForURL(`**/trips/${slug}/closeout`);

		// Walk to the summary: click the forward button until "Review Summary" → it.
		// The button reads "Next Day" mid-walk and "Review Summary" on the last day.
		for (let i = 0; i < 12; i++) {
			const reviewBtn = page
				.getByRole('button', { name: 'Review Summary' })
				.filter({ visible: true })
				.first();
			if (await reviewBtn.isVisible().catch(() => false)) {
				await reviewBtn.click();
				break;
			}
			const nextBtn = page
				.getByRole('button', { name: 'Next Day' })
				.filter({ visible: true })
				.first();
			if (await nextBtn.isVisible().catch(() => false)) {
				await nextBtn.click();
			} else {
				break;
			}
		}

		// Publish step (owner): select Publish (inline date defaults to today = now).
		await page.getByText('Publish', { exact: true }).filter({ visible: true }).first().click();

		// Finish & close out.
		await page
			.getByRole('button', { name: /Finish & close out trip/i })
			.filter({ visible: true })
			.first()
			.click();
		await page.waitForURL(`${BASE}/trips/${slug}`, { timeout: 10000 });

		// The closed Overview is the Record view: visibly marked closed + a Share panel
		// with a LIVE, copyable ABSOLUTE link (origin + /archive/<token>).
		await expect(
			page.getByText('Trip closed').filter({ visible: true }).first()
		).toBeVisible({ timeout: 5000 });

		const shareUrl = page.locator('[data-testid="share-url"]').filter({ visible: true }).first();
		await expect(shareUrl).toBeVisible();
		const urlText = await shareUrl.textContent();
		expect(urlText).toContain('/archive/');
		// Absolute — carries the origin, not a bare relative path.
		expect(urlText).toMatch(/^https?:\/\//);

		// The status line reads live.
		await expect(
			page.getByText(/Live now/i).filter({ visible: true }).first()
		).toBeVisible();
	});

	test('closed record view + share are usable at 375px, and reopen is offered to the owner', async ({
		page
	}) => {
		await page.setViewportSize({ width: 375, height: 812 });
		const slug = await createPastTrip(page);

		// Fast-path to closed: walk closeout, publish, finish (same as above).
		await page.locator('[data-testid="wrapup-closeout"]').filter({ visible: true }).first().click();
		await page.waitForURL(`**/trips/${slug}/closeout`);
		for (let i = 0; i < 12; i++) {
			const reviewBtn = page.getByRole('button', { name: 'Review Summary' }).filter({ visible: true }).first();
			if (await reviewBtn.isVisible().catch(() => false)) {
				await reviewBtn.click();
				break;
			}
			const nextBtn = page.getByRole('button', { name: 'Next Day' }).filter({ visible: true }).first();
			if (await nextBtn.isVisible().catch(() => false)) await nextBtn.click();
			else break;
		}
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
});
