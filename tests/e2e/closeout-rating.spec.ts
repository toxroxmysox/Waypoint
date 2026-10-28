import { test, expect, type Page } from '@playwright/test';
import { E2E_BASE } from './e2e-env';
import { EMAILS, token, pb, devLogin, seedOwnTrip } from './japan-fixture';

// #576 — closeout resolve / rate form actions. Seeds via the rules-fixture API
// (owner / traveler / viewer on a past-dated, wrap-up trip). Form actions are
// driven with page.request.post (the browser context carries the session cookie).
const BASE = E2E_BASE;

type Seed = { tripId: string; slug: string; items: string[]; dayId: string; phaseId: string };

async function seed(slug: string): Promise<Seed> {
	const { tripId, phaseId } = await seedOwnTrip(slug);
	const owner = await token(EMAILS.owner);
	const days = (
		await pb(
			owner,
			'GET',
			`/api/collections/days/records?perPage=50&sort=date&filter=${encodeURIComponent(`trip="${tripId}"`)}`
		)
	).items as { id: string }[];
	const items: string[] = [];
	for (let i = 0; i < 3; i++) {
		const it = await pb(owner, 'POST', '/api/collections/items/records', {
			trip: tripId,
			phase: phaseId,
			day: days[0].id,
			type: 'activity',
			title: `Closeout item ${i}`,
			status: 'planned',
			sort_order: 100 + i
		});
		items.push(it.id as string);
	}
	return { tripId, slug, items, dayId: days[0].id, phaseId };
}

async function getItem(id: string) {
	const owner = await token(EMAILS.owner);
	return (await pb(owner, 'GET', `/api/collections/items/records/${id}`)) as {
		status: string;
		rating: string;
		trip: string;
	};
}

// POST a SvelteKit form action; returns the parsed action result.
async function act(page: Page, slug: string, name: string, form: Record<string, string>) {
	const res = await page.request.post(`${BASE}/trips/${slug}/closeout?/${name}`, {
		form,
		headers: { 'x-sveltekit-action': 'true', origin: BASE }
	});
	const json = (await res.json()) as { type: string; status?: number; data?: string };
	return { http: res.status(), type: json.type, status: json.status };
}

