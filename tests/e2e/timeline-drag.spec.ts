import { test, expect, type Browser, type CDPSession, type Page } from '@playwright/test';

// Whole-card drag on the day timeline — #353.
//
// The card is BOTH a link and a drag source, so every assertion here is about
// telling three gestures apart on the same pixels:
//   • hold ~250ms, then move   → reorder
//   • press and release        → open the card
//   • press and move straight  → scroll the page
// plus the keyboard path, which must survive the grip's retirement.
//
// WHY CDP TOUCH, NOT page.mouse OR new TouchEvent(): svelte-dnd-action arms on
// touchstart and decides on touchmove. A script-built TouchEvent fires no
// pointer events, and page.mouse cannot hold-then-drag convincingly. CDP
// `Input.dispatchTouchEvent` goes through the browser's real input pipeline —
// it honours `touch-action` and actually scrolls. A previous wave shipped a
// no-op gesture "fix" by reasoning from code; this drives the gesture at 375px.
// Same reasoning (and setup) as tests/e2e/lightbox-zoom.spec.ts.

const BASE = 'http://localhost:4173';
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';
const SLUG = 'e2e-drag-353';

// seed-visual-trip's day 1: two timed items then one untimed, in this order.
// Only the untimed one is free to reorder — a time pins the others (#60).
const TEE = 'Blackwolf Run tee time';
const LUNCH = 'Lunch at The Horse & Plow';
const PACK = 'Pack the clubs';

let dayId = '';

/**
 * Owns its own slug so a parallel worker's fixture teardown can't wipe it
 * mid-run (the seed endpoint is destructive per slug).
 */
async function seedFixture(): Promise<void> {
	const res = await fetch(`${PB_BASE}/api/dev/seed-visual-trip`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ slug: SLUG })
	});
	if (!res.ok) throw new Error(`seed-visual-trip failed (${res.status}): ${await res.text()}`);
	const { days } = (await res.json()) as { days: { id: string; itemCount: number }[] };
	if (days[0]?.itemCount !== 3) throw new Error(`fixture day 1 should hold 3 items, got ${days[0]?.itemCount}`);
	dayId = days[0].id;
}

async function openDay(browser: Browser, height = 812) {
	const ctx = await browser.newContext({
		viewport: { width: 375, height },
		hasTouch: true,
		isMobile: true
	});
	const page = await ctx.newPage();
	const email = encodeURIComponent(process.env.E2E_TEST_EMAIL!);
	await page.goto(`${BASE}/api/dev/login?email=${email}`);
	await page.waitForURL(/\/(trips|claim)/, { timeout: 15000 });
	await page.goto(`${BASE}/trips/${SLUG}/days/${dayId}`, { waitUntil: 'networkidle' });
	const cdp = await ctx.newCDPSession(page);
	await expect(cards(page)).toHaveCount(3, { timeout: 10000 });
	return { ctx, page, cdp };
}

// AppShell renders the page twice (one CSS-hidden), so the zone is scoped to
// the visible tree. The wrappers are the dndzone's direct children — 1:1 with
// the day's items by construction — and carry the item title as aria-label.
const zone = (page: Page) => page.locator('[data-day-timeline]').filter({ visible: true });
const cards = (page: Page) => zone(page).locator('> div');

async function order(page: Page): Promise<string[]> {
	return cards(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
}

/** Centre of the card whose aria-label is `title`. */
async function cardCentre(page: Page, title: string): Promise<Pt> {
	const idx = (await order(page)).indexOf(title);
	if (idx < 0) throw new Error(`no card titled "${title}" on the timeline`);
	const box = (await cards(page).nth(idx).boundingBox())!;
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

type Pt = { x: number; y: number };

async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Pt[]) {
	await cdp.send('Input.dispatchTouchEvent', {
		type,
		touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i, radiusX: 1, radiusY: 1, force: 1 }))
	});
}

/**
 * Hold still past the arm delay, THEN move. The finger must not drift ≥3px
 * while holding (`MIN_MOVEMENT_BEFORE_DRAG_START_PX`) or the library reads the
 * gesture as a scroll and cancels — so no touchMove is dispatched during the
 * hold at all.
 */
async function longPressDrag(page: Page, cdp: CDPSession, from: Pt, to: Pt, steps = 12) {
	await touch(cdp, 'touchStart', [from]);
	await page.waitForTimeout(400);
	for (let i = 1; i <= steps; i++) {
		await touch(cdp, 'touchMove', [
			{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }
		]);
		await page.waitForTimeout(16);
	}
	await page.waitForTimeout(120);
	await touch(cdp, 'touchEnd', []);
}

/** Press and move immediately — no hold. This is the scroll gesture. */
async function swipe(page: Page, cdp: CDPSession, from: Pt, to: Pt, steps = 10) {
	await touch(cdp, 'touchStart', [from]);
	for (let i = 1; i <= steps; i++) {
		await touch(cdp, 'touchMove', [
			{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }
		]);
		await page.waitForTimeout(16);
	}
	await touch(cdp, 'touchEnd', []);
}

async function tap(cdp: CDPSession, p: Pt) {
	await touch(cdp, 'touchStart', [p]);
	await touch(cdp, 'touchEnd', []);
}

