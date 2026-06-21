import { test, expect } from '@playwright/test';

// #246 Door 2 — skip → parking lot + inline ideas strip. A planned today item can
// be skipped from the Today card's overflow; skip returns it to the parking lot
// (unplanned, day cleared, time stripped — reversible, never `considered`), and
// the freed slot renders Door 1's same ideas strip so a backup can be promoted
// into the gap. Verified at 375px.
//
// Harness (same as multi-day.spec.ts): PocketBase :8090 (WAYPOINT_DEV_MODE=true,
// E2E_TEST_EMAIL), SvelteKit preview :4173. AppShell renders +page.svelte twice
// → scope assertions (incl. negatives) to the visible tree.

const BASE_URL = 'http://localhost:4173';
const PLANNED_TITLE = 'Tonight: closed restaurant';
const IDEA_TITLE = 'Backup: street food market';

// Pin trip-local "now" near noon so today's Focus is deterministic (free-time /
// nothing-else, never the wall-clock 8pm+ wrapped state). The skip strip itself is
// sticky via justSkipped so it's tz-robust, but pinning keeps the planned card's
// placement predictable. Etc/GMT-N = UTC+N (inverted sign). See ideas-door spec.
function noonTimezone(): string {
	const utcHour = new Date().getUTCHours();
	let offset = 12 - utcHour;
	if (offset > 12) offset -= 24;
	if (offset < -12) offset += 24;
	if (offset === 0) return 'UTC';
	return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

test.describe('Trip Mode Door 2 — skip → parking lot + ideas strip (#246)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeEach(async ({ page }) => {
		const email = encodeURIComponent(process.env.E2E_TEST_EMAIL!);
		await page.goto(`${BASE_URL}/api/dev/login?email=${email}`);
		await page.waitForURL(`${BASE_URL}/trips`, { timeout: 10000 });
	});

	test('skip a today item → it leaves Today and returns to ideas; promote it back', async ({
		page
	}) => {
		await page.setViewportSize({ width: 375, height: 812 });

		const stamp = Date.now().toString(36);
		const tripTitle = `E2E Door2 ${stamp}`;
		const tripSlug = `e2e-door2-${stamp}`;

		// --- 5-day trip spanning today (tz-robust). One auto-seeded phase. ---
		await page.getByRole('link', { name: 'New Trip' }).click();
		await page.waitForURL(`${BASE_URL}/trips/new`);
		const start = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];
		const end = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];
		await page.fill('input[name="title"]', tripTitle);
		await page.fill('input[name="start_date"]', start);
		await page.fill('input[name="end_date"]', end);
		await page.fill('input[name="location_summary"]', 'Test Location');
		// Pin tz so today's Focus is deterministic regardless of wall-clock hour.
		await page.fill('input[name="timezone"]', noonTimezone());
		await page.getByRole('button', { name: /create|save/i }).click();
		await page.waitForURL(`${BASE_URL}/trips/${tripSlug}`, { timeout: 10000 });

		// --- Park a backup idea in the phase (the replacement candidate). ---
		await page.goto(`${BASE_URL}/trips/${tripSlug}/phases`);
		const phaseLink = page.locator(`a[href^="/trips/${tripSlug}/phases/"]:visible`).first();
		await expect(phaseLink).toBeVisible({ timeout: 5000 });
		const phaseHref = await phaseLink.getAttribute('href');
		await phaseLink.click();
		await page.waitForURL(new RegExp(`/trips/${tripSlug}/phases/`));
		await page.getByRole('button', { name: '+ Add idea' }).filter({ visible: true }).first().click();
		const ideaInput = page.locator('input[name="title"]:visible').first();
		await ideaInput.fill(IDEA_TITLE);
		// Submit via Enter (real mobile path); the submit button is occluded by the
		// fixed FAB/BottomNav below the fold (#168 hit-test scar).
		await ideaInput.press('Enter');
		await expect(page.locator(':visible', { hasText: IDEA_TITLE }).first()).toBeVisible({
			timeout: 5000
		});

		// --- Add a PLANNED item onto TODAY (the skip target). Reached via Now's
		//     Add sheet → "Add item to today" → the item form, day preselected. ---
		await page.goto(`${BASE_URL}/trips/${tripSlug}/now`);
		await page.waitForURL('**/now');
		await page.locator('.md-desktop\\:hidden button[aria-label="Add"]').click();
		await page.getByText('Add item to today').click();
		await page.waitForURL(/\/items\/new/);
		await page.locator('button:has-text("Activity"):visible').first().click();
		const planInput = page.locator('input[name="title"]:visible').first();
		await planInput.fill(PLANNED_TITLE);
		// Submit via Enter — the items/new submit is occluded below the fixed nav on
		// mobile, so a synthetic click is stolen by the overlay (#168 hit-test scar).
		await planInput.press('Enter');

		// Back on Now: the planned item renders in the "Coming up" rest list.
		await page.waitForURL('**/now', { timeout: 10000 });
		// Stretched-link card (#231): target by role/name (aria-label=title), not href+hasText.
		const plannedCard = page.getByRole('link', { name: PLANNED_TITLE }).filter({ visible: true }).first();
		await expect(plannedCard).toBeVisible({ timeout: 7000 });

		// --- Skip it via the card overflow → confirm in the little menu. ---
		// The overflow button sits inside the planned item's card (visible tree).
		const card = page
			.locator('.relative.rounded-xl', { hasText: PLANNED_TITLE })
			.filter({ visible: true })
			.first();
		await card.getByRole('button', { name: 'Item actions' }).click();
		await card.getByRole('menuitem', { name: /Skip/ }).click();

		// After the skip the planned item is GONE from the "Coming up" rest list — it's
		// unplanned now. Scope the negative to the rest-list CARD (TripModeCard's
		// `.relative.rounded-xl` container), NOT the whole page: skip returns the item to
		// THIS phase's parking lot, so it correctly REAPPEARS in the ideas strip below as a
		// re-promotable backup (an <a> inside an <li>, not a card). A page-wide
		// link-count-0 would falsely catch that legitimate strip occurrence.
		await expect(
			page
				.locator('.relative.rounded-xl', { hasText: PLANNED_TITLE })
				.filter({ visible: true })
		).toHaveCount(0, { timeout: 7000 });

		// The ideas strip is visible at the freed gap, offering the parked backup AND the
		// just-skipped item (both are this phase's parking-lot ideas now).
		const strip = page.locator('section[aria-label="Ideas for now"]:visible').first();
		await expect(strip).toBeVisible({ timeout: 5000 });
		await expect(strip.getByText(IDEA_TITLE)).toBeVisible();
		await expect(strip.getByText(PLANNED_TITLE)).toBeVisible();

		// --- Reversible: the skipped item is back in the phase parking lot. ---
		await page.goto(`${BASE_URL}${phaseHref}`);
		await expect(page.locator(':visible', { hasText: PLANNED_TITLE }).first()).toBeVisible({
			timeout: 5000
		});
	});
});
