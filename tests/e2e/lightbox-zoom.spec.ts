import { test, expect, type Browser, type CDPSession, type Page } from '@playwright/test';
import { deflateSync, crc32 } from 'node:zlib';

// DocumentLightbox gesture contract — #371.
//
// Boarding passes and QR codes get opened at a gate, one-handed. The lightbox
// must pinch-zoom, pan while zoomed, double-tap to zoom/unzoom, keep paging by
// swipe at 1x (and NOT page while zoomed), and swipe down to dismiss at 1x.
//
// WHY CDP TOUCH, NOT page.mouse OR new TouchEvent(): the stage is driven by
// POINTER events. A script-constructed TouchEvent fires no pointer events at
// all, and the mouse API can't do two fingers. `Input.dispatchTouchEvent` goes
// through the browser's real input pipeline — it produces pointer events AND
// touch events, honours `touch-action`, and supports multi-touch. A previous
// wave shipped a no-op gesture "fix" by reasoning from code; this drives the
// actual gesture at 375px.
//
// Own contexts at `reducedMotion: 'no-preference'` for the same reason as
// sheet-gestures.spec.ts: the global config pins 'reduce', which would hide the
// slide/settle transitions this file needs to survive.

const BASE = 'http://localhost:4173';
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';

const OWNER = 'rules-owner@e2e.test';
const FIXTURE_SLUG = 'e2e-rules-test-lightbox';

// ---------------------------------------------------------------------------
// Fixture: a trip with two image documents. A tiny PNG encoder keeps the file
// self-contained (no binary fixtures in the repo). The image is a coarse
// checkerboard — portrait, like a boarding pass — so a screenshot shows zoom.
// ---------------------------------------------------------------------------
function png(width: number, height: number, cell: number, dark: [number, number, number]): Buffer {
	const raw = Buffer.alloc((width * 3 + 1) * height);
	for (let y = 0; y < height; y++) {
		const row = y * (width * 3 + 1);
		raw[row] = 0; // filter: none
		for (let x = 0; x < width; x++) {
			const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
			const [r, g, b] = on ? dark : [245, 240, 230];
			raw[row + 1 + x * 3] = r;
			raw[row + 2 + x * 3] = g;
			raw[row + 3 + x * 3] = b;
		}
	}
	const chunk = (type: string, data: Buffer) => {
		const len = Buffer.alloc(4);
		len.writeUInt32BE(data.length);
		const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(td) >>> 0);
		return Buffer.concat([len, td, crc]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // colour type: RGB
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0))
	]);
}

async function setupFixture(): Promise<void> {
	const bypassRes = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: OWNER })
	});
	const { token } = (await bypassRes.json()) as { token: string };

	const fx = await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
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
	const { tripId } = (await fx.json()) as { tripId: string };

	// The rules-fixture seeds its own 1x1 `fixture.png` (a rules-harness
	// record). Drop it so the gallery is exactly our two images.
	const existing = await fetch(
		`${PB_BASE}/api/collections/documents/records?filter=${encodeURIComponent(`trip="${tripId}"`)}`,
		{ headers: { Authorization: token } }
	);
	for (const d of ((await existing.json()) as { items: { id: string }[] }).items) {
		await fetch(`${PB_BASE}/api/collections/documents/records/${d.id}`, {
			method: 'DELETE',
			headers: { Authorization: token }
		});
	}

	// Two trip-level images → one gallery group of 2. Display order is not
	// assumed (see openLightbox).
	for (const [caption, colour] of [
		['Pass A', [30, 60, 45]],
		['Pass B', [150, 70, 40]]
	] as const) {
		const fd = new FormData();
		fd.append('trip', tripId);
		fd.append('caption', caption);
		fd.append(
			'file',
			new Blob([new Uint8Array(png(600, 900, 60, colour as unknown as [number, number, number]))], {
				type: 'image/png'
			}),
			`${caption.replace(' ', '-').toLowerCase()}.png`
		);
		const res = await fetch(`${PB_BASE}/api/collections/documents/records`, {
			method: 'POST',
			headers: { Authorization: token },
			body: fd
		});
		if (!res.ok) throw new Error(`document upload failed (${res.status}): ${await res.text()}`);
	}
}

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
	const cdp = await ctx.newCDPSession(page);
	return { ctx, page, cdp };
}

