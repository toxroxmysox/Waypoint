import { test, expect } from '@playwright/test';
import { E2E_BASE } from './e2e-env';

// #390 — the bell lists notifications newest first. It is fed by the trip
// layout loader, which sorted by `-id`; PB ids are random, so the order was
// effectively random. 0069 added `created`; the loader now sorts `-created`.
// Six notifications so a random order can't pass by luck (1/720).

const BASE = E2E_BASE;
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';
const SLUG = 'e2e-rules-test-bell';
const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};
const BODIES = Array.from({ length: 6 }, (_, i) => `bell-order-${i}`);

async function json(path: string, body: unknown, token?: string) {
	const res = await fetch(PB_BASE + path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
		body: JSON.stringify(body)
	});
	return { ok: res.ok, data: await res.json() };
}

test.describe('Notification bell order (#390)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test('newest first', async ({ page }) => {
		// Notifications are hook-written only, so seed them as the isolated PB's
		// superuser (scripts/e2e-clean-pb.sh). Not available on a dev PB → skip.
		const admin = await json('/api/collections/_superusers/auth-with-password', {
			identity: 'admin@e2e.test',
			password: 'e2eAdminPass123'
		});
		test.skip(!admin.ok, 'needs the isolated PB superuser (pnpm test:e2e:clean)');

		const fx = await json('/api/dev/rules-fixture', { emails: EMAILS, slug: SLUG });
		expect(fx.ok).toBe(true);
		for (const body of BODIES) {
			const r = await json(
				'/api/collections/notifications/records',
				{ trip: fx.data.tripId, recipient: fx.data.memberIds.owner, type: 'member_joined', body, link: '' },
				admin.data.token
			);
			expect(r.ok).toBe(true);
			await new Promise((res) => setTimeout(res, 25));
		}

		await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(EMAILS.owner)}`);
		await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
		await page.goto(`${BASE}/trips/${SLUG}`);
		await page.locator('button[aria-label*="otification"]:visible').first().click();
		const shown = page.getByText(/^bell-order-\d$/).filter({ visible: true });
		await expect(shown).toHaveCount(BODIES.length);
		expect(await shown.allInnerTexts()).toEqual([...BODIES].reverse());
	});
});
