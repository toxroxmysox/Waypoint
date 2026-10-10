import { test, expect, type Browser, type Page } from '@playwright/test';
import { E2E_BASE, E2E_PB_BASE } from './e2e-env';

// #442 (CARD_SYSTEM D3/D12): votes on the item page. An idea gets "What do you
// think?" pills + who voted + "Add to a day" and no Going question; a planned item
// gets one quiet "Your vote: X · change" row. Visible-scoped (AppShell renders twice).
// Prefer `pnpm test:e2e:clean`.

const BASE = E2E_BASE;
const PB = E2E_PB_BASE;
const SLUG = 'e2e-item-votes-442';
const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

async function bypass(email: string): Promise<{ token: string }> {
	const res = await fetch(`${PB}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	if (!res.ok) throw new Error(`auth-bypass: ${res.status}`);
	return res.json();
}

async function pb(token: string, method: string, path: string, body?: unknown) {
	const res = await fetch(`${PB}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const data = (await res.json().catch(() => ({}))) as any;
	if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(data)}`);
	return data;
}

async function devLogin(browser: Browser, email: string, width = 375, height = 900) {
	const ctx = await browser.newContext({ viewport: { width, height } });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { ctx, page };
}

const vis = (page: Page, sel: string) => page.locator(sel).filter({ visible: true });

async function open(page: Page, itemId: string, title: string) {
	await page.goto(`${BASE}/trips/${SLUG}/items/${itemId}`);
	await expect(page.getByRole('heading', { name: title }).filter({ visible: true }).first()).toBeVisible({
		timeout: 10000
	});
	await page.waitForLoadState('networkidle');
}

test.describe('Votes on the item page (#442)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');
	test.describe.configure({ retries: 0 });

	let ideaId = '';
	let plannedId = '';

	test.beforeAll(async () => {
		const owner = await bypass(EMAILS.owner);
		const fx = await pb(owner.token, 'POST', '/api/dev/rules-fixture', { emails: EMAILS, slug: SLUG });
		const first = async (coll: string, sort = '') =>
			(
				await pb(
					owner.token,
					'GET',
					`/api/collections/${coll}/records?filter=${encodeURIComponent(`trip="${fx.tripId}"`)}&perPage=1${sort}`
				)
			).items[0];
		const day = await first('days', '&sort=date');
		const phase = await first('phases');
		const idea = await pb(owner.token, 'POST', '/api/collections/items/records', {
			trip: fx.tripId,
			day: '',
			...(phase ? { phase: phase.id } : {}),
			type: 'activity',
			title: 'Kayak trip',
			status: 'planned'
		});
		ideaId = idea.id;
		const planned = await pb(owner.token, 'POST', '/api/collections/items/records', {
			trip: fx.tripId,
			day: day.id,
			type: 'activity',
			title: 'Boat tour',
			start_time: `${day.date.split(' ')[0]} 10:00:00.000Z`,
			status: 'planned'
		});
		plannedId = planned.id;
	});

	test('idea: vote, see who voted, no Going question, Add to a day for a planner', async ({ browser }) => {
		const { ctx, page } = await devLogin(browser, EMAILS.owner);
		try {
			await open(page, ideaId, 'Kayak trip');
			const votes = vis(page, '[data-testid="item-votes"]').first();
			await expect(votes).toContainText('What do you think?');
			await votes.locator('[data-vote="love"]').click();
			await expect(vis(page, '[data-testid="item-voters"]').first()).toContainText('You');
			// Votes and Going never share a face.
			await expect(vis(page, '[data-testid="going-answer"]')).toHaveCount(0);
			await expect(vis(page, '[data-testid="item-your-vote"]')).toHaveCount(0);
			await vis(page, '[data-testid="add-to-day"]').first().getByRole('button', { name: 'Add to a day' }).click();
			await expect(page.locator('[data-sheet-panel]').filter({ visible: true }).first()).toContainText('Add to a day');
		} finally {
			await ctx.close();
		}
	});

	test('idea: a viewer sees the counts, no Add to a day', async ({ browser }) => {
		const { ctx, page } = await devLogin(browser, EMAILS.viewer);
		try {
			await open(page, ideaId, 'Kayak trip');
			await expect(vis(page, '[data-testid="item-votes"]').first()).toBeVisible();
			await expect(vis(page, '[data-testid="add-to-day"]')).toHaveCount(0);
		} finally {
			await ctx.close();
		}
	});

	test('planned: a quiet Your vote row; change opens the pills', async ({ browser }) => {
		const { ctx, page } = await devLogin(browser, EMAILS.traveler);
		try {
			await open(page, plannedId, 'Boat tour');
			await expect(vis(page, '[data-testid="item-votes"]')).toHaveCount(0);
			const row = vis(page, '[data-testid="item-your-vote"]').first();
			await expect(row).toContainText('Your vote');
			await expect(row).toContainText('None yet');
			await row.getByRole('button', { name: 'change' }).click();
			await row.locator('[data-vote="like"]').click();
			await expect(row).toContainText('Like');
			await page.reload();
			await page.waitForLoadState('networkidle');
			await expect(vis(page, '[data-testid="item-your-vote"]').first()).toContainText('Like');
			// Going stays on the planned face.
			await expect(vis(page, '[data-testid="going-answer"]').first()).toBeVisible();
		} finally {
			await ctx.close();
		}
	});
});
