import { test, expect } from '@playwright/test';

// #245 Door 1 — proactive "ideas for now". When today's Focus is free-time /
// nothing-else-planned, the merged Now surfaces the CURRENT PHASE's parked ideas
// (vote-score ordered); one-tap promote slots the idea onto today AFTER the
// current moment (computeMovePatch + sort-order, no phase change) and it renders
// immediately on Now. Critical path: free-time → ideas strip visible → promote →
// item renders on Today. Verified at 375px.
//
// Harness (same as multi-day.spec.ts):
// - PocketBase on :8090 with WAYPOINT_DEV_MODE=true + E2E_TEST_EMAIL set
// - SvelteKit preview auto-booted by playwright.config.ts on :4173
// AppShell renders +page.svelte TWICE (mobile + desktop) → scope every assertion
// (incl. negatives) to the visible tree.

const BASE_URL = 'http://localhost:4173';
const IDEA_TITLE = 'Sunset rooftop drinks';

// Pin the trip to a fixed-offset timezone where trip-local "now" lands at ~noon,
// so an empty today derives to `nothing-else-planned` (door OPEN) — NOT the 8pm+
// `wrapped-summary` (door CLOSED), which is what made this flaky: the Focus state
// is wall-clock-derived (now-state.ts CUTOFF_HOUR), so a CI run after 8pm machine
// time would close Door 1 and the strip would never render. Etc/GMT-N is UTC+N
// (the sign is inverted in the Etc zones). offset = 12 - utcHour keeps trip-local
// now near midday and shifts the calendar date by <1 day (the trip spans ±2d, so
// "today" stays in range). Returns a tz string the trips/new form accepts.
function noonTimezone(): string {
	const utcHour = new Date().getUTCHours();
	// Target trip-local hour 12. offset in hours to add to UTC.
	let offset = 12 - utcHour; // range: 12-23 .. 12-0 → -11 .. 12
	if (offset > 12) offset -= 24;
	if (offset < -12) offset += 24;
	// Etc/GMT-N = UTC+N ; Etc/GMT+N = UTC-N.
	if (offset === 0) return 'UTC';
	return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

test.describe('Trip Mode Door 1 — ideas for now (#245)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeEach(async ({ page }) => {
		const email = encodeURIComponent(process.env.E2E_TEST_EMAIL!);
		await page.goto(`${BASE_URL}/api/dev/login?email=${email}`);
		await page.waitForURL(`${BASE_URL}/trips`, { timeout: 10000 });
	});

	test('free-time → ideas strip → promote → item renders on Today', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });

		const stamp = Date.now().toString(36);
		const tripTitle = `E2E Door1 ${stamp}`;
		const tripSlug = `e2e-door1-${stamp}`;

		// --- Create a 5-day trip spanning today (start -2d .. +2d), tz-robust so
		//     "today" is solidly active mid-range regardless of machine zone. No
		//     items today → Focus is free-time / nothing-else → Door 1 opens. ---
		await page.getByRole('link', { name: 'New Trip' }).click();
		await page.waitForURL(`${BASE_URL}/trips/new`);

		const start = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];
		const end = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];
		await page.fill('input[name="title"]', tripTitle);
		// #270: dates live behind the optional "I know the dates" expander on /trips/new.
		await page.locator('summary', { hasText: 'I know the dates' }).click();
		await page.fill('input[name="start_date"]', start);
		await page.fill('input[name="end_date"]', end);
		await page.fill('input[name="location_summary"]', 'Test Location');
		// Pin tz so today's Focus is deterministically free-time/nothing-else (door OPEN),
		// never the wall-clock 8pm+ wrapped-summary (door CLOSED). See noonTimezone().
		await page.fill('input[name="timezone"]', noonTimezone());
		await page.getByRole('button', { name: /create|save/i }).click();
		await page.waitForURL(`${BASE_URL}/trips/${tripSlug}`, { timeout: 10000 });

		// --- Park an idea in the trip's (auto-seeded "Trip") phase. A new trip
		//     seeds one phase spanning the whole range (#217), so today's current
		//     phase IS that phase → the idea is in scope for Door 1. ---
		await page.goto(`${BASE_URL}/trips/${tripSlug}/phases`);
		const phaseLink = page.locator(`a[href^="/trips/${tripSlug}/phases/"]:visible`).first();
		await expect(phaseLink).toBeVisible({ timeout: 5000 });
		await phaseLink.click();
		await page.waitForURL(new RegExp(`/trips/${tripSlug}/phases/`));

		await page.getByRole('button', { name: '+ Add idea' }).filter({ visible: true }).first().click();
		const ideaInput = page.locator('input[name="title"]:visible').first();
		await ideaInput.fill(IDEA_TITLE);
		// Submit via Enter (the real mobile path — keyboard Go). The "Add to parking
		// lot" button sits below the fold behind the fixed FAB/BottomNav, so a synthetic
		// click is stolen by the overlay (the #168 hit-test scar).
		await ideaInput.press('Enter');
		// The idea card appears in the parking lot (proof it was created).
		await expect(page.locator(':visible', { hasText: IDEA_TITLE }).first()).toBeVisible({
			timeout: 5000
		});

		// --- Now: free-time / nothing-else Focus, with the ideas strip below it. ---
		await page.goto(`${BASE_URL}/trips/${tripSlug}/now`);
		await page.waitForURL('**/now');

		// The door is open. With the pinned noon tz an empty today is `nothing-else-planned`
		// (never the wall-clock-only "Day wrapped"), so the strip renders. Match only the
		// two door-OPEN states — "Day wrapped" would be a FALSE pass (it closes the door).
		await expect(
			page
				.locator(':visible', { hasText: /Free time|Nothing else planned/ })
				.first()
		).toBeVisible({ timeout: 7000 });

		// The ideas strip is visible and lists the parked idea. A fresh trip's idea write +
		// current-phase derivation is occasionally a beat behind the first /now paint —
		// reload once if the strip hasn't rendered yet (the strip is loader-driven, idempotent).
		const strip = page.locator('section[aria-label="Ideas for now"]:visible').first();
		if (!(await strip.isVisible().catch(() => false))) {
			await page.reload();
			await page.waitForURL('**/now');
		}
		await expect(strip).toBeVisible({ timeout: 7000 });
		await expect(strip.getByText(IDEA_TITLE)).toBeVisible();

		// --- One-tap promote ("Do this") → the idea moves onto today. ---
		await strip.getByRole('button', { name: 'Do this' }).first().click();

		// After promote: the idea renders on Today as a normal card (the "Coming up"
		// rest list), and it is GONE from the ideas strip (it's no longer unplanned).
		// Stretched-link card (#231): the <a> has aria-label=title, not the title as
		// child text — target by role/name, not href+hasText.
		const comingUp = page.getByRole('link', { name: IDEA_TITLE }).filter({ visible: true }).first();
		await expect(comingUp).toBeVisible({ timeout: 7000 });
		await expect(
			page.locator('section[aria-label="Ideas for now"]:visible').getByText(IDEA_TITLE)
		).toHaveCount(0);
	});
});
