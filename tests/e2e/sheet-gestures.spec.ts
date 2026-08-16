import { test, expect, type Browser, type Page } from '@playwright/test';

// BottomSheet gesture + guard contract — #365 (grabber, drag-to-dismiss, back
// swallowing) and #370 (dirty guard).
//
// WHY THIS FILE BUILDS ITS OWN CONTEXTS: playwright.config pins
// `reducedMotion: 'reduce'` globally, which makes BottomSheet pass `duration: 0`
// and skip the settle animation entirely — a suite pinned that way cannot see a
// transition-lifecycle bug at all (that is how #379 survived the whole suite).
// Everything here runs at `reducedMotion: 'no-preference'` so the drag settles
// through the same WAAPI path a real phone uses. Note `test.use({ reducedMotion })`
// does not type-check in this Playwright version — it must go to newContext.
//
// The drags are dispatched as real TouchEvents. Playwright's mouse API would
// exercise a code path the component does not have: drag-to-dismiss is
// touch-only by design, and a previous wave shipped a no-op "fix" by reasoning
// from code instead of driving the real gesture at 375px.

const BASE = 'http://localhost:4173';
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';

const OWNER = 'rules-owner@e2e.test';
const FIXTURE_SLUG = 'e2e-rules-test-gestures';

async function devLogin(browser: Browser) {
	const ctx = await browser.newContext({
		viewport: { width: 375, height: 812 },
		hasTouch: true,
		isMobile: true,
		reducedMotion: 'no-preference'
	});
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(OWNER)}`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { ctx, page };
}

async function setupFixture(): Promise<void> {
	const bypassRes = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: OWNER })
	});
	const { token } = (await bypassRes.json()) as { token: string };

	await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({
			emails: {
				owner: OWNER,
				co_owner: 'rules-coowner@e2e.test',
				traveler: 'rules-traveler@e2e.test',
				viewer: 'rules-viewer@e2e.test',
				non_member: 'rules-nonmember@e2e.test'
			},
			slug: FIXTURE_SLUG
		})
	});
}

/** Open the Add Expense sheet. Scoped `:visible` — AppShell dual-renders. */
async function openAddExpense(page: Page) {
	await page.goto(`${BASE}/trips/${FIXTURE_SLUG}/expenses`);
	await page.locator('[aria-label="Add expense"]:visible').first().click();
	await expect(page.locator('[data-sheet-panel]')).toHaveCount(1, { timeout: 5000 });
}

/**
 * A real single-finger drag on the sheet's grabber strip, dispatched in-page so
 * the events carry genuine Touch objects.
 */
async function dragSheet(page: Page, dy: number, steps = 12, stepMs = 16) {
	const box = await page.locator('[data-sheet-drag-zone]').first().boundingBox();
	if (!box) throw new Error('no drag zone');
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;

	await page.evaluate(
		async ({ x, y, dy, steps, stepMs }) => {
			const target = document.elementFromPoint(x, y);
			if (!target) throw new Error('nothing at the drag origin');
			const mk = (type: string, cy: number) => {
				const t = new Touch({
					identifier: 1,
					target,
					clientX: x,
					clientY: cy,
					pageX: x,
					pageY: cy
				});
				const list = type === 'touchend' ? [] : [t];
				return new TouchEvent(type, {
					touches: list,
					targetTouches: list,
					changedTouches: [t],
					bubbles: true,
					cancelable: true
				});
			};
			target.dispatchEvent(mk('touchstart', y));
			for (let i = 1; i <= steps; i++) {
				target.dispatchEvent(mk('touchmove', y + (dy * i) / steps));
				await new Promise((r) => setTimeout(r, stepMs));
			}
			target.dispatchEvent(mk('touchend', y + dy));
		},
		{ x, y, dy, steps, stepMs }
	);
}

test.describe('BottomSheet gestures (#365)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeAll(async () => {
		await setupFixture();
	});

	test('grabber is rendered and the sheet tracks a downward drag', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser);
		try {
			await openAddExpense(page);

			const grabber = page.locator('[data-sheet-grabber]');
			await expect(grabber).toHaveCount(1);
			const gbox = await grabber.boundingBox();
			expect(gbox, 'grabber must have a real box').not.toBeNull();
			expect(gbox!.width).toBeGreaterThan(20);

			const restTop = (await page.locator('[data-sheet-panel]').boundingBox())!.y;

			// Measure DURING the gesture: the panel must follow the finger, not
			// merely end up dismissed. A dead transform still passes a
			// "did it close?" assertion, which is exactly how this ships broken.
			const box = (await page.locator('[data-sheet-drag-zone]').boundingBox())!;
			const midTop = await page.evaluate(
				async ({ x, y }) => {
					const target = document.elementFromPoint(x, y)!;
					const mk = (type: string, cy: number) => {
						const t = new Touch({ identifier: 2, target, clientX: x, clientY: cy, pageX: x, pageY: cy });
						const list = type === 'touchend' ? [] : [t];
						return new TouchEvent(type, { touches: list, targetTouches: list, changedTouches: [t], bubbles: true, cancelable: true });
					};
					target.dispatchEvent(mk('touchstart', y));
					for (let i = 1; i <= 6; i++) {
						target.dispatchEvent(mk('touchmove', y + i * 10));
						await new Promise((r) => setTimeout(r, 16));
					}
					const top = document.querySelector('[data-sheet-panel]')!.getBoundingClientRect().top;
					target.dispatchEvent(mk('touchend', y + 60));
					return top;
				},
				{ x: box.x + box.width / 2, y: box.y + box.height / 2 }
			);

			expect(midTop - restTop, 'panel must move with the finger').toBeGreaterThan(40);
		} finally {
			await ctx.close();
		}
	});

	test('a short drag springs back, a long drag dismisses', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser);
		try {
			await openAddExpense(page);

			// Slow and short — under both the distance and the velocity threshold.
			await dragSheet(page, 30, 12, 24);
			await page.waitForTimeout(500);
			await expect(page.locator('[data-sheet-panel]')).toHaveCount(1);
			const top = (await page.locator('[data-sheet-panel]').boundingBox())!.y;

			// Past the distance threshold — must dismiss and leave nothing behind.
			await dragSheet(page, 220);
			await expect.poll(async () => page.locator('.z-modal').count(), { timeout: 5000 }).toBe(0);

			// And the page behind is interactive again.
			const under = await page.evaluate(() => {
				const el = document.elementFromPoint(
					Math.floor(window.innerWidth / 2),
					Math.floor(window.innerHeight / 2)
				);
				return el ? `${el.tagName}.${el.className}` : 'none';
			});
			expect(under).not.toMatch(/z-modal/);
			expect(top).toBeGreaterThan(0);
		} finally {
			await ctx.close();
		}
	});

	test('an open sheet swallows back; a normal dismissal pops its entry', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser);
		try {
			// Land on the overview first so there is somewhere to go back TO.
			await page.goto(`${BASE}/trips/${FIXTURE_SLUG}`);
			await openAddExpense(page);
			const urlWithSheetOpen = page.url();

			await page.goBack();

			// Back closes the sheet and leaves the PAGE where it was.
			await expect.poll(async () => page.locator('.z-modal').count(), { timeout: 5000 }).toBe(0);
			expect(page.url()).toBe(urlWithSheetOpen);

			// Shallow routing must not run the layout's view-transition wrapper.
			expect(await page.evaluate(() => document.documentElement.dataset.transition ?? null)).toBeNull();

			// Closing by other means must POP the pushed entry, or back would need
			// two presses forever after (the #235 history-depth scar).
			await page.locator('[aria-label="Add expense"]:visible').first().click();
			await expect(page.locator('[data-sheet-panel]')).toHaveCount(1);
			await page.locator('.z-modal button[aria-label="Close"]').first().click();
			await expect.poll(async () => page.locator('.z-modal').count(), { timeout: 5000 }).toBe(0);

			await page.goBack();
			await page.waitForURL(`${BASE}/trips/${FIXTURE_SLUG}`, { timeout: 5000 });
		} finally {
			await ctx.close();
		}
	});

	test('the page behind is locked while a sheet is open and released after', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser);
		try {
			await openAddExpense(page);

			expect(
				await page.evaluate(() => ({
					pos: getComputedStyle(document.body).position,
					flag: document.body.dataset.scrollLocked ?? null
				}))
			).toEqual({ pos: 'fixed', flag: 'true' });

			expect(
				await page.evaluate(() =>
					getComputedStyle(document.querySelector('[data-sheet-panel]')!).overscrollBehavior
				)
			).toContain('contain');

			await page.locator('.z-modal button[aria-label="Close"]').first().click();
			await expect.poll(async () => page.locator('.z-modal').count(), { timeout: 5000 }).toBe(0);

			expect(
				await page.evaluate(() => ({
					pos: getComputedStyle(document.body).position,
					flag: document.body.dataset.scrollLocked ?? null
				}))
			).toEqual({ pos: 'static', flag: null });
		} finally {
			await ctx.close();
		}
	});
});
