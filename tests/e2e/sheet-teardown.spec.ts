import { test, expect, type Browser } from '@playwright/test';

// BottomSheet teardown guard — filed as #379 ("P1: page goes tap-dead after
// closing any BottomSheet").
//
// WHAT #379 ACTUALLY IS (investigated 2026-08-03): an artifact of a BACKGROUND
// browser tab, not an app defect. Svelte 5 drives transition completion from a
// `requestAnimationFrame` loop. In a tab with `document.visibilityState ===
// 'hidden'`, rAF never fires, so the outro never completes and the `{#if open}`
// block — including its `fixed inset-0 z-modal` wrapper — is never removed. The
// WAAPI animations still reach their end state off the document timeline, which
// is why the sheet LOOKS closed while an invisible overlay keeps swallowing
// taps. Measured in the audit's browser pane: `visibilityState: 'hidden'`,
// 0 rAF ticks per second. In any foreground page the outro completes normally.
//
// The original issue blamed AppShell's dual render + WAAPI-in-`display:none`.
// That was disproved: only ONE sheet instance mounts (each render of the page
// has its own `open` state, so the hidden copy never opens), and every
// animation reported `playState: 'finished'`.
//
// This spec is the regression guard for the REAL contract — a closed sheet
// leaves no interaction-blocking layer behind — and it asserts rAF is live so
// that a future failure here means an app regression and not a dead tab.
//
// Note: playwright.config sets `reducedMotion: 'reduce'` globally, which makes
// BottomSheet pass `duration: 0` and skip the animation entirely. This file
// builds its own contexts with `reducedMotion: 'no-preference'` so the sheet
// actually animates and the teardown path under test is the real one.

const BASE = 'http://localhost:4173';
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';

const OWNER = 'rules-owner@e2e.test';
const FIXTURE_SLUG = 'e2e-rules-test-sheet';

async function devLogin(browser: Browser, email: string) {
	const ctx = await browser.newContext({ reducedMotion: 'no-preference' });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { ctx, page };
}

async function setupFixture(email: string): Promise<void> {
	const bypassRes = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
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

test.describe('BottomSheet teardown (#379)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeAll(async () => {
		await setupFixture(OWNER);
	});

	test('closing a sheet unmounts it — the page behind stays tappable', async ({ browser }) => {
		const { page, ctx } = await devLogin(browser, OWNER);

		try {
			await page.setViewportSize({ width: 375, height: 812 });
			await page.goto(`${BASE}/trips/${FIXTURE_SLUG}/expenses`);

			// Precondition: this page is FOREGROUND and animating. Without it a
			// failure below is ambiguous — a hidden tab stalls Svelte's outro loop
			// and would fail this spec for reasons that never affect a real user.
			const rafTicks = await page.evaluate(
				() =>
					new Promise<number>((resolve) => {
						let n = 0;
						const t0 = performance.now();
						const loop = () => {
							n++;
							if (performance.now() - t0 < 300) requestAnimationFrame(loop);
							else resolve(n);
						};
						requestAnimationFrame(loop);
					})
			);
			expect(rafTicks, 'page must be foreground/animating for this spec to mean anything').toBeGreaterThan(0);

			// Open the Add Expense sheet, then close it via the X.
			await page
				.getByRole('button', { name: /add expense/i })
				.filter({ visible: true })
				.first()
				.click();
			await expect(page.getByText(/amount/i).filter({ visible: true }).first()).toBeVisible({
				timeout: 5000
			});

			await page.getByRole('button', { name: 'Close' }).filter({ visible: true }).first().click();

			// The wrapper must actually LEAVE THE DOM. An `opacity: 0` wrapper still
			// swallows taps, so a visibility assertion is not enough — count nodes.
			await expect
				.poll(async () => page.locator('.z-modal').count(), { timeout: 5000 })
				.toBe(0);

			// The real symptom: taps land again. Ask the document what is actually
			// under the centre of the viewport — a ghost overlay answers here.
			const topTag = await page.evaluate(() => {
				const el = document.elementFromPoint(
					Math.floor(window.innerWidth / 2),
					Math.floor(window.innerHeight / 2)
				);
				return el ? `${el.tagName}.${el.className}` : 'none';
			});
			expect(topTag).not.toMatch(/z-modal/);

			// End-to-end proof: a real click on page chrome still works.
			await page
				.getByRole('button', { name: /add expense/i })
				.filter({ visible: true })
				.first()
				.click();
			await expect(page.getByText(/amount/i).filter({ visible: true }).first()).toBeVisible({
				timeout: 5000
			});
		} finally {
			await ctx.close();
		}
	});
});
