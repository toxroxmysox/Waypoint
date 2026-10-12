import { test, expect, type Browser, type Page } from '@playwright/test';
import { E2E_BASE, E2E_PB_BASE } from './e2e-env';

// #401 — Phase Detail answers "what are we doing here": span, In / Staying / Out,
// phase notes, Rate N, and a two-tap Do this → day with Undo.
// Fixture: the rules-fixture's members (owner / traveler / viewer), its trip
// re-dated over REST to the Japan shape: Tokyo Nov 18–22, Kanazawa Nov 22–24
// (Nov 22 is the shared Travel Day, with a train on it).

const BASE = E2E_BASE;
const PB_BASE = E2E_PB_BASE;
const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};
const SLUG = 'e2e-phase-detail';

type Fx = {
	tripId: string;
	tokyo: string;
	kanazawa: string;
	days: Record<string, string>; // 'YYYY-MM-DD' → id
	train: string;
	ownerIdea: string;
	travelerIdea: string;
};
let fx: Fx;

async function token(email: string): Promise<string> {
	const res = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	return ((await res.json()) as { token: string }).token;
}

async function pb(t: string, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
	const res = await fetch(`${PB_BASE}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	expect(res.ok, `${method} ${path}: ${res.status} ${JSON.stringify(json)}`).toBe(true);
	return json;
}

async function devLogin(browser: Browser, email: string): Promise<{ page: Page; close: () => Promise<void> }> {
	const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { page, close: () => ctx.close() };
}

const v = (page: Page) => ({
	doThis: page.getByRole('button', { name: 'Do this' }).filter({ visible: true })
});

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
	const owner = await token(EMAILS.owner);
	const res = await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner}` },
		body: JSON.stringify({ emails: EMAILS, slug: SLUG })
	});
	expect(res.ok, `rules-fixture: ${res.status}`).toBe(true);
	const base = (await res.json()) as {
		tripId: string;
		phaseId: string;
		memberIds: { owner: string; traveler: string };
	};
	const tripId = base.tripId;
	// The fixture's extra "Test Phase" overlaps the seeded one; drop it, then re-date
	// the trip so the hooks regenerate days and retile the remaining phase.
	await pb(owner, 'DELETE', `/api/collections/phases/records/${base.phaseId}`);
	await pb(owner, 'PATCH', `/api/collections/trips/records/${tripId}`, {
		start_date: '2027-11-18 00:00:00.000Z',
		end_date: '2027-11-24 00:00:00.000Z'
	});
	const remaining = (await pb(owner, 'GET', `/api/collections/phases/records?filter=${encodeURIComponent(`trip="${tripId}"`)}`))
		.items as { id: string }[];
	expect(remaining).toHaveLength(1);
	const tokyo = remaining[0].id;
	await pb(owner, 'PATCH', `/api/collections/phases/records/${tokyo}`, { name: 'Tokyo', notes: '' });
	const kan = await pb(owner, 'POST', '/api/collections/phases/records', {
		trip: tripId,
		name: 'Kanazawa',
		start_date: '2027-11-22 00:00:00.000Z',
		end_date: '2027-11-24 00:00:00.000Z',
		order: 1
	});
	const dayList = (await pb(owner, 'GET', `/api/collections/days/records?perPage=50&filter=${encodeURIComponent(`trip="${tripId}"`)}`))
		.items as { id: string; date: string }[];
	const days: Record<string, string> = {};
	for (const d of dayList) days[d.date.slice(0, 10)] = d.id;

	const train = await pb(owner, 'POST', '/api/collections/items/records', {
		trip: tripId,
		phase: tokyo,
		day: days['2027-11-22'],
		type: 'transportation',
		title: 'Shinkansen to Kanazawa',
		status: 'planned',
		start_time: '2027-11-22 10:00:00.000Z',
		sort_order: 100,
		created_by: base.memberIds.owner
	});
	const ownerIdea = await pb(owner, 'POST', '/api/collections/items/records', {
		trip: tripId,
		phase: tokyo,
		day: '',
		type: 'activity',
		title: 'TeamLab Planets',
		status: 'unplanned',
		sort_order: 100,
		created_by: base.memberIds.owner
	});
	// Travelers suggest; an approved suggestion is an item the traveler created.
	// Seed that end state directly as the owner, attributed to the traveler.
	const travelerIdea = await pb(owner, 'POST', '/api/collections/items/records', {
		trip: tripId,
		phase: tokyo,
		day: '',
		type: 'meal',
		title: 'Tsukiji breakfast',
		status: 'unplanned',
		sort_order: 200,
		created_by: base.memberIds.traveler
	});
	fx = {
		tripId,
		tokyo,
		kanazawa: kan.id as string,
		days,
		train: train.id as string,
		ownerIdea: ownerIdea.id as string,
		travelerIdea: travelerIdea.id as string
	};
});