// AppShell renders the page twice (one CSS-hidden); only the visible tree's
// lightbox is the one a finger can reach.
const dialog = (page: Page) => page.locator('[role="dialog"]').filter({ visible: true });
const stageImg = (page: Page) => dialog(page).locator('img').first();

/**
 * Open the FIRST image of the gallery (whichever caption lists first — the
 * two uploads can share a `created` millisecond, so never assume an order).
 * Every spec starts at index 0, so "next" always exists: a swipe-left that
 * fails to page is a real failure, not an end-of-gallery no-op.
 */
async function openLightbox(page: Page): Promise<Rect> {
	await page.goto(`${BASE}/trips/${FIXTURE_SLUG}/documents`, { waitUntil: 'networkidle' });
	const view = page.locator('button[aria-label^="View Pass"]').filter({ visible: true });
	await expect(view).toHaveCount(2, { timeout: 10000 });
	await view.first().click();
	await expect(dialog(page)).toHaveCount(1, { timeout: 5000 });
	await expect
		.poll(async () => stageImg(page).evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0))
		.toBe(true);
	expect(await counter(page)).toBe('1/2');
	return waitForImageAtRest(page);
}

type Rect = { x: number; y: number; width: number; height: number };

async function imgRect(page: Page): Promise<Rect> {
	return stageImg(page).evaluate((el) => {
		const r = el.getBoundingClientRect();
		return { x: r.x, y: r.y, width: r.width, height: r.height };
	});
}

/** Settled = two consecutive identical reads (transitions are real here). */
async function waitForImageAtRest(page: Page): Promise<Rect> {
	let last = '';
	for (let i = 0; i < 40; i++) {
		const r = await imgRect(page);
		const key = [r.x, r.y, r.width, r.height].map((n) => Math.round(n)).join(',');
		if (key === last) return r;
		last = key;
		await page.waitForTimeout(60);
	}
	throw new Error(`image never settled (last ${last})`);
}

type Pt = { x: number; y: number };

async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Pt[]) {
	await cdp.send('Input.dispatchTouchEvent', {
		type,
		touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i, radiusX: 1, radiusY: 1, force: 1 }))
	});
}

/** One finger, from → to, in `steps` moves ~16ms apart. */
async function drag(page: Page, cdp: CDPSession, from: Pt, to: Pt, steps = 10) {
	await touch(cdp, 'touchStart', [from]);
	for (let i = 1; i <= steps; i++) {
		await touch(cdp, 'touchMove', [
			{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }
		]);
		await page.waitForTimeout(16);
	}
	await touch(cdp, 'touchEnd', []);
}

/** Two fingers spreading symmetrically about `c`, from gap `d0` to gap `d1`. */
async function pinch(page: Page, cdp: CDPSession, c: Pt, d0: number, d1: number, steps = 10) {
	const at = (d: number): Pt[] => [
		{ x: c.x - d / 2, y: c.y },
		{ x: c.x + d / 2, y: c.y }
	];
	await touch(cdp, 'touchStart', at(d0));
	for (let i = 1; i <= steps; i++) {
		await touch(cdp, 'touchMove', at(d0 + ((d1 - d0) * i) / steps));
		await page.waitForTimeout(16);
	}
	await touch(cdp, 'touchEnd', []);
}

async function doubleTap(page: Page, cdp: CDPSession, p: Pt) {
	for (let i = 0; i < 2; i++) {
		await touch(cdp, 'touchStart', [p]);
		await touch(cdp, 'touchEnd', []);
		if (i === 0) await page.waitForTimeout(80);
	}
}

const centre = (r: Rect): Pt => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

async function counter(page: Page) {
	return (await dialog(page).locator('span.tabular-nums').first().textContent())?.trim();
}

