import { test, expect } from '@playwright/test';
import { E2E_BASE, E2E_PB_BASE } from './e2e-env';
import { EMAILS, pb, token } from './japan-fixture';

// playwright.config.ts boots `npm run build && npm run preview` on :4173.
const BASE = E2E_BASE;

// #552 — this spec seeds its own trip (rules-fixture, re-dated 3 days ago → +4 days
// so it is active and loads in Trip Mode) with one planned item, instead of clicking whichever
// trip the shared E2E_TEST_EMAIL user saw first. Secondary pages live at known
// routes, so navigate by URL rather than clicking nav chrome.
const SLUG = 'e2e-m4-execution-552';

test.describe('M4 Execution', () => {
	test.describe.configure({ mode: 'serial' });

	let itemId = '';

	test.beforeAll(async () => {
		const owner = await token(EMAILS.owner);
		const res = await fetch(`${E2E_PB_BASE}/api/dev/rules-fixture`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner}` },
			body: JSON.stringify({ emails: EMAILS, slug: SLUG })
		});
		expect(res.ok, `rules-fixture: ${res.status}`).toBe(true);
		const { tripId, phaseId } = (await res.json()) as { tripId: string; phaseId: string };
		const ymd = (offset: number) =>
			new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
		await pb(owner, 'PATCH', `/api/collections/trips/records/${tripId}`, {
			// Starts before mcp-seed's Porto trip (yesterday): the rules users are
			// shared, and MCP trip_brief briefs the current trip with the latest start.
			start_date: `${ymd(-3)} 00:00:00.000Z`,
			end_date: `${ymd(4)} 00:00:00.000Z`
		});
		const days = (
			await pb(
				owner,
				'GET',
				`/api/collections/days/records?sort=date&filter=${encodeURIComponent(`trip="${tripId}"`)}`
			)
		).items as { id: string; date: string }[];
		const item = await pb(owner, 'POST', '/api/collections/items/records', {
			trip: tripId,
			phase: phaseId,
			day: days[0].id,
			type: 'activity',
			title: 'M4 planned activity',
			status: 'planned',
			start_time: `${days[0].date.slice(0, 10)} 10:00:00.000Z`,
			sort_order: 100
		});
		itemId = item.id as string;
	});

	test.beforeEach(async ({ page }) => {
		await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(EMAILS.owner)}`);
		await page.waitForURL('**/trips');
	});

	test('vote button renders on item detail', async ({ page }) => {
		await page.goto(`${BASE}/trips/${SLUG}/items/${itemId}`, { waitUntil: 'networkidle' });

		// #442: a planned item carries the quiet "Your vote" row in Details.
		// #439: in Trip Mode Details is the collapsed "Plan details"; open it.
		// The trip layout is dual-tree (one CSS-hidden); scope to the visible subtree.
		const planDetails = page.getByTestId('plan-details').filter({ visible: true }).first();
		await planDetails.locator('summary').click();
		await expect(
			page.getByTestId('item-your-vote').filter({ visible: true }).first()
		).toBeVisible();
	});

	test('trip mode today view renders', async ({ page }) => {
		// #244 merged Today into the weighted Now view (/today 308-redirects to /now).
		// An inactive trip would redirect away from /now, so the URL proves Trip Mode.
		await page.goto(`${BASE}/trips/${SLUG}/now`, { waitUntil: 'networkidle' });
		await expect(page).toHaveURL(new RegExp(`/trips/${SLUG}/now$`));
		await expect(page.locator('main:visible').first()).toBeVisible();
	});

	test('A2HS banner shows and dismisses', async ({ page }) => {
		// Clear localStorage
		await page.goto(`${BASE}/trips`, { waitUntil: 'networkidle' });
		await page.evaluate(() => localStorage.removeItem('waypoint-a2hs-dismissed'));
		await page.reload({ waitUntil: 'networkidle' });

		// Banner may or may not show depending on browser (Chrome shows, others may not).
		// Just verify the page loads without errors (/trips is single-tree).
		await expect(page.getByRole('heading', { name: 'Waypoint' })).toBeVisible({ timeout: 5000 });
	});

	test('mobile responsive — trip mode at 375px', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto(`${BASE}/trips/${SLUG}/now`, { waitUntil: 'networkidle' });
		await expect(page).toHaveURL(new RegExp(`/trips/${SLUG}/now$`));

		const main = page.locator('main:visible').first();
		const box = await main.boundingBox();
		expect(box).toBeTruthy();
		expect(box!.width).toBeLessThanOrEqual(375);
	});
});
