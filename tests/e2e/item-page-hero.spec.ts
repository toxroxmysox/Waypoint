import { test, expect, type Browser, type Page } from '@playwright/test';
import { E2E_BASE, E2E_PB_BASE } from './e2e-env';

// #438 (CARD_SYSTEM D12): the item page's Hero header and body in Planning Mode.
// A rich item (codes, a document, description, estimate + paid, booking link,
// cancellation, a goal, comments) and a sparse one (empty Documents + Checklist).
// AppShell renders each page twice, so every locator is visible-scoped.
// Prefer `pnpm test:e2e:clean`.

const BASE = E2E_BASE;
const PB = E2E_PB_BASE;
const SLUG = 'e2e-item-page-hero-438';
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

async function openItem(page: Page, id: string, title: string) {
	await page.goto(`${BASE}/trips/${SLUG}/items/${id}`);
	await expect(page.getByRole('heading', { name: title }).filter({ visible: true }).first()).toBeVisible({
		timeout: 10000
	});
	await page.waitForLoadState('networkidle');
}

test.describe('Item page Hero + body (#438)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');
	test.describe.configure({ retries: 0 });

	const RICH = 'Dinner at Immigrant';
	const SPARSE = 'Walk the lakefront';
	let richId = '';
	let sparseId = '';

	test.beforeAll(async () => {
		const owner = await bypass(EMAILS.owner);
		const fx = await pb(owner.token, 'POST', '/api/dev/rules-fixture', { emails: EMAILS, slug: SLUG });
		const day = (
			await pb(
				owner.token,
				'GET',
				`/api/collections/days/records?filter=${encodeURIComponent(`trip="${fx.tripId}"`)}&perPage=1&sort=date`
			)
		).items[0];
		const rich = await pb(owner.token, 'POST', '/api/collections/items/records', {
			trip: fx.tripId,
			day: day.id,
			type: 'meal',
			subtype: 'dinner',
			title: RICH,
			description: 'Tasting menu, ask for the corner table.',
			start_time: `${day.date.split(' ')[0]} 18:30:00.000Z`,
			location_name: 'Immigrant Food',
			location_address: '1 Main St, Milwaukee',
			reservation_url: 'https://www.opentable.com/r/immigrant',
			free_cancellation: true,
			cost_estimate_usd: 240,
			requires_booking: true,
			booked: true,
			status: 'planned',
			assigned_to: [fx.memberIds.owner]
		});
		richId = rich.id;
		await pb(owner.token, 'POST', '/api/collections/documents/records', {
			trip: fx.tripId,
			item: richId,
			kind: 'code',
			code_label: 'Confirmation',
			code_value: 'XQ7-4421'
		});
		// A file document: multipart (PB mimeTypes accept pdf/png).
		const fd = new FormData();
		fd.set('trip', fx.tripId);
		fd.set('item', richId);
		fd.set('caption', 'Menu PDF');
		fd.set('file', new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' }), 'menu.pdf');
		const up = await fetch(`${PB}/api/collections/documents/records`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${owner.token}` },
			body: fd
		});
		if (!up.ok) throw new Error(`document upload: ${up.status} ${await up.text()}`);
		// The fixture seeds one goal ("Test Goal"); link it to the rich item.
		await pb(owner.token, 'PATCH', `/api/collections/trip_goals/records/${fx.goalId}`, { items: [richId] });
		for (const text of ['First comment', 'Second comment']) {
			await pb(owner.token, 'POST', '/api/comments/add', { item_id: richId, comment_text: text });
			await new Promise((r) => setTimeout(r, 1100)); // distinct `created` seconds
		}
		const sparse = await pb(owner.token, 'POST', '/api/collections/items/records', {
			trip: fx.tripId,
			day: day.id,
			type: 'activity',
			title: SPARSE,
			status: 'planned'
		});
		sparseId = sparse.id;
	});

	test('rich item: the Hero is the header and the body follows D12', async ({ browser }) => {
		const { ctx, page } = await devLogin(browser, EMAILS.owner);
		try {
			await openItem(page, richId, RICH);
			const hero = vis(page, '[data-hero]').first();
			await expect(hero).toBeVisible();
			await expect(hero).toHaveAttribute('data-live', 'false'); // Planning Mode: no accent
			await expect(hero).toContainText('Meal · Dinner'); // type in words
			await expect(hero.getByTestId('hero-time')).toHaveText(/^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} · 6:30p$/);
			// The place line is the Maps link.
			const place = hero.getByTestId('hero-place');
			await expect(place).toHaveAttribute('href', /google\.com\/maps/);
			await expect(place).toContainText('Immigrant Food');
			// Code row, document row, booked status, Going.
			await expect(hero.getByTestId('code-row')).toContainText('XQ7-4421');
			await expect(hero.getByTestId('hero-doc')).toContainText('Menu PDF');
			await expect(hero.getByTestId('hero-booked')).toBeVisible();
			await expect(hero.getByTestId('hero-going')).toContainText('Going');

			// Body: description, one Details card (estimate, payment, booking, cancellation).
			await expect(vis(page, '[data-testid="item-description"]').first()).toContainText('corner table');
			const details = vis(page, '[data-testid="item-details"]').first();
			await expect(details.locator('[data-detail="cost"]')).toContainText('$240.00');
			await expect(details.locator('[data-detail="payment"]')).toContainText('Log payment');
			await expect(details.locator('[data-detail="booking"]')).toContainText('opentable.com');
			await expect(details.locator('[data-detail="cancellation"]')).toContainText('Free cancellation');
			// Goals, a Documents section (has one), and no add line for Documents.
			await expect(page.getByText('Test Goal').filter({ visible: true }).first()).toBeVisible();
			await expect(page.getByRole('heading', { name: 'Documents' }).filter({ visible: true }).first()).toBeVisible();
			await expect(page.getByRole('button', { name: '+ Document', exact: true }).filter({ visible: true })).toHaveCount(0);
			await expect(page.getByRole('button', { name: '+ Checklist', exact: true }).filter({ visible: true })).toHaveCount(1);
		} finally {
			await ctx.close();
		}
	});

	test('comments: composer above the list, newest first', async ({ browser }) => {
		const { ctx, page } = await devLogin(browser, EMAILS.owner);
		try {
			await openItem(page, richId, RICH);
			const composer = page.getByPlaceholder('Add a comment…').filter({ visible: true }).first();
			const list = vis(page, '[data-testid="item-comments"]').first();
			const cb = await composer.boundingBox();
			const lb = await list.boundingBox();
			expect(cb!.y).toBeLessThan(lb!.y);
			const texts = await list.locator('p.whitespace-pre-wrap').allTextContents();
			expect(texts).toEqual(['Second comment', 'First comment']);
		} finally {
			await ctx.close();
		}
	});

	test('sparse item: empty Documents + Checklist are one add line', async ({ browser }) => {
		const { ctx, page } = await devLogin(browser, EMAILS.owner);
		try {
			await openItem(page, sparseId, SPARSE);
			const line = vis(page, '[data-testid="item-add-line"]').first();
			await expect(line).toContainText('+ Document');
			await expect(line).toContainText('+ Checklist');
			await expect(page.getByRole('heading', { name: 'Documents' }).filter({ visible: true })).toHaveCount(0);
			// No estimate: Log payment is still its own Details row.
			await expect(vis(page, '[data-testid="item-details"] [data-detail="payment"]').first()).toContainText('Log payment');
			await expect(vis(page, '[data-testid="item-details"] [data-detail="cost"]')).toHaveCount(0);
			// + Document opens the section and drops itself from the line.
			await line.getByRole('button', { name: '+ Document' }).click();
			await expect(page.getByRole('heading', { name: 'Documents' }).filter({ visible: true }).first()).toBeVisible();
			await expect(line).not.toContainText('+ Document');
			// + Checklist attaches in place (form action) and the line goes.
			await line.getByRole('button', { name: '+ Checklist' }).click();
			await expect(page.getByPlaceholder('Add an item').filter({ visible: true }).first()).toBeVisible();
			await expect(vis(page, '[data-testid="item-add-line"]')).toHaveCount(0);
		} finally {
			await ctx.close();
		}
	});

	test('desktop: two columns, Hero left, comments right', async ({ browser }) => {
		const { ctx, page } = await devLogin(browser, EMAILS.owner, 1280, 900);
		try {
			await openItem(page, richId, RICH);
			const hero = await vis(page, '[data-hero]').first().boundingBox();
			const comments = await page.getByPlaceholder('Add a comment…').filter({ visible: true }).first().boundingBox();
			const docs = await page.getByRole('heading', { name: 'Documents' }).filter({ visible: true }).first().boundingBox();
			expect(comments!.x).toBeGreaterThan(hero!.x + hero!.width - 1);
			expect(docs!.x).toBeGreaterThan(hero!.x + hero!.width - 1);
			// One-column on a phone: the Hero sits above everything.
			await page.setViewportSize({ width: 375, height: 812 });
			const heroM = await vis(page, '[data-hero]').first().boundingBox();
			const commentsM = await page.getByPlaceholder('Add a comment…').filter({ visible: true }).first().boundingBox();
			expect(commentsM!.y).toBeGreaterThan(heroM!.y + heroM!.height);
		} finally {
			await ctx.close();
		}
	});

	test('a viewer sees the Hero but no add line', async ({ browser }) => {
		const { ctx, page } = await devLogin(browser, EMAILS.viewer);
		try {
			await openItem(page, sparseId, SPARSE);
			await expect(vis(page, '[data-hero]').first()).toBeVisible();
			await expect(vis(page, '[data-testid="item-add-line"]')).toHaveCount(0);
			await expect(vis(page, '[data-testid="item-details"] [data-detail="payment"]')).toHaveCount(0);
		} finally {
			await ctx.close();
		}
	});
});