test.describe('Closeout rating actions (#576)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');
	test.describe.configure({ mode: 'serial' });

	let s: Seed;
	let finishSeed: Seed;
	let closedSeed: Seed;

	test.beforeAll(async () => {
		s = await seed('e2e-closeout-rating-576');
		finishSeed = await seed('e2e-closeout-finish-576');
		closedSeed = await seed('e2e-closeout-closed-576');
		const owner = await token(EMAILS.owner);
		await pb(owner, 'PATCH', `/api/collections/trips/records/${closedSeed.tripId}`, {
			archived: true
		});
	});

	// UI buttons land in Task 5, which removes this fixme.
	test.fixme('traveler: Recommend marks done + recommend (UI)', async ({ browser }) => {
		const { page, close } = await devLogin(browser, EMAILS.traveler);
		await page.goto(`${BASE}/trips/${s.slug}/closeout`, { waitUntil: 'networkidle' });
		await page
			.getByRole('button', { name: 'Recommend', exact: true })
			.filter({ visible: true })
			.first()
			.click();
		await expect
			.poll(async () => (await getItem(s.items[0])).rating, { timeout: 5000 })
			.toBe('recommend');
		expect((await getItem(s.items[0])).status).toBe('done');
		await close();
	});

	test('traveler: ?/resolve recommend marks done + recommend', async ({ browser }) => {
		const { page, close } = await devLogin(browser, EMAILS.traveler);
		const r = await act(page, s.slug, 'resolve', { item_id: s.items[0], outcome: 'recommend' });
		expect(r.type).toBe('success');
		const item = await getItem(s.items[0]);
		expect(item.status).toBe('done');
		expect(item.rating).toBe('recommend');
		await close();
	});

	test('traveler: ?/resolve didnt_do -> considered, unrated; bad outcome 400', async ({
		browser
	}) => {
		const { page, close } = await devLogin(browser, EMAILS.traveler);
		const bad = await act(page, s.slug, 'resolve', { item_id: s.items[1], outcome: 'skip' });
		expect(bad.type).toBe('failure');
		expect(bad.status).toBe(400);
		const r = await act(page, s.slug, 'resolve', { item_id: s.items[1], outcome: 'didnt_do' });
		expect(r.type).toBe('success');
		const item = await getItem(s.items[1]);
		expect(item.status).toBe('considered');
		expect(item.rating).toBe('');
		await close();
	});

	test('traveler: ?/rate changes and clears a done item rating', async ({ browser }) => {
		const { page, close } = await devLogin(browser, EMAILS.traveler);
		expect(
			(await act(page, s.slug, 'rate', { item_id: s.items[0], rating: 'not_recommend' })).type
		).toBe('success');
		expect((await getItem(s.items[0])).rating).toBe('not_recommend');
		expect((await act(page, s.slug, 'rate', { item_id: s.items[0], rating: '' })).type).toBe(
			'success'
		);
		expect((await getItem(s.items[0])).rating).toBe('');
		await close();
	});

	test('?/rate refuses a non-done item and a bad rating', async ({ browser }) => {
		const { page, close } = await devLogin(browser, EMAILS.traveler);
		// items[1] is considered now
		const notDone = await act(page, s.slug, 'rate', { item_id: s.items[1], rating: 'recommend' });
		expect(notDone.type).toBe('failure');
		expect(notDone.status).toBe(400);
		const bad = await act(page, s.slug, 'rate', { item_id: s.items[0], rating: 'meh' });
		expect(bad.status).toBe(400);
		await close();
	});

	test('?/rate refuses an item from another trip', async ({ browser }) => {
		const owner = await devLogin(browser, EMAILS.owner);
		// done item on a different trip
		const o = await token(EMAILS.owner);
		await pb(o, 'PATCH', `/api/collections/items/records/${finishSeed.items[0]}`, {
			status: 'done'
		});
		const r = await act(owner.page, s.slug, 'rate', {
			item_id: finishSeed.items[0],
			rating: 'recommend'
		});
		expect(r.type).toBe('failure');
		expect((await getItem(finishSeed.items[0])).rating).toBe('');
		await owner.close();
	});

	test('viewer POST ?/rate and ?/resolve are refused', async ({ browser }) => {
		const { page, close } = await devLogin(browser, EMAILS.viewer);
		const rate = await act(page, s.slug, 'rate', { item_id: s.items[2], rating: 'recommend' });
		expect(rate.type).toBe('failure');
		expect(rate.status).toBe(403);
		const resolve = await act(page, s.slug, 'resolve', {
			item_id: s.items[2],
			outcome: 'recommend'
		});
		expect(resolve.type).toBe('failure');
		expect(resolve.status).toBe(403);
		const item = await getItem(s.items[2]);
		expect(item.status).toBe('planned');
		expect(item.rating).toBe('');
		await close();
	});

	test('traveler: Finish closes the trip', async ({ browser }) => {
		const { page, close } = await devLogin(browser, EMAILS.traveler);
		const r = await act(page, finishSeed.slug, 'finishCloseout', {});
		expect(r.type).toBe('redirect');
		const o = await token(EMAILS.owner);
		const trip = await pb(o, 'GET', `/api/collections/trips/records/${finishSeed.tripId}`);
		expect(trip.archived).toBe(true);
		await close();
	});

	test('finishCloseout on a closed trip is refused', async ({ browser }) => {
		const { page, close } = await devLogin(browser, EMAILS.owner);
		const r = await act(page, closedSeed.slug, 'finishCloseout', {});
		expect(r.type).toBe('failure');
		expect(r.status).toBe(400);
		await close();
	});
});
