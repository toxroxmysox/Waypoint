import { test, expect } from '@playwright/test';

// #269 Trip Memory — capture + review critical path (ADR-0007).
//
// One flow, mobile-first (375px): a day-wrapped Now shows the Note Before Bed
// prompt → the composer captures a thought → the card renders under Today's
// memories → editing to EMPTY removes the record (the PRD's clear-both-deletes
// contract) → the empty state + a re-armed NBB prompt return → "Not tonight"
// dismisses without nagging.
//
// Harness (same as trip-mode-ideas-door.spec.ts):
// - PocketBase with WAYPOINT_DEV_MODE=true + E2E_TEST_EMAIL set
// - SvelteKit preview auto-booted by playwright.config.ts on :4173
// AppShell renders +page.svelte TWICE (mobile + desktop) → scope every
// assertion (incl. negatives) to the visible tree.

const BASE_URL = 'http://localhost:4173';
const THOUGHT = 'E2E memory: the harbour at blue hour.';

// Pin the trip to a fixed-offset timezone where trip-local "now" lands at ~9pm,
// so an empty today derives to `wrapped-summary` (now-state.ts CUTOFF_HOUR = 20)
// — the state that opens the Note Before Bed door. Mirrors (and inverts) the
// noonTimezone() trick in trip-mode-ideas-door.spec.ts. Etc/GMT-N is UTC+N.
function eveningTimezone(): string {
	const utcHour = new Date().getUTCHours();
	let offset = 21 - utcHour;
	if (offset > 12) offset -= 24;
	if (offset < -12) offset += 24;
	if (offset === 0) return 'UTC';
	return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

test.describe('Trip Memory — Note Before Bed capture + Today review (#269)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeEach(async ({ page }) => {
		const email = encodeURIComponent(process.env.E2E_TEST_EMAIL!);
		await page.goto(`${BASE_URL}/api/dev/login?email=${email}`);
		await page.waitForURL(`${BASE_URL}/trips`, { timeout: 10000 });
	});

	test('day-wrapped NBB → capture → Today card → clear-both removes → dismiss', async ({
		page
	}) => {
		await page.setViewportSize({ width: 375, height: 812 });

		const stamp = Date.now().toString(36);
		const tripTitle = `E2E Memory ${stamp}`;
		const tripSlug = `e2e-memory-${stamp}`;

		// --- An active trip spanning today, pinned to an "evening" tz so the empty
		//     day derives to wrapped-summary → the NBB door is open. ---
		await page.getByRole('link', { name: 'New Trip' }).click();
		await page.waitForURL(`${BASE_URL}/trips/new`);
		const start = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];
		const end = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];
		await page.fill('input[name="title"]', tripTitle);
		await page.fill('input[name="start_date"]', start);
		await page.fill('input[name="end_date"]', end);
		await page.fill('input[name="location_summary"]', 'Test Location');
		await page.fill('input[name="timezone"]', eveningTimezone());
		await page.getByRole('button', { name: /create|save/i }).click();
		await page.waitForURL(`${BASE_URL}/trips/${tripSlug}`, { timeout: 10000 });

		// --- Now: Day wrapped + the Note Before Bed prompt. ---
		await page.goto(`${BASE_URL}/trips/${tripSlug}/now`);
		await expect(page.getByText('Day wrapped').filter({ visible: true }).first()).toBeVisible({
			timeout: 7000
		});
		const nbb = page.getByText('Note before bed').filter({ visible: true }).first();
		await expect(nbb).toBeVisible();

		// --- Capture: composer sheet → thought → save. ---
		await page.getByRole('button', { name: 'Capture today' }).filter({ visible: true }).first().click();
		const thoughtBox = page.locator('textarea#memory-thought:visible').first();
		await expect(thoughtBox).toBeVisible();
		await thoughtBox.fill(THOUGHT);
		await page.getByRole('button', { name: 'Save memory' }).filter({ visible: true }).first().click();

		// --- Review: the card renders under Today's memories, attributed "You",
		//     and the NBB prompt is gone (captured = never nag again). ---
		const memSection = page.locator('[data-testid="today-memories"]:visible').first();
		await expect(memSection.getByText(THOUGHT)).toBeVisible({ timeout: 7000 });
		await expect(memSection.getByText('You', { exact: true })).toBeVisible();
		await expect(page.getByText('Note before bed').filter({ visible: true })).toHaveCount(0);

		// --- Upsert-delete contract: edit → clear the thought → the button flips
		//     to "Remove memory" → saving deletes the record. ---
		await memSection.getByRole('button', { name: 'Edit your memory' }).first().click();
		const editBox = page.locator('textarea#memory-thought:visible').first();
		await expect(editBox).toHaveValue(THOUGHT);
		await editBox.fill('');
		const removeBtn = page.getByRole('button', { name: 'Remove memory' }).filter({ visible: true }).first();
		await expect(removeBtn).toBeVisible();
		await removeBtn.click();

		// --- Empty state returns ("No memories yet" + capture affordance), and the
		//     NBB prompt re-arms (no memory today, not dismissed). ---
		await expect(memSection.getByText('No memories yet')).toBeVisible({ timeout: 7000 });
		await expect(memSection.getByText(THOUGHT)).toHaveCount(0);
		const nbbAgain = page.getByText('Note before bed').filter({ visible: true }).first();
		await expect(nbbAgain).toBeVisible();

		// --- "Not tonight" dismisses for the day — optional, never nagging. ---
		await page.getByRole('button', { name: 'Not tonight' }).filter({ visible: true }).first().click();
		await expect(page.getByText('Note before bed').filter({ visible: true })).toHaveCount(0);
		// ...and stays dismissed across a reload (localStorage-backed).
		await page.reload();
		await expect(page.getByText('Day wrapped').filter({ visible: true }).first()).toBeVisible({
			timeout: 7000
		});
		await expect(page.getByText('Note before bed').filter({ visible: true })).toHaveCount(0);
	});
});
