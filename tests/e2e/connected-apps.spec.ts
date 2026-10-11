import { test, expect } from '@playwright/test';
import { BASE, connect, rpc } from './mcp-helpers';
import { E2E_PB_BASE } from './e2e-env';

// #502 / ADR-0024 — a member's Connections are listed in account settings with
// Disconnect, which revokes the connection's tokens immediately.

// Its own user: mcp-tools connects rules-owner in a parallel worker, and Disconnect would kill those tokens.
const OWNER = 'rules-coowner@e2e.test';
const OTHER = 'rules-traveler@e2e.test';

test.describe.configure({ mode: 'serial' });

async function pbToken(email: string): Promise<string> {
	const res = await fetch(`${E2E_PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	return ((await res.json()) as { token: string }).token;
}

test.beforeAll(async () => {
	// /account needs the user to be in at least one trip (#508: users.viewRule
	// excludes a trip-less user's own record).
	const t = await pbToken(OWNER);
	const me = await fetch(`${E2E_PB_BASE}/api/collections/users/auth-refresh`, { method: 'POST', headers: { Authorization: t } }).then(
		(r) => r.json()
	);
	const res = await fetch(`${E2E_PB_BASE}/api/collections/trips/records`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: t },
		body: JSON.stringify({ title: 'E2E connected apps', slug: `e2e-connected-apps-${Date.now().toString(36)}`, created_by: me.record.id })
	});
	expect(res.ok, `trip create ${res.status}`).toBe(true);
});

test('Disconnect removes the connection and kills its token', async ({ browser }) => {
	const { access } = await connect(OWNER);
	expect((await rpc(access, 'tools/list')).status).toBe(200);

	const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(OWNER)}`);
	await page.waitForURL(/\/(trips|claim)/);
	await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });

	const section = page.locator('section', { has: page.getByRole('heading', { name: 'Connected apps' }) }).filter({ visible: true });
	await expect(section).toBeVisible();
	const row = section.locator('li', { hasText: 'E2E Test Client' }).first();
	await expect(row).toContainText('Last used');
	const before = await section.locator('li', { hasText: 'E2E Test Client' }).count();

	await row.getByRole('button', { name: 'Disconnect' }).click();
	await expect(section.locator('li', { hasText: 'E2E Test Client' })).toHaveCount(before - 1);
	await expect.poll(async () => (await rpc(access, 'tools/list')).status).toBe(401);
	await ctx.close();
});

test("another user can't see or delete my connection", async () => {
	await connect(OWNER);
	const mine = await fetch(`${E2E_PB_BASE}/api/collections/mcp_connections/records`, {
		headers: { Authorization: await pbToken(OWNER) }
	}).then((r) => r.json());
	const id = mine.items[0].id;

	const other = await pbToken(OTHER);
	const view = await fetch(`${E2E_PB_BASE}/api/collections/mcp_connections/records/${id}`, { headers: { Authorization: other } });
	expect(view.status).toBe(404);
	const del = await fetch(`${E2E_PB_BASE}/api/collections/mcp_connections/records/${id}`, {
		method: 'DELETE',
		headers: { Authorization: other }
	});
	expect(del.status).toBe(404);
});