test.describe('DocumentLightbox gestures (#371)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeAll(async () => {
		await setupFixture();
	});

	test('pinch zooms the image; pan moves it; swipe does not page while zoomed', async ({ browser }) => {
		const { ctx, page, cdp } = await devLogin(browser);
		try {
			const rest = await openLightbox(page);

			await pinch(page, cdp, centre(rest), 80, 240);
			const zoomed = await waitForImageAtRest(page);
			expect(zoomed.width / rest.width, 'pinch must scale the image up').toBeGreaterThan(1.8);

			// Pan: one finger, while zoomed, moves the image with the finger.
			await drag(page, cdp, { x: 190, y: 420 }, { x: 110, y: 340 });
			const panned = await waitForImageAtRest(page);
			expect(panned.x - zoomed.x, 'pan must move the image left').toBeLessThan(-40);
			expect(panned.y - zoomed.y, 'pan must move the image up').toBeLessThan(-40);
			expect(panned.width, 'pan must not change scale').toBeCloseTo(zoomed.width, 0);

			// Pan is clamped: a huge drag cannot throw the image off the stage.
			await drag(page, cdp, { x: 60, y: 420 }, { x: 360, y: 420 });
			await drag(page, cdp, { x: 60, y: 420 }, { x: 360, y: 420 });
			const clamped = await waitForImageAtRest(page);
			expect(clamped.x, 'image left edge may not come past the stage edge').toBeLessThanOrEqual(1);

			// A full horizontal swipe while zoomed must NOT page.
			await drag(page, cdp, { x: 330, y: 420 }, { x: 30, y: 420 }, 6);
			await page.waitForTimeout(500);
			expect(await counter(page), 'swipe while zoomed must not page').toBe('1/2');
		} finally {
			await ctx.close();
		}
	});

	test('double-tap zooms in, double-tap again zooms back out', async ({ browser }) => {
		const { ctx, page, cdp } = await devLogin(browser);
		try {
			const rest = await openLightbox(page);
			// Pixel proof at 375 (gitignored .visual/, stable names).
			await page.screenshot({ path: '.visual/lightbox-375-1x.png' });

			await doubleTap(page, cdp, centre(rest));
			const zoomed = await waitForImageAtRest(page);
			expect(zoomed.width / rest.width, 'double-tap must zoom in').toBeGreaterThan(1.8);
			await page.screenshot({ path: '.visual/lightbox-375-zoomed.png' });
			await expect(dialog(page), 'a double-tap is not a close').toHaveCount(1);

			await doubleTap(page, cdp, { x: 187, y: 420 });
			const back = await waitForImageAtRest(page);
			expect(Math.abs(back.width - rest.width), 'second double-tap resets to 1x').toBeLessThan(2);
			expect(Math.abs(back.x - rest.x)).toBeLessThan(2);
			await expect(dialog(page)).toHaveCount(1);
		} finally {
			await ctx.close();
		}
	});

	test('at 1x a horizontal swipe pages; zoom resets on image change', async ({ browser }) => {
		const { ctx, page, cdp } = await devLogin(browser);
		try {
			const rest = await openLightbox(page);

			// Watch the body lock across paging: one lock for the whole session
			// (#373). A lock effect that re-runs per image strips and reapplies
			// the body's styles on every page.
			await page.evaluate(() => {
				const w = window as unknown as { __lockChurn: number };
				w.__lockChurn = 0;
				new MutationObserver(() => w.__lockChurn++).observe(document.body, {
					attributes: true,
					attributeFilter: ['style', 'data-scroll-locked']
				});
			});

			// Swipe left → next image.
			await drag(page, cdp, { x: 300, y: 420 }, { x: 80, y: 420 }, 8);
			await expect.poll(() => counter(page), { timeout: 3000 }).toBe('2/2');
			const second = await waitForImageAtRest(page);
			expect(Math.abs(second.x - rest.x), 'the new image settles centred').toBeLessThan(2);

			// Zoom the second image, then page back with the Prev button: the
			// first image must come up at 1x, not inherit the zoom.
			await doubleTap(page, cdp, centre(second));
			const z = await waitForImageAtRest(page);
			expect(z.width / rest.width).toBeGreaterThan(1.8);
			await dialog(page).locator('button[aria-label="Previous"]').click();
			await expect.poll(() => counter(page), { timeout: 3000 }).toBe('1/2');
			const reset = await waitForImageAtRest(page);
			expect(Math.abs(reset.width - rest.width), 'zoom resets on image change').toBeLessThan(2);

			// Body lock held across paging, one lock for the session (#373).
			expect(await page.evaluate(() => document.body.dataset.scrollLocked ?? null)).toBe('true');
			expect(
				await page.evaluate(() => (window as unknown as { __lockChurn: number }).__lockChurn),
				'paging must not unlock/relock the body'
			).toBe(0);
		} finally {
			await ctx.close();
		}
	});

	test('at 1x a swipe down dismisses; a short one springs back', async ({ browser }) => {
		const { ctx, page, cdp } = await devLogin(browser);
		try {
			const rest = await openLightbox(page);

			// Mid-gesture the image must follow the finger — "did it close?" alone
			// would pass for a dead transform.
			await touch(cdp, 'touchStart', [{ x: 187, y: 300 }]);
			for (let i = 1; i <= 6; i++) {
				await touch(cdp, 'touchMove', [{ x: 187, y: 300 + i * 15 }]);
				await page.waitForTimeout(16);
			}
			const mid = await imgRect(page);
			expect(mid.y - rest.y, 'image tracks the finger down').toBeGreaterThan(50);
			// Short + slow: release after a pause so velocity is ~0.
			await page.waitForTimeout(200);
			await touch(cdp, 'touchEnd', []);
			const sprung = await waitForImageAtRest(page);
			expect(Math.abs(sprung.y - rest.y), 'short drag springs back').toBeLessThan(2);
			await expect(dialog(page)).toHaveCount(1);

			// Long drag → dismiss, lock released.
			await drag(page, cdp, { x: 187, y: 300 }, { x: 187, y: 560 }, 10);
			await expect(dialog(page)).toHaveCount(0, { timeout: 3000 });
			expect(await page.evaluate(() => document.body.dataset.scrollLocked ?? null)).toBeNull();
		} finally {
			await ctx.close();
		}
	});

	test('a single tap on the backdrop still closes at 1x', async ({ browser }) => {
		const { ctx, page, cdp } = await devLogin(browser);
		try {
			await openLightbox(page);
			const box = (await dialog(page).boundingBox())!;
			// Bottom strip of the stage: below the image, above nothing else.
			const p = { x: box.width / 2, y: box.y + box.height - 12 };
			await touch(cdp, 'touchStart', [p]);
			await touch(cdp, 'touchEnd', []);
			await expect(dialog(page)).toHaveCount(0, { timeout: 3000 });
		} finally {
			await ctx.close();
		}
	});

	test('toolbar and paging controls are ≥44px hit targets', async ({ browser }) => {
		const { ctx, page } = await devLogin(browser);
		try {
			await openLightbox(page);
			const controls = dialog(page).locator('button:not([aria-label="Close"][class*="inset-0"]), a');
			const n = await controls.count();
			expect(n).toBeGreaterThan(2);
			for (let i = 0; i < n; i++) {
				const c = controls.nth(i);
				if (!(await c.isVisible())) continue;
				const b = (await c.boundingBox())!;
				const name = (await c.getAttribute('aria-label')) ?? (await c.textContent())?.trim();
				expect(b.width, `${name} width`).toBeGreaterThanOrEqual(44);
				expect(b.height, `${name} height`).toBeGreaterThanOrEqual(44);
			}
		} finally {
			await ctx.close();
		}
	});

	test('reduced motion: paging still works, with no slide transition', async ({ browser }) => {
		const ctx = await browser.newContext({
			viewport: { width: 375, height: 812 },
			hasTouch: true,
			isMobile: true,
			reducedMotion: 'reduce'
		});
		const page = await ctx.newPage();
		await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(OWNER)}`);
		await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
		const cdp = await ctx.newCDPSession(page);
		try {
			await openLightbox(page);
			await touch(cdp, 'touchStart', [{ x: 300, y: 420 }]);
			await touch(cdp, 'touchMove', [{ x: 200, y: 420 }]);
			await touch(cdp, 'touchMove', [{ x: 80, y: 420 }]);
			await touch(cdp, 'touchEnd', []);
			// Instant swap — no 220ms slide to wait out.
			expect(await counter(page)).toBe('2/2');
			const style = await stageImg(page).getAttribute('style');
			expect(style ?? '').not.toContain('transition');
		} finally {
			await ctx.close();
		}
	});
});