test('header span, Out and In share the Travel Day train, empty Staying offers Add', async ({ browser }) => {
	const { page, close } = await devLogin(browser, EMAILS.owner);
	await page.goto(`${BASE}/trips/${SLUG}/phases/${fx.tokyo}`, { waitUntil: 'networkidle' });
	await expect(page.getByText('5 days · 4 nights').filter({ visible: true }).first()).toBeVisible();

	const out = page.locator('[data-logistics="out"]').filter({ visible: true });
	await expect(out.getByRole('link', { name: /Shinkansen to Kanazawa/ })).toHaveAttribute(
		'href',
		new RegExp(`/items/${fx.train}`)
	);

	const add = page.locator('[data-logistics="staying"]').filter({ visible: true }).getByRole('link', { name: 'Add' });
	const href = (await add.getAttribute('href')) ?? '';
	expect(href).toContain('type=lodging');
	expect(href).toContain(`day=${fx.days['2027-11-18']}`);
	expect(href).toContain('end=2027-11-22');

	await page.goto(`${BASE}/trips/${SLUG}/phases/${fx.kanazawa}`, { waitUntil: 'networkidle' });
	const inRow = page.locator('[data-logistics="in"]').filter({ visible: true });
	await expect(inRow.getByRole('link', { name: /Shinkansen to Kanazawa/ })).toBeVisible();
	await close();
});

test('owner: Do this → Fri 19 plans it, Undo puts it back', async ({ browser }) => {
	const { page, close } = await devLogin(browser, EMAILS.owner);
	await page.goto(`${BASE}/trips/${SLUG}/phases/${fx.tokyo}`, { waitUntil: 'networkidle' });
	const idea = page.locator(`[data-idea-id="${fx.ownerIdea}"]`).filter({ visible: true });
	await idea.getByRole('button', { name: 'Do this' }).click();
	await expect(page.getByText('On which day?').filter({ visible: true })).toBeVisible();
	await page.getByRole('button', { name: /^Fri 19/ }).filter({ visible: true }).click();

	await expect(page.getByText('Planned on Fri 19')).toBeVisible();
	await expect(page.locator(`[data-idea-id="${fx.ownerIdea}"]`).filter({ visible: true })).toHaveCount(0);
	// The Fri 19 DayCard (not its header chip, which links to the same day).
	const fri = page
		.locator(`a[href$="/days/${fx.days['2027-11-19']}"]`)
		.filter({ visible: true, hasText: / item/ });
	await expect(fri).toContainText('1 item');

	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.locator(`[data-idea-id="${fx.ownerIdea}"]`).filter({ visible: true })).toHaveCount(1);
	await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
	await close();
});

test('traveler sees Do this on own idea only; viewer sees none', async ({ browser }) => {
	const t = await devLogin(browser, EMAILS.traveler);
	await t.page.goto(`${BASE}/trips/${SLUG}/phases/${fx.tokyo}`, { waitUntil: 'networkidle' });
	await expect(t.page.locator(`[data-idea-id="${fx.travelerIdea}"]`).filter({ visible: true }).getByRole('button', { name: 'Do this' })).toBeVisible();
	await expect(t.page.locator(`[data-idea-id="${fx.ownerIdea}"]`).filter({ visible: true }).getByRole('button', { name: 'Do this' })).toHaveCount(0);
	await t.close();

	const vw = await devLogin(browser, EMAILS.viewer);
	await vw.page.goto(`${BASE}/trips/${SLUG}/phases/${fx.tokyo}`, { waitUntil: 'networkidle' });
	await expect(vw.page.locator(`[data-idea-id="${fx.travelerIdea}"]`).filter({ visible: true })).toHaveCount(1);
	await expect(v(vw.page).doThis).toHaveCount(0);
	await vw.close();
});

test('Rate N opens this phase’s deck with a way back', async ({ browser }) => {
	const { page, close } = await devLogin(browser, EMAILS.owner);
	await page.goto(`${BASE}/trips/${SLUG}/phases/${fx.tokyo}`, { waitUntil: 'networkidle' });
	const rate = page.getByRole('link', { name: /^Rate \d+$/ }).filter({ visible: true });
	const href = (await rate.getAttribute('href')) ?? '';
	expect(href).toContain(`/trips/${SLUG}/swipe/${fx.tokyo}`);
	expect(decodeURIComponent(href)).toContain(`from=/trips/${SLUG}/phases/${fx.tokyo}`);
	await close();
});

