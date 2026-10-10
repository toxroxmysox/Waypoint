import { test, expect, type Page } from '@playwright/test';
import { E2E_BASE } from './e2e-env';

// #445 — desktop day page. The context rail (>= 1280px) shows Up next as mini day
// cards and holds the phase Ideas as a drag source: the mouse drags a whole idea
// straight away, the timeline offers itself as a drop target while it is in flight,
// and dropping plans the idea. AppShell renders the page twice: every locator is
// scoped to the visible tree.

const BASE = E2E_BASE;
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';
const SLUG = 'e2e-desktop-day-445';
let dayId = '';

async function seed() {
	const res = await fetch(`${PB_BASE}/api/dev/seed-visual-trip`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ slug: SLUG, ideas: true })
	});
	if (!res.ok) throw new Error(`seed failed (${res.status}): ${await res.text()}`);
	dayId = (await res.json()).days[0].id;
}

async function open(page: Page) {
	await page.setViewportSize({ width: 1280, height: 1000 });
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(process.env.E2E_TEST_EMAIL!)}`);
	await page.waitForURL(/\/trips|\/claim/, { timeout: 15000 });
	await page.goto(`${BASE}/trips/${SLUG}/days/${dayId}`, { waitUntil: 'networkidle' });
}

test.describe('Desktop day page (#445)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');
	test.beforeAll(seed);
	test.describe.configure({ mode: 'serial' });

	test('Up next shows each day as a mini card with a title and an item count', async ({ page }) => {
		await open(page);
		const cards = page.locator('[data-up-next-day]:visible');
		await expect(cards.first()).toBeVisible();
		await expect(cards.first()).toContainText(/\d+ items?/);
	});

	test('mouse: dragging a rail idea highlights the day as a drop target and plans it on drop', async ({ page }) => {
		await open(page);
		const idea = page.locator('[data-rail-ideas]:visible [data-parking-zone]').getByRole('listitem', { name: 'The American Club' });
		const target = page.locator('[data-day-timeline]:visible > div').first();
		await expect(idea).toBeVisible();
		const from = (await idea.boundingBox())!;
		const to = (await target.boundingBox())!;
		const planned = page.waitForResponse(
			(r) => r.request().method() === 'POST' && r.url().includes('?/pullToPlan') && r.ok(),
			{ timeout: 10000 }
		);
		// No long press: the mouse moves off the press point and the drag is on.
		await page.mouse.move(from.x + from.width / 2, from.y + 18);
		await page.mouse.down();
		await page.mouse.move(from.x + from.width / 2 - 30, from.y + 18, { steps: 4 });
		await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
		await expect(page.locator('[data-drop-prompt]:visible')).toHaveText('Drop to plan');
		await expect(page.locator('[data-day-timeline]:visible')).toHaveAttribute('data-plan-drop', 'true');
		await page.mouse.up();
		await planned;
		await page.reload({ waitUntil: 'networkidle' });
		await expect(page.locator('[data-day-timeline]:visible').getByText('The American Club')).toBeVisible();
		await expect(page.locator('[data-rail-ideas]:visible').getByText('The American Club')).toHaveCount(0);
	});
});
