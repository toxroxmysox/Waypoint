import { test, expect, type Page } from '@playwright/test';

// Offline read-only active trip (#255, PRD #203). The "plane" proof: after one
// online open of the active trip, go offline (Playwright's real offline
// emulation), cold-launch via reload, and confirm the cached trip is browsable
// read-only — shell + trip render (never a raw 503), days are reachable, and a
// mutation attempt is blocked with the offline toast. Read navigation is
// unaffected. playwright.config.ts boots build+preview on :4173; globalSetup
// seeds one active baseline trip (slug e2e-active-trip, with day records).
const BASE = 'http://localhost:4173';

async function openActiveTrip(page: Page): Promise<string> {
	await page.goto(`${BASE}/trips`);
	await page.locator('a[href*="/trips/"]').first().click();
	await page.waitForURL('**/trips/**');
	return page.url().split('/trips/')[1].split(/[/?#]/)[0];
}

// A day URL for the active trip, taken from a day link the trip surfaces while
// online (so it — and its data payload — get cached for the offline leg).
async function firstDayHref(page: Page, slug: string): Promise<string | null> {
	await page.goto(`${BASE}/trips/${slug}`);
	await page.waitForURL(`**/trips/${slug}`);
	const dayLink = page.locator(`a[href*="/trips/${slug}/days/"]`).first();
	if ((await dayLink.count()) === 0) return null;
	const href = await dayLink.getAttribute('href');
	if (href) {
		// Visit it online so the page + its __data.json land in cache.
		await page.goto(`${BASE}${href}`);
		await page.waitForURL('**/days/**');
	}
	return href;
}

test.describe('Offline — read-only active trip on a plane (#255)', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${BASE}/api/dev/login`);
		await page.waitForURL('**/trips');
	});

	test('cold-launch offline renders the cached trip; today visible; edit blocked with toast', async ({
		page,
		context
	}) => {
		await page.setViewportSize({ width: 375, height: 812 });

		// ── Online: open the active trip and warm the cache for the surfaces we'll
		// browse offline (overview, Now, a day). The SW caches navigations +
		// __data.json network-first as we visit; the app-open prefetch also fires.
		const slug = await openActiveTrip(page);
		await page.goto(`${BASE}/trips/${slug}/now`);
		await page.waitForURL('**/now');
		await expect(page.locator('main:visible').first()).toBeVisible();
		const dayHref = await firstDayHref(page, slug);

		// Give the SW a beat to finish writing the network-first caches.
		await page.waitForTimeout(500);

		// ── Go offline and cold-launch (reload) the Now surface. The shell +
		// cached trip must render — never a raw 503 'Offline'.
		await context.setOffline(true);
		await page.goto(`${BASE}/trips/${slug}/now`);
		await page.waitForLoadState('domcontentloaded');

		// Not the raw SW 503 body.
		await expect(page.locator('body')).not.toHaveText(/^Offline$/);
		// The app shell rendered (Waypoint chrome present) and trip content shows.
		await expect(page.locator('main:visible').first()).toBeVisible();

		// The automatic offline banner is up, prominent in Trip Mode, naming the trip.
		const banner = page.locator('[data-testid="offline-banner"]:visible').first();
		await expect(banner).toBeVisible();
		await expect(banner).toContainText(/Offline — showing .* as of/);

		// ── Read navigation offline: open the cached day (its page + payload were
		// warmed online). It renders from cache, not a 503.
		if (dayHref) {
			await page.goto(`${BASE}${dayHref}`);
			await page.waitForLoadState('domcontentloaded');
			await expect(page.locator('body')).not.toHaveText(/^Offline$/);
			await expect(page.getByText('Notes').filter({ visible: true }).first()).toBeVisible();

			// ── Write-guard: attempt to edit (a mutation) while offline → blocked
			// with the offline toast; read navigation was unaffected above.
			await page.getByRole('button', { name: 'Edit' }).filter({ visible: true }).first().click();
			await page.locator('textarea[name="notes"]:visible').first().fill('offline edit attempt');
			await page.getByRole('button', { name: /^Save/ }).filter({ visible: true }).first().click();

			await expect(
				page.getByText("You're offline — reconnect to make changes").filter({ visible: true })
			).toBeVisible();
		}

		await context.setOffline(false);
	});

	test('back online clears the offline banner', async ({ page, context }) => {
		const slug = await openActiveTrip(page);
		await page.goto(`${BASE}/trips/${slug}/now`);
		await page.waitForURL('**/now');

		await context.setOffline(true);
		// Nudge the page to observe the offline event (emulation fires it on the context).
		await expect(page.locator('[data-testid="offline-banner"]:visible').first()).toBeVisible();

		await context.setOffline(false);
		await expect(page.locator('[data-testid="offline-banner"]')).toHaveCount(0);
	});
});