/**
 * The drop only updates a working copy; `use:enhance` POSTs the new order
 * behind it. Reloading before that lands kills the in-flight request and the
 * order silently reverts — so every persistence assertion waits on the POST
 * itself, never on a sleep. (Same scar as #364.)
 */
function reorderPosted(page: Page) {
	return page.waitForResponse(
		(r) => r.request().method() === 'POST' && r.url().includes('?/reorder') && r.ok(),
		{ timeout: 10000 }
	);
}

test.describe('Day timeline whole-card drag (#353)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeEach(async () => {
		// Re-seeded per test: a reorder that persists would otherwise leak into
		// the next test's starting order.
		await seedFixture();
	});

	test('a long press then a move reorders, and the new order persists', async ({ browser }) => {
		const { ctx, page, cdp } = await openDay(browser);
		try {
			expect(await order(page), 'fixture starts timed, timed, untimed').toEqual([TEE, LUNCH, PACK]);

			const from = await cardCentre(page, PACK);
			const target = await cardCentre(page, TEE);
			const posted = reorderPosted(page);
			// Past the first card's centre, so the untimed item resolves above it.
			await longPressDrag(page, cdp, from, { x: from.x, y: target.y - 12 });

			await expect.poll(() => order(page), { timeout: 5000 }).toEqual([PACK, TEE, LUNCH]);
			await posted;

			// The list above is only a working copy — a reload is what proves the
			// server took it.
			await page.reload({ waitUntil: 'networkidle' });
			expect(await order(page), 'the reorder survives a reload').toEqual([PACK, TEE, LUNCH]);
		} finally {
			await ctx.close();
		}
	});

	test('a quick tap still opens the card, with its ?from= origin intact', async ({ browser }) => {
		const { ctx, page, cdp } = await openDay(browser);
		try {
			await tap(cdp, await cardCentre(page, TEE));

			await page.waitForURL(/\/items\/[^/?]+/, { timeout: 5000 });
			// #361: the card link carries where it was opened FROM, so the chevron
			// comes back to this day rather than the phase.
			expect(new URL(page.url()).searchParams.get('from')).toBe(`/trips/${SLUG}/days/${dayId}`);
			await expect(page.locator('h1, h2').filter({ hasText: TEE }).first()).toBeVisible();
		} finally {
			await ctx.close();
		}
	});

	test('a vertical swipe that starts ON a card scrolls the page, and never drags', async ({
		browser
	}) => {
		// Short viewport so the day page is certain to overflow.
		const { ctx, page, cdp } = await openDay(browser, 500);
		try {
			const before = await order(page);
			expect(
				await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight),
				'the fixture day must overflow, or this asserts nothing'
			).toBe(true);

			const from = await cardCentre(page, TEE);
			await swipe(page, cdp, from, { x: from.x, y: from.y - 220 });
			await page.waitForTimeout(300);

			expect(await page.evaluate(() => window.scrollY), 'the swipe must scroll').toBeGreaterThan(40);
			expect(await order(page), 'a swipe must not reorder anything').toEqual(before);
			await expect(page.locator('#dnd-action-dragged-el'), 'no drag may have started').toHaveCount(0);
		} finally {
			await ctx.close();
		}
	});

	test('keyboard reorder survives the grip retirement', async ({ browser }) => {
		const { ctx, page } = await openDay(browser);
		try {
			expect(await order(page)).toEqual([TEE, LUNCH, PACK]);

			// The card wrapper itself is the focusable drag target now — the library
			// gives it a tabindex and owns Enter/Space + arrows. A nested grip button
			// could not do this: keyboardAction.js ignores keydowns whose target is a
			// nested interactive element it has not registered as a drag target.
			const pack = cards(page).nth(2);
			await expect(pack).toHaveAttribute('tabindex', '0');
			await pack.focus();

			const posted = reorderPosted(page);
			await page.keyboard.press('Space'); // start the keyboard drag
			await page.keyboard.press('ArrowUp'); // move it above the lunch card
			await page.keyboard.press('Enter'); // drop

			await expect.poll(() => order(page), { timeout: 5000 }).toEqual([TEE, PACK, LUNCH]);
			await posted;

			await page.reload({ waitUntil: 'networkidle' });
			expect(await order(page), 'the keyboard reorder persists too').toEqual([TEE, PACK, LUNCH]);
		} finally {
			await ctx.close();
		}
	});

	test('the rail prints a time for timed items and a dot for untimed ones', async ({ browser }) => {
		const { ctx, page } = await openDay(browser);
		try {
			// The rail replaces the desktop-only `-left-16` column, so it has to be
			// there at 375 — where nothing rendered a gutter time before.
			await expect(cards(page).nth(0).locator('[data-rail="time"]')).toContainText('9:00');
			await expect(cards(page).nth(1).locator('[data-rail="time"]')).toContainText('12:30');
			await expect(
				cards(page).nth(2).locator('[data-rail="dot"]'),
				'an untimed item gets a hollow dot and no time'
			).toHaveCount(1);
			await expect(cards(page).nth(2).locator('[data-rail="time"]')).toHaveCount(0);
		} finally {
			await ctx.close();
		}
	});
});
