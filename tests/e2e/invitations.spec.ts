import { test, expect } from '@playwright/test';
import { E2E_BASE, E2E_PB_BASE } from './e2e-env';

// #397 — invitations live on the trips list. Abby (#396) was invited to several
// trips and every email link opened in a browser context without her session,
// costing a fresh one-time code each time. Signed in once, she should see every
// invite on /trips (+ a count on the avatar), accept in place without a code,
// and decline (which deletes the invite — two taps, since it can't be undone).

const BASE = E2E_BASE;
const PB_BASE = E2E_PB_BASE;
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

	test('list → accept in place → placeholder trip goes via the invite page → decline', async ({
		page
	}) => {
		const stamp = Date.now().toString(36);
		const { token, record } = await pb('/api/dev/auth-bypass', { email: INVITER });
		const titles = [`E2E Invited A ${stamp}`, `E2E Invited B ${stamp}`, `E2E Invited C ${stamp}`];
		const slugs: string[] = [];
		const codes: string[] = [];
		for (const title of titles) {
			const slug = title.toLowerCase().replace(/\s+/g, '-');
			slugs.push(slug);
			const trip = await pb(
				'/api/collections/trips/records',
				{ title, slug, created_by: record.id, timezone: 'UTC' },
				token
			);
			// Trip C has an unclaimed name-only placeholder for the invitee.
			if (title === titles[2]) {
				await pb(
					'/api/members/add-placeholder',
					{ trip_id: trip.id, display_name: 'Coco', role: 'traveler' },
					token
				);
			}
			const inv = await pb(
				'/api/invites/create',
				{ trip_id: trip.id, email: INVITEE, role: 'traveler' },
				token
			);
			codes.push(inv.code);
		}

		await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(INVITEE)}`);
		await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
		await page.waitForLoadState('networkidle'); // hydrated: the decline guard is client-side

		const section = page.getByTestId('invitations');
		const cards = section.getByTestId('invitation');
		const card = (title: string) => cards.filter({ hasText: title });
		const badge = page.getByTestId('invitations-badge');
		// Badge and list come from the same load. (Other specs may add/remove
		// invites for this user concurrently, so never compare across loads.)
		const badgeMatchesList = async () => expect(badge).toHaveText(String(await cards.count()));

		await expect(card(titles[0])).toContainText(/invited you as a traveler/);
		await expect(card(titles[1])).toBeVisible();
		await expect(card(titles[2])).toBeVisible();
		await expect(section).not.toContainText('@');
		await badgeMatchesList();

		// A trip with an unclaimed placeholder goes through the invite page, so the
		// invitee can claim it instead of joining as a duplicate.
		await expect(card(titles[2]).getByRole('link', { name: 'Accept…' })).toHaveAttribute(
			'href',
			`/invite/${codes[2]}`
		);

		// …and the server enforces it: a hand-made in-place accept for that invite
		// is redirected to the invite page instead of creating a duplicate member.
		// (No Accept: text/html → SvelteKit answers with the action result as JSON.)
		const forged = await page.request.post(`${BASE}/trips?/acceptInvite`, {
			form: { code: codes[2] },
			headers: { origin: BASE }
		});
		expect(await forged.json()).toMatchObject({
			type: 'redirect',
			location: `/invite/${codes[2]}`
		});

		// Accept in place: straight into the trip, no code.
		await card(titles[0]).getByRole('button', { name: 'Accept' }).click();
		await page.waitForURL(`${BASE}/trips/${slugs[0]}`, { timeout: 15000 });

		await page.goto(`${BASE}/trips`, { waitUntil: 'networkidle' });
		await expect(card(titles[0])).toHaveCount(0);
		await expect(card(titles[1])).toBeVisible();
		await badgeMatchesList();

		// Decline needs a second tap, then the invite is gone.
		const decline = card(titles[1]).getByRole('button', { name: /decline/i });
		await decline.click();
		await expect(decline).toHaveText('Tap again to decline');
		await expect(card(titles[1])).toBeVisible();
		await decline.click();
		await expect(card(titles[1])).toHaveCount(0);
		await expect(card(titles[2])).toBeVisible();
		await badgeMatchesList();
	});
});
