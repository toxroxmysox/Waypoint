import { test, expect, type Browser, type Page } from '@playwright/test';
import { E2E_BASE, E2E_PB_BASE } from './e2e-env';

// #401 — day notes live in the day's Level Header: unlabeled text, a pencil
// "Edit notes" button for non-viewers, the "Add day notes" prompt when empty.
// Fixture: the rules-fixture (owner / traveler / viewer) under its own slug.

const BASE = E2E_BASE;
const PB_BASE = E2E_PB_BASE;
const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};
const SLUG = 'e2e-day-notes';

async function token(email: string): Promise<string> {
	const res = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	return ((await res.json()) as { token: string }).token;
}

async function devLogin(
	browser: Browser,
	email: string
): Promise<{ page: Page; close: () => Promise<void> }> {
	const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { page, close: () => ctx.close() };
}

test.describe.configure({ mode: 'serial' });

let dayId = '';

test.beforeAll(async () => {
	const t = await token(EMAILS.owner);
	const res = await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
		body: JSON.stringify({ emails: EMAILS, slug: SLUG })
	});
	expect(res.ok, `rules-fixture: ${res.status}`).toBe(true);
	dayId = ((await res.json()) as { dayId: string }).dayId;
	// Start empty: the fixture may seed notes.
	await fetch(`${PB_BASE}/api/collections/days/records/${dayId}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
		body: JSON.stringify({ notes: '' })
	});
});

test('day notes save from the header', async ({ browser }) => {
	const { page, close } = await devLogin(browser, EMAILS.traveler);
	await page.goto(`${BASE}/trips/${SLUG}/days/${dayId}`, { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Add day notes' }).filter({ visible: true }).click();
	const box = page.locator('textarea[name="notes"]').filter({ visible: true });
	await box.fill('Pick up rail passes at Shinagawa.');
	await page.getByRole('button', { name: 'Save', exact: true }).filter({ visible: true }).click();
	await expect(page.getByText('Notes saved')).toBeVisible();
	await page.reload({ waitUntil: 'networkidle' });
	await expect(
		page.getByText('Pick up rail passes at Shinagawa.').filter({ visible: true })
	).toBeVisible();
	// Filled notes carry no label, and the old Notes card heading is gone.
	await expect(
		page.getByRole('heading', { name: 'Notes', exact: true }).filter({ visible: true })
	).toHaveCount(0);
	await expect(
		page.getByRole('button', { name: 'Edit notes' }).filter({ visible: true })
	).toBeVisible();
	await close();
});

test('viewer sees notes but no edit', async ({ browser }) => {
	const { page, close } = await devLogin(browser, EMAILS.viewer);
	await page.goto(`${BASE}/trips/${SLUG}/days/${dayId}`, { waitUntil: 'networkidle' });
	await expect(
		page.getByText('Pick up rail passes at Shinagawa.').filter({ visible: true })
	).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Edit notes' }).filter({ visible: true })
	).toHaveCount(0);
	await close();
});
