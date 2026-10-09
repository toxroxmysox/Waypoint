import { test, expect, type Page } from '@playwright/test';
import { E2E_BASE, E2E_PB_BASE } from './e2e-env';

// #431 / #392 — the Now feed puts every item in exactly one place, and the free-time
// countdown sees deadlines. Seeds via PB (seed-visual-trip { now: 'buckets' | 'deadline' }),
// each with its own slug. AppShell renders the page twice: every locator is visible-scoped.

const BASE = E2E_BASE;
const STAMP = Date.now().toString(36);
const BUCKETS = `e2e-buckets-${STAMP}`;
const DEADLINE = `e2e-deadline-${STAMP}`;

async function seed(slug: string, now: string) {
	const res = await fetch(`${E2E_PB_BASE}/api/dev/seed-visual-trip`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ slug, now })
	});
	if (!res.ok) throw new Error(`seed-visual-trip failed (${res.status}): ${await res.text()}`);
}

async function open(page: Page, slug: string) {
	await page.setViewportSize({ width: 375, height: 812 });
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(process.env.E2E_TEST_EMAIL!)}`);
	await page.waitForURL(/\/(trips|claim)/, { timeout: 15000 });
	await page.goto(`${BASE}/trips/${slug}/now`, { waitUntil: 'networkidle' });
}

const section = (page: Page, name: string) =>
	page.getByRole('region', { name }).filter({ visible: true });
const count = (page: Page, title: string) =>
	page.getByText(title, { exact: true }).filter({ visible: true });

test.describe('Now buckets (#431)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.describe('every time shape', () => {
		test.beforeAll(() => seed(BUCKETS, 'buckets'));
		test.beforeEach(({ page }) => open(page, BUCKETS));

		test('a started start-only item is a Hero reading NOW · since, not vanished', async ({ page }) => {
			const hero = page.locator('[data-hero]').filter({ visible: true });
			await expect(hero).toHaveCount(1);
			await expect(hero).toContainText('Lunch at Fika');
			await expect(hero.getByTestId('hero-status')).toHaveText(/^NOW · since \d{1,2}:\d{2}[ap]$/);
		});

		test('Earlier today holds the ended start-only item and the passed deadline', async ({ page }) => {
			const earlier = section(page, 'Earlier today');
			await expect(earlier).toContainText('Bike rental');
			await expect(earlier).toContainText('Return rental clubs');
			// The passed deadline's time is never blank (#392 display half). On the rail it
			// sits on the card's bottom edge as a bare time; `by` is the text-only form.
			await expect(earlier).toContainText(/\d{1,2}:\d{2}[ap]\s+Return rental clubs/);
			await expect(earlier).not.toContainText('Lunch at Fika');
		});

		test('Coming up holds the future deadline, a timed item and the untimed one', async ({ page }) => {
			const coming = section(page, 'Coming up');
			await expect(coming).toContainText('Return kayaks');
			await expect(coming).toContainText('Sunset cruise');
			await expect(coming).toContainText('Stargazing');
			await expect(coming).not.toContainText('Return rental clubs');
			await expect(coming).not.toContainText('Lunch at Fika');
		});

		test('every title shows exactly once on the page', async ({ page }) => {
			for (const title of [
				'Bike rental',
				'Return rental clubs',
				'Return kayaks',
				'Sunset cruise',
				'Stargazing'
			]) {
				await expect(count(page, title), title).toHaveCount(1);
			}
			await expect(page.locator('[data-hero]').filter({ visible: true }).getByText('Lunch at Fika', { exact: true })).toHaveCount(1);
		});
	});

	test.describe('countdown to a deadline', () => {
		test.beforeAll(() => seed(DEADLINE, 'deadline'));
		test.beforeEach(({ page }) => open(page, DEADLINE));

		test('free-time card: FREE TIME / countdown / until {deadline title}, centred, no second line', async ({ page }) => {
			const card = page.getByTestId('free-time').filter({ visible: true });
			await expect(card).toBeVisible();
			await expect(card).toContainText('Free time');
			await expect(card.getByTestId('free-time-countdown')).toHaveText(/^2[345]m$/);
			await expect(card.getByTestId('free-time-until')).toHaveText('until Return rental clubs');
			await expect(card).not.toContainText('next activity');
			await expect(card.locator('p')).toHaveCount(3);
			// Centred: the card's text lines share its horizontal centre.
			const box = (await card.boundingBox())!;
			const cx = box.x + box.width / 2;
			for (const id of ['free-time-countdown', 'free-time-until']) {
				const b = (await card.getByTestId(id).boundingBox())!;
				expect(Math.abs(b.x + b.width / 2 - cx)).toBeLessThan(2);
			}
		});

		test('the deadline sits in Coming up (not Earlier today), shown once', async ({ page }) => {
			await expect(section(page, 'Coming up')).toContainText('Return rental clubs');
			await expect(section(page, 'Earlier today')).toHaveCount(0);
		});
	});
});
