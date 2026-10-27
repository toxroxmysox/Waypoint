import { test, expect } from '@playwright/test';
import { E2E_BASE } from './e2e-env';
import { loginOwner, seedOwnTrip } from './japan-fixture';

// playwright.config.ts boots `npm run build && npm run preview` on :4173.
const BASE = E2E_BASE;

// #563 — this spec seeds its own active trip (Trip Mode, no "More" tab) instead of
// clicking whichever trip the shared E2E_TEST_EMAIL user saw first. Navigate by URL
// (mode- and viewport-independent) instead of clicking nav chrome.
const SLUG = 'e2e-m6-polish-563';

test.describe('M6 Polish', () => {
	test.describe.configure({ mode: 'serial' });

	test.beforeAll(async () => {
		await seedOwnTrip(SLUG, { active: true });
	});

	test.beforeEach(async ({ page }) => {
		await loginOwner(page);
	});

	test('clone trip link visible on More page for owner', async ({ page }) => {
		await page.goto(`${BASE}/trips/${SLUG}/more`, { waitUntil: 'networkidle' });
		await expect(page.getByText('Clone trip').filter({ visible: true }).first()).toBeVisible();
	});

	test('clone trip page renders with form', async ({ page }) => {
		await page.goto(`${BASE}/trips/${SLUG}/clone`, { waitUntil: 'networkidle' });
		await expect(page).toHaveURL(new RegExp(`/trips/${SLUG}/clone$`));

		await expect(page.locator('input[name="title"]:visible').first()).toBeVisible();
		await expect(page.locator('input[name="start_date"]:visible').first()).toBeVisible();
		await expect(page.locator('input[name="include_phases"]:visible').first()).toBeVisible();
	});

	// #86: the trip-wide Parking Lot page is retired (Parking Lot is phase-scoped).
	// The More menu must no longer link to it.
	test('parking lot link is gone from More page (#86)', async ({ page }) => {
		await page.goto(`${BASE}/trips/${SLUG}/more`, { waitUntil: 'networkidle' });
		// Wait for the menu to render via a sibling card that stays (Export is always present).
		await expect(page.getByText('Export').filter({ visible: true }).first()).toBeVisible();
		await expect(page.getByText('Parking lot')).toHaveCount(0);
	});

	// #86: the old /parking-lot route redirects to the phases list.
	test('trip-wide /parking-lot redirects to phases list (#86)', async ({ page }) => {
		await page.goto(`${BASE}/trips/${SLUG}/parking-lot`, { waitUntil: 'networkidle' });
		await page.waitForURL(`**/trips/${SLUG}/phases`);
		expect(page.url()).toContain(`/trips/${SLUG}/phases`);
	});

	// NOTE: the Print itinerary feature was removed (#209) — its More-page button
	// test was deleted with it.

	// NOTE: the "checklist template picker" test was removed when the checklist
	// item-type was retired (ADR-0003 / #48). Checklists are now a standalone
	// primitive surfaced via Itinerary › Lists — see lists-surface.spec.ts.

	test('responsive: bottom nav visible at mobile width', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto(`${BASE}/trips/${SLUG}`, { waitUntil: 'networkidle' });

		// At 375px only the mobile subtree is visible.
		const bottomNav = page.locator('nav:visible').last();
		await expect(bottomNav).toBeVisible();
	});

	test('responsive: side rail visible at desktop width', async ({ page }) => {
		await page.setViewportSize({ width: 1024, height: 768 });
		await page.goto(`${BASE}/trips/${SLUG}`, { waitUntil: 'networkidle' });

		// SideRail shows from md-desktop (900px). The old `.side-rail` selector matched
		// nothing, so its count guard skipped the assertion every run.
		await expect(
			page.getByRole('navigation', { name: 'Trip navigation' }).filter({ visible: true }).first()
		).toBeVisible();
	});
});