test('phase notes persist across reload', async ({ browser }) => {
	const { page, close } = await devLogin(browser, EMAILS.traveler);
	await page.goto(`${BASE}/trips/${SLUG}/phases/${fx.tokyo}`, { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Add phase notes' }).filter({ visible: true }).click();
	await page.locator('textarea[name="notes"]').filter({ visible: true }).fill('Rail pass starts here.');
	await page.getByRole('button', { name: 'Save', exact: true }).filter({ visible: true }).click();
	await expect(page.getByText('Notes saved')).toBeVisible();
	await page.reload({ waitUntil: 'networkidle' });
	await expect(page.getByText('Rail pass starts here.').filter({ visible: true })).toBeVisible();
	await close();
});

test('swipe deck closes back to the Phase Detail it was opened from', async ({ browser }) => {
	const { page, close } = await devLogin(browser, EMAILS.owner);
	await page.goto(`${BASE}/trips/${SLUG}/phases/${fx.tokyo}`, { waitUntil: 'networkidle' });
	await page.getByRole('link', { name: /^Rate \d+$/ }).filter({ visible: true }).click();
	await page.waitForURL(new RegExp(`/swipe/${fx.tokyo}`));
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Close', exact: true }).filter({ visible: true }).first().click();
	await page.waitForURL(`${BASE}/trips/${SLUG}/phases/${fx.tokyo}`);
	await close();
});

// #391 — Phase Overview (Phases tab): one card per phase. The card opens Phase
// Detail; its day chips open days; its swipe row opens that phase's deck.
test('Phase Overview cards open Phase Detail, days and the deck', async ({ browser }) => {
	const { page, close } = await devLogin(browser, EMAILS.owner);
	const phases = `${BASE}/trips/${SLUG}/phases`;
	await page.goto(phases, { waitUntil: 'networkidle' });

	const tokyoCard = page.locator(`[data-phase-card="${fx.tokyo}"]`).filter({ visible: true });
	await expect(tokyoCard.getByRole('link', { name: /Tokyo/ }).first()).toHaveAttribute('href', `/trips/${SLUG}/phases/${fx.tokyo}`);
	await expect(tokyoCard.getByRole('link', { name: /^Thu 18/ })).toHaveAttribute('href', `/trips/${SLUG}/days/${fx.days['2027-11-18']}`);

	// Tokyo: ideas the owner hasn't rated → a swipe link carrying from=. (The
	// rules-fixture's own items re-home into Tokyo too, so counts aren't fixed.)
	const swipe = tokyoCard.getByRole('link', { name: /\d+ ideas? · \d+ to rate/ });
	const href = (await swipe.getAttribute('href')) ?? '';
	expect(href).toContain(`/trips/${SLUG}/swipe/${fx.tokyo}`);
	expect(decodeURIComponent(href)).toContain(`from=/trips/${SLUG}/phases`);

	// Kanazawa has no ideas → no swipe row.
	const kanCard = page.locator(`[data-phase-card="${fx.kanazawa}"]`).filter({ visible: true });
	await expect(kanCard.getByText(/ideas ·/)).toHaveCount(0);

	// The trip-wide swipe banner is gone; the editor sits under Edit phases with no Open link.
	await expect(page.getByText(/Swipe through/)).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Edit phases' }).filter({ visible: true })).toBeVisible();
	await expect(page.getByRole('link', { name: /^Open (Tokyo|Kanazawa)$/ })).toHaveCount(0);

	await tokyoCard.getByRole('link', { name: /Tokyo/ }).first().click();
	await page.waitForURL(`${BASE}/trips/${SLUG}/phases/${fx.tokyo}`);
	await close();
});

test('a phase whose ideas are all rated reads "all rated", not a link', async ({ browser }) => {
	const owner = await token(EMAILS.owner);
	const me = (await pb(owner, 'GET', `/api/collections/trip_members/records?filter=${encodeURIComponent(`trip="${fx.tripId}" && role="owner"`)}`))
		.items as { id: string }[];
	const items = (await pb(owner, 'GET', `/api/collections/items/records?perPage=50&filter=${encodeURIComponent(`phase="${fx.tokyo}" && (status="planned" || status="unplanned")`)}`))
		.items as { id: string }[];
	for (const it of items) {
		await fetch(`${PB_BASE}/api/collections/votes/records`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner}` },
			body: JSON.stringify({ trip: fx.tripId, item: it.id, member: me[0].id, value: 'like' })
		});
	}
	const { page, close } = await devLogin(browser, EMAILS.owner);
	await page.goto(`${BASE}/trips/${SLUG}/phases`, { waitUntil: 'networkidle' });
	const tokyoCard = page.locator(`[data-phase-card="${fx.tokyo}"]`).filter({ visible: true });
	await expect(tokyoCard.getByText(/\d+ ideas? · all rated/)).toBeVisible();
	await expect(tokyoCard.getByRole('link', { name: /ideas ·/ })).toHaveCount(0);
	await close();
});
