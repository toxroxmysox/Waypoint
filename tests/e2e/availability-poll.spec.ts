import { test, expect, type Browser } from '@playwright/test';

// #271 / ADR-0023 — the availability wedge end to end:
//   1. Cold-open the PUBLIC poll link → paint → give a NAME (no OTP) → a name-only
//      Placeholder Member is created and the availability cells are saved.
//   2. A second respondent paints the same day → the day goes GREEN in the in-app
//      group view (everyone free).
//   3. Owner directly promotes a green window → the trip is dated (forming→dated).
//
// Runs against the isolated PB the e2e harness stands up (PUBLIC_PB_URL); the dev
// user (E2E_TEST_EMAIL) owns a fresh forming trip minted per-run via the PB dev
// routes. The poll surface is anonymous — no login needed for the paint half.

const BASE = 'http://localhost:4173';
const PB = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';
const EMAIL = process.env.E2E_TEST_EMAIL ?? '';

async function pbPost(path: string, body: unknown, token?: string) {
	const res = await fetch(`${PB}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
		body: JSON.stringify(body)
	});
	if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
	return res.json();
}
async function pbGet(path: string, token?: string) {
	const res = await fetch(`${PB}${path}`, {
		headers: token ? { Authorization: token } : {}
	});
	if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
	return res.json();
}

// A forward day (n days from today) as 'YYYY-MM-DD'.
function forwardDay(n: number): string {
	const d = new Date();
	d.setUTCHours(0, 0, 0, 0);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

// Seed a forming trip + a traveler join token; return { slug, tripId, token, ownerToken, ownerMemberId }.
async function seedPollTrip() {
	const auth = await pbPost('/api/dev/auth-bypass', { email: EMAIL });
	const ownerToken = auth.token as string;
	const ownerId = auth.record.id as string;
	const slug = `e2e-avail-${Date.now()}`;
	const trip = await pbPost(
		'/api/collections/trips/records',
		{ slug, title: 'E2E Availability Trip', timezone: 'UTC', created_by: ownerId },
		ownerToken
	);
	// The after-create hook seeds the owner membership — fetch it.
	await new Promise((r) => setTimeout(r, 300));
	const members = await pbGet(
		`/api/collections/trip_members/records?filter=${encodeURIComponent(`trip="${trip.id}"`)}`,
		ownerToken
	);
	const ownerMember = members.items.find((m: { user: string }) => m.user === ownerId);
	// Mint a traveler join token via the proper endpoint (join_tokens create is
	// superuser-only by rule; /api/join/create authorizes the owner + returns the
	// token). The poll share link reuses this same token (ADR-0023 Decision 7).
	const created = await pbPost(
		'/api/join/create',
		{ trip_id: trip.id, role: 'traveler' },
		ownerToken
	);
	const token = created.token as string;
	return { slug, tripId: trip.id, token, ownerToken, ownerMemberId: ownerMember.id };
}

test.describe('#271 availability poll', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test('cold-open poll → paint + name → placeholder + cells (no OTP); 2nd painter greens a day; promote dates the trip', async ({
		browser
	}) => {
		const { slug, tripId, token, ownerToken, ownerMemberId } = await seedPollTrip();
		const greenDay = forwardDay(9);

		// --- 1. COLD-OPEN the public poll (anonymous context — no login). ---------
		const anonCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
		const poll = await anonCtx.newPage();
		await poll.goto(`${BASE}/poll/${token}`);
		await expect(poll.getByText('E2E Availability Trip').first()).toBeVisible({ timeout: 10000 });

		// Paint the green day, then a couple neighbours (tap to mark Free).
		await poll.getByTestId(`poll-day-${greenDay}`).click();
		await expect(poll.getByTestId(`poll-day-${greenDay}`)).toHaveAttribute('data-mine', 'available');

		// Save → reveals the name step (Tier-1: no account needed).
		await poll.getByTestId('poll-save').click();
		await poll.locator('#poll-name').fill('Dana');
		await poll.getByTestId('poll-save').click();
		// Saved confirmation (no OTP anywhere in this flow).
		await expect(poll.getByText(/Saved\. Thanks/i)).toBeVisible({ timeout: 10000 });

		// A name-only Placeholder Member "Dana" now exists with a cell on the green day.
		const danaMembers = await pbGet(
			`/api/collections/trip_members/records?filter=${encodeURIComponent(`trip="${tripId}" && display_name="Dana"`)}`,
			ownerToken
		);
		expect(danaMembers.items.length).toBe(1);
		const danaId = danaMembers.items[0].id as string;
		expect(danaMembers.items[0].user).toBe(''); // unclaimed placeholder (no OTP)
		expect(danaMembers.items[0].role).toBe('traveler'); // capped to the link role
		const danaCells = await pbGet(
			`/api/collections/availability/records?filter=${encodeURIComponent(`member="${danaId}"`)}`,
			ownerToken
		);
		expect(danaCells.items.some((c: { day: string }) => c.day.slice(0, 10) === greenDay)).toBe(true);
		await anonCtx.close();

		// --- 2. The OWNER paints the SAME day → both members free → the day is GREEN.
		// Paint the owner's cell directly (the in-app My-mode does the same write).
		await pbPost(
			'/api/collections/availability/records',
			{ trip: tripId, member: ownerMemberId, day: `${greenDay} 00:00:00.000Z`, value: 'available' },
			ownerToken
		);

		// Owner logs in and opens the in-app poll → Group mode → the day is green.
		const ownerCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
		const app = await ownerCtx.newPage();
		await app.goto(`${BASE}/api/dev/login`);
		await app.waitForURL(/\/(trips|claim)/, { timeout: 15000 });
		await app.goto(`${BASE}/trips/${slug}/availability`);
		await app.getByTestId('mode-group').filter({ visible: true }).first().click();
		const greenCell = app.getByTestId(`day-${greenDay}`).filter({ visible: true }).first();
		await expect(greenCell).toHaveAttribute('data-status', 'green', { timeout: 10000 });

		// --- 3. DIRECT PROMOTION: pick the green window → set the dates. -----------
		await app.getByTestId('promote-toggle').filter({ visible: true }).first().click();
		// The window pre-fills to the green run; submit.
		await app.getByTestId('promote-form').filter({ visible: true }).first().locator('button[type="submit"]').click();
		// Redirects to the (now dated) trip home.
		await app.waitForURL(`${BASE}/trips/${slug}`, { timeout: 15000 });

		// The trip is now dated (forming→dated cascade): the planning tabs appear.
		await expect(app.getByRole('link', { name: 'Phases' }).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });

		// And PB confirms the dates are set.
		const dated = await pbGet(`/api/collections/trips/records/${tripId}`, ownerToken);
		expect(dated.start_date).toBeTruthy();
		expect(dated.end_date).toBeTruthy();

		await ownerCtx.close();
	});
});
