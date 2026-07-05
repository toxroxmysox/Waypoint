import { test, expect } from '@playwright/test';

// Issue #48 — inline Checklist + Task primitive on the Item detail view.
// Builds its own trip → day → item via the UI (like m1-happy-path), then covers
// the grocery case: attach a manual checklist, add a task, check it off.
// playwright.config.ts boots the SvelteKit preview on :4173; PocketBase (with the
// 0030 migration) runs separately.
const BASE = 'http://localhost:4173';

test.describe('Inline item checklist (#48 primitive · #55 ledger)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeEach(async ({ page }) => {
		const email = encodeURIComponent(process.env.E2E_TEST_EMAIL!);
		await page.goto(`${BASE}/api/dev/login?email=${email}`);
		await page.waitForURL(`${BASE}/trips`, { timeout: 10000 });
	});

	test('attach a checklist, add a task, check it off', async ({ page }) => {
		const stamp = Date.now().toString(36);
		const tripTitle = `E2E Checklist ${stamp}`;
		const tripSlug = `e2e-checklist-${stamp}`;

		// --- Create a trip ---
		await page.getByRole('link', { name: 'New Trip' }).click();
		await page.waitForURL(`${BASE}/trips/new`);
		await page.fill('input[name="title"]', tripTitle);
		const today = new Date().toISOString().split('T')[0];
		const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		// #270: dates live behind the optional "I know the dates" expander on /trips/new.
		await page.locator('summary', { hasText: 'I know the dates' }).click();
		await page.fill('input[name="start_date"]', today);
		await page.fill('input[name="end_date"]', nextWeek);
		await page.fill('input[name="location_summary"]', 'Test Location');
		await page.getByRole('button', { name: /create|save/i }).click();
		await page.waitForURL(`${BASE}/trips/${tripSlug}`, { timeout: 10000 });

		// --- Open the first day and add an item ---
		const dayLinks = page.locator(`a[href^="/trips/${tripSlug}/days/"]:visible`);
		await expect(dayLinks.first()).toBeVisible({ timeout: 5000 });
		const dayHref = await dayLinks.first().getAttribute('href');
		await dayLinks.first().click();

		await page.getByRole('link', { name: /^Add item$/i }).filter({ visible: true }).first().click();
		await page.waitForURL(/\/items\/new/);
		await page.locator('input[name="title"]:visible').first().fill('Grocery run');
		await page.getByRole('button', { name: /create|save/i }).filter({ visible: true }).first().click();
		await page.waitForURL(new RegExp(dayHref!.replace(/\//g, '\\/')), { timeout: 10000 });

		// --- Open the item detail ---
		// #231: card is a stretched-link <a aria-label="<title>">; click the link, not the
		// obscured text (getByText click is intercepted by the absolute-inset anchor).
		await page.getByRole('link', { name: 'Grocery run' }).filter({ visible: true }).first().click();
		await page.waitForURL(/\/items\/[a-z0-9]+$/);

		// The trip layout is a dual tree (mobile + desktop, one CSS-hidden), so scope
		// every control to the visible subtree to avoid strict-mode violations.
		// No checklist yet → the attach affordance is offered.
		const addChecklist = page.getByRole('button', { name: 'Add checklist' }).filter({ visible: true }).first();
		await expect(addChecklist).toBeVisible();
		await addChecklist.click();

		// Add a grocery task via the ledger "Add an item" footer (Enter submits the row).
		const taskInput = page.getByPlaceholder('Add an item').filter({ visible: true }).first();
		await expect(taskInput).toBeVisible();
		await taskInput.fill('Apples');
		await taskInput.press('Enter');
		await expect(page.getByText('Apples').filter({ visible: true }).first()).toBeVisible();

		// Check it off → the ledger checkbox flips to "Uncheck task".
		await page.getByRole('button', { name: 'Check task' }).filter({ visible: true }).first().click();
		await expect(page.getByRole('button', { name: 'Uncheck task' }).filter({ visible: true }).first()).toBeVisible();

		// Assign via the ⋯ overflow → member sheet → Done.
		await page.getByRole('button', { name: 'Assign or remove task' }).filter({ visible: true }).first().click();
		await expect(page.getByRole('heading', { name: 'Assign a member' })).toBeVisible();
		await page.getByRole('radio').filter({ visible: true }).first().click();
		await page.getByRole('button', { name: 'Done' }).filter({ visible: true }).first().click();
		await expect(page.getByRole('heading', { name: 'Assign a member' })).toBeHidden();
	});
});
