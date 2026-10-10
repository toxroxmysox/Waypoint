import { test, expect, type Browser, type Page } from '@playwright/test';
import { E2E_BASE, E2E_PB_BASE } from './e2e-env';

// #502 / ADR-0024 §2 — AI Access: one per-trip switch, owner/co_owner only,
// default on (existing, new, imported, cloned trips). Stored as `trips.ai_access`
// (true = connected AI may read the trip). The PB hook (trips.pb.js) is the gate;
// the settings checkbox is the only UI.

const BASE = E2E_BASE;
const PB_BASE = E2E_PB_BASE;

const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};
const SLUG = 'e2e-ai-access';

test.describe.configure({ mode: 'serial' });

async function token(email: string): Promise<string> {
	const res = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	return ((await res.json()) as { token: string }).token;
}

async function pb(t: string, method: string, path: string, body?: unknown) {
	const res = await fetch(`${PB_BASE}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function devLogin(browser: Browser, email: string): Promise<{ page: Page; close: () => Promise<void> }> {
	const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL(/\/(trips|claim)/, { timeout: 15000 });
	return { page, close: () => ctx.close() };
}

let tripId = '';
let ownerToken = '';

test.beforeAll(async () => {
	ownerToken = await token(EMAILS.owner);
	const res = await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
		body: JSON.stringify({ emails: EMAILS, slug: SLUG })
	});
	expect(res.ok, `rules-fixture: ${res.status}`).toBe(true);
	tripId = ((await res.json()) as { tripId: string }).tripId;
});

test('owner turns AI Access off and on', async ({ browser }) => {
	const { page, close } = await devLogin(browser, EMAILS.owner);
	await page.goto(`${BASE}/trips/${SLUG}/settings`, { waitUntil: 'networkidle' });

	const box = page.getByLabel('AI Access').filter({ visible: true });
	await expect(box).toBeChecked();
	await expect(
		page
			.getByText(
				"Lets members' connected AI assistants (like Claude) read this trip. Turning it off hides everything but the trip's name and dates."
			)
			.filter({ visible: true })
	).toBeVisible();

	const save = page.getByRole('button', { name: 'Save changes' }).filter({ visible: true });
	await box.uncheck();
	await save.click();
	await expect.poll(async () => (await pb(ownerToken, 'GET', `/api/collections/trips/records/${tripId}`)).json.ai_access).toBe(false);

	await page.reload({ waitUntil: 'networkidle' });
	await expect(page.getByLabel('AI Access').filter({ visible: true })).not.toBeChecked();
	await page.getByLabel('AI Access').filter({ visible: true }).check();
	await page.getByRole('button', { name: 'Save changes' }).filter({ visible: true }).click();
	await expect.poll(async () => (await pb(ownerToken, 'GET', `/api/collections/trips/records/${tripId}`)).json.ai_access).toBe(true);
	await close();
});

test('new trips default on', async ({ browser }) => {
	// A bare PB create that never mentions the field.
	const owner = await pb(ownerToken, 'POST', '/api/collections/users/auth-refresh');
	const ownerId = (owner.json.record as { id: string }).id;
	const bare = await pb(ownerToken, 'POST', '/api/collections/trips/records', {
		title: 'E2E AI default',
		slug: `e2e-ai-default-${Date.now().toString(36)}`,
		start_date: '2026-06-01 00:00:00.000Z',
		end_date: '2026-06-02 00:00:00.000Z',
		created_by: ownerId
	});
	expect(bare.status, JSON.stringify(bare.json)).toBe(200);
	expect(bare.json.ai_access).toBe(true);
	await pb(ownerToken, 'DELETE', `/api/collections/trips/records/${bare.json.id}`);

	// Through the app's /trips/new form.
	const { page, close } = await devLogin(browser, EMAILS.owner);
	await page.goto(`${BASE}/trips/new`, { waitUntil: 'networkidle' });
	const title = `E2E AI new ${Date.now().toString(36)}`;
	await page.getByLabel('Trip name').filter({ visible: true }).fill(title);
	await page.getByRole('button', { name: /create/i }).filter({ visible: true }).first().click();
	await page.waitForURL((u) => /^\/trips\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith('/new'), {
		timeout: 15000
	});
	const list = await pb(
		ownerToken,
		'GET',
		`/api/collections/trips/records?filter=${encodeURIComponent(`title = "${title}"`)}`
	);
	const created = (list.json.items as { id: string; ai_access: boolean }[])[0];
	expect(created.ai_access).toBe(true);
	await pb(ownerToken, 'DELETE', `/api/collections/trips/records/${created.id}`);
	await close();
});

test('traveler cannot change AI Access', async () => {
	const travelerToken = await token(EMAILS.traveler);
	const res = await pb(travelerToken, 'PATCH', `/api/collections/trips/records/${tripId}`, { ai_access: false });
	expect([400, 403]).toContain(res.status);
	const after = await pb(ownerToken, 'GET', `/api/collections/trips/records/${tripId}`);
	expect(after.json.ai_access).toBe(true);
});
