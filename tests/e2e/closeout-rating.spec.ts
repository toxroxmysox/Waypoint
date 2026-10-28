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

// ---- UI: walk + rate mode -------------------------------------------------
const rows = (page: Page) => page.locator('[data-testid="closeout-row"]').filter({ visible: true });
const rowFor = (page: Page, title: string) => rows(page).filter({ hasText: title });
const pill = (row: ReturnType<typeof rowFor>, name: string) =>
	row.getByRole('button', { name, exact: true });

test.describe('Closeout rating UI (#576)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');
	test.describe.configure({ mode: 'serial' });

	let w: Seed; // walk: Recommend + Didn't do + Finish
	let sw: Seed; // walk: Didn't do + replacement
	let r: Seed; // rate mode (closed)

	test.beforeAll(async () => {
		w = await seed('e2e-closeout-ui-walk-576');
		sw = await seed('e2e-closeout-ui-swap-576');
		r = await seed('e2e-closeout-ui-rate-576');
		const owner = await token(EMAILS.owner);
		await pb(owner, 'PATCH', `/api/collections/items/records/${r.items[0]}`, {
			status: 'done',
			rating: 'recommend'
		});
		await pb(owner, 'PATCH', `/api/collections/items/records/${r.items[1]}`, {
			status: 'done'
		});
		await pb(owner, 'PATCH', `/api/collections/items/records/${r.items[2]}`, {
			status: 'considered'
		});
		await pb(owner, 'PATCH', `/api/collections/trips/records/${r.tripId}`, { archived: true });
	});

	test('traveler: Recommend marks done + recommend (UI)', async ({ browser }) => {
		const { page, close } = await devLogin(browser, EMAILS.traveler);
		await page.goto(`${BASE}/trips/${w.slug}/closeout`, { waitUntil: 'networkidle' });
		await pill(rowFor(page, 'Closeout item 0'), 'Recommend').click();
		await expect
			.poll(async () => (await getItem(w.items[0])).rating, { timeout: 5000 })
			.toBe('recommend');
		expect((await getItem(w.items[0])).status).toBe('done');
		// resolved row: no controls, shows the mark
		await expect(pill(rowFor(page, 'Closeout item 0'), 'Recommend')).toHaveCount(0);
		await expect(rowFor(page, 'Closeout item 0')).toContainText('👍');
		await close();
	});

	test("walk: Didn't do -> finish -> item stays considered, not done", async ({ browser }) => {
		const { page, close } = await devLogin(browser, EMAILS.owner);
		await page.goto(`${BASE}/trips/${w.slug}/closeout`, { waitUntil: 'networkidle' });
		await pill(rowFor(page, 'Closeout item 1'), "Didn't do").click();
		await expect(rowFor(page, 'Closeout item 1')).toContainText('Did something else instead?');
		await expect
			.poll(async () => (await getItem(w.items[1])).status, { timeout: 5000 })
			.toBe('considered');
		await pill(rowFor(page, 'Closeout item 1'), 'No').click();
		await expect(pill(rowFor(page, 'Closeout item 1'), 'No')).toHaveCount(0);
		await pill(rowFor(page, 'Closeout item 2'), "Don't recommend").click();
		await expect
			.poll(async () => (await getItem(w.items[2])).rating, { timeout: 5000 })
			.toBe('not_recommend');
		// advance to summary
		for (let i = 0; i < 30; i++) {
			if (
				await page
					.getByRole('button', { name: /Finish & close out trip/i })
					.filter({ visible: true })
					.count()
			)
				break;
			const next = page
				.getByRole('button', { name: /Next Day|Review Summary|Review ideas|Continue/ })
				.filter({ visible: true })
				.first();
			await next.click();
		}
		const summary = page.getByText('Not reviewed yet').filter({ visible: true }).first();
		await expect(summary).toBeVisible();
		await page
			.getByRole('button', { name: /Finish & close out trip/i })
			.filter({ visible: true })
			.click();
		await page.waitForURL(`${BASE}/trips/${w.slug}`, { timeout: 10000 });
		expect((await getItem(w.items[1])).status).toBe('considered');
		expect((await getItem(w.items[2])).status).toBe('done');
		await close();
	});

	test("walk: Didn't do -> + Add replacement -> replacement done, rated in rate mode", async ({
		browser
	}) => {
		const { page, close } = await devLogin(browser, EMAILS.owner);
		await page.goto(`${BASE}/trips/${sw.slug}/closeout`, { waitUntil: 'networkidle' });
		await pill(rowFor(page, 'Closeout item 0'), "Didn't do").click();
		await pill(rowFor(page, 'Closeout item 0'), '+ Add').click();
		await page
			.getByPlaceholder('What did you do instead?')
			.filter({ visible: true })
			.fill('Ramen detour');
		await page.getByRole('button', { name: 'Add replacement' }).filter({ visible: true }).click();
		await expect(rowFor(page, 'Ramen detour')).toBeVisible({ timeout: 5000 });
		expect((await getItem(sw.items[0])).status).toBe('considered');
		// close the trip via API, then rate the replacement in rate mode
		const owner = await token(EMAILS.owner);
		await pb(owner, 'PATCH', `/api/collections/trips/records/${sw.tripId}`, { archived: true });
		await page.goto(`${BASE}/trips/${sw.slug}/closeout`, { waitUntil: 'networkidle' });
		await pill(rowFor(page, 'Ramen detour'), 'Recommend').click();
		await expect(pill(rowFor(page, 'Ramen detour'), 'Recommend')).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await close();
	});

	test('rate mode: title, current pressed, switch persists after reload', async ({ browser }) => {
		const { page, close } = await devLogin(browser, EMAILS.traveler);
		await page.goto(`${BASE}/trips/${r.slug}/closeout`, { waitUntil: 'networkidle' });
		await expect(page.getByText('Rate activities').filter({ visible: true }).first()).toBeVisible();
		const row = rowFor(page, 'Closeout item 0');
		await expect(pill(row, 'Recommend')).toHaveAttribute('aria-pressed', 'true');
		await pill(row, "Don't recommend").click();
		await expect
			.poll(async () => (await getItem(r.items[0])).rating, { timeout: 5000 })
			.toBe('not_recommend');
		await page.reload({ waitUntil: 'networkidle' });
		await expect(pill(rowFor(page, 'Closeout item 0'), "Don't recommend")).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		// considered row: label, no controls
		await expect(rowFor(page, 'Closeout item 2')).toContainText("Didn't do");
		await expect(pill(rowFor(page, 'Closeout item 2'), 'Recommend')).toHaveCount(0);
		await close();
	});

	test('rate mode: tapping the pressed pill clears the rating', async ({ browser }) => {
		const { page, close } = await devLogin(browser, EMAILS.traveler);
		await page.goto(`${BASE}/trips/${r.slug}/closeout`, { waitUntil: 'networkidle' });
		await pill(rowFor(page, 'Closeout item 0'), "Don't recommend").click();
		await expect.poll(async () => (await getItem(r.items[0])).rating, { timeout: 5000 }).toBe('');
		await expect(pill(rowFor(page, 'Closeout item 0'), "Don't recommend")).toHaveAttribute(
			'aria-pressed',
			'false'
		);
		await close();
	});

	test('rate mode: no Finish, no All done; Done rating link goes back', async ({ browser }) => {
		const { page, close } = await devLogin(browser, EMAILS.owner);
		await page.goto(`${BASE}/trips/${r.slug}/closeout`, { waitUntil: 'networkidle' });
		await expect(
			page.getByRole('button', { name: 'All done' }).filter({ visible: true })
		).toHaveCount(0);
		// walk to the end
		for (let i = 0; i < 10; i++) {
			const next = page
				.getByRole('button', { name: /Next Day|Review Summary/ })
				.filter({ visible: true })
				.first();
			if (!(await next.count())) break;
			await next.click();
		}
		await expect(
			page.getByRole('button', { name: /Finish/i }).filter({ visible: true })
		).toHaveCount(0);
		await expect(
			page.getByRole('link', { name: 'Done rating' }).filter({ visible: true }).first()
		).toBeVisible();
		await close();
	});
});
