import { test, expect } from '@playwright/test';
import { E2E_BASE } from './e2e-env';

// #397 — invitations live on the trips list. Abby (#396) was invited to several
// trips and every email link opened in a browser context without her session,
// costing a fresh one-time code each time. Signed in once, she should see every
// invite on /trips (+ a count on the avatar), accept in place without a code,
// and decline (which deletes the invite — two taps, since it can't be undone).

const BASE = E2E_BASE;
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';
// The e2e user invites rules-coowner. Accepting makes them co-travelers, so the
// pair must be one no other spec inspects the co-traveler pool of — NOT
// rules-owner, whose #352 picker pool invite-co-traveler.spec.ts pins exactly.
const INVITER = process.env.E2E_TEST_EMAIL!;
const INVITEE = 'rules-coowner@e2e.test';

async function pb(path: string, body: unknown, token?: string) {
	const res = await fetch(PB_BASE + path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
		body: JSON.stringify(body)
	});
	const data = await res.json();
	expect(res.ok, `${path}: ${JSON.stringify(data)}`).toBe(true);
	return data;
}

test.describe('Invitations on the trips list (#397)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test('list → accept in place → decline', async ({ page }) => {
		const stamp = Date.now().toString(36);
		const { token, record } = await pb('/api/dev/auth-bypass', { email: INVITER });
		const titles = [`E2E Invited A ${stamp}`, `E2E Invited B ${stamp}`];
		const slugs: string[] = [];
		for (const title of titles) {
			const slug = title.toLowerCase().replace(/\s+/g, '-');
			slugs.push(slug);
			const trip = await pb(
				'/api/collections/trips/records',
				{ title, slug, created_by: record.id, timezone: 'UTC' },
				token
			);
			await pb(
				'/api/invites/create',
				{ trip_id: trip.id, email: INVITEE, role: 'traveler' },
				token
			);
		}

		await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(INVITEE)}`);
		await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });

		const section = page.getByTestId('invitations');
		const card = (title: string) => section.getByTestId('invitation').filter({ hasText: title });
		await expect(card(titles[0])).toContainText(/invited you as a traveler/);
		await expect(card(titles[1])).toBeVisible();
		await expect(card(titles[0])).not.toContainText('@');
		const badge = page.getByTestId('invitations-badge');
		const count = Number(await badge.innerText());
		expect(count).toBeGreaterThanOrEqual(2);

		// Accept in place: straight into the trip, no code.
		await card(titles[0]).getByRole('button', { name: 'Accept' }).click();
		await page.waitForURL(`${BASE}/trips/${slugs[0]}`, { timeout: 15000 });

		// The other invite is still waiting.
		await page.goto(`${BASE}/trips`);
		await expect(card(titles[0])).toHaveCount(0);
		await expect(card(titles[1])).toBeVisible();
		await expect(badge).toHaveText(String(count - 1));

		// Decline needs a second tap, then the invite is gone.
		const decline = card(titles[1]).getByRole('button', { name: /decline/i });
		await decline.click();
		await expect(decline).toHaveText('Tap again to decline');
		await expect(card(titles[1])).toBeVisible();
		await decline.click();
		await expect(card(titles[1])).toHaveCount(0);
		if (count - 2 === 0) await expect(badge).toHaveCount(0);
		else await expect(badge).toHaveText(String(count - 2));
	});
});
