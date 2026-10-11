import { test, expect, type Browser } from '@playwright/test';
import { E2E_BASE, E2E_PB_BASE } from './e2e-env';

// #404 — a comma in a captured goal stays in the title; it no longer splits
// the input into several goals. #403 — the goal keeps its prompt's kicker.
//
// Driven as the TRAVELER. The fixture also seeds others' goals, so the deck may
// open on reaction cards; the test votes past them to a prompt card.

const BASE = E2E_BASE;
const PB_BASE = E2E_PB_BASE;

const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

const FIXTURE_SLUG = 'e2e-rules-test-goalcomma';

async function setupFixture(): Promise<{ tripId: string }> {
	const auth = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: EMAILS.owner })
	});
	const { token } = (await auth.json()) as { token: string };
	const res = await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ emails: EMAILS, slug: FIXTURE_SLUG })
	});
	return (await res.json()) as { tripId: string };
}

async function devLogin(browser: Browser, email: string) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { ctx, page };
}

test.describe('#404 goal capture keeps commas', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeAll(async () => {
		await setupFixture();
	});

	test('"Kayak, then lunch" is one goal', async ({ browser }) => {
		const traveler = await devLogin(browser, EMAILS.traveler);
		try {
			await traveler.page.goto(`${BASE}/trips/${FIXTURE_SLUG}/goals/capture`, {
				waitUntil: 'networkidle'
			});
			const input = traveler.page
				.getByPlaceholder('Type a goal, press enter…')
				.filter({ visible: true });
			// Vote past any reaction cards (others' goals) to reach a prompt card.
			for (let i = 0; i < 10 && !(await input.isVisible()); i++) {
				await traveler.page
					.getByRole('button', { name: /^Love/ })
					.filter({ visible: true })
					.click();
				await traveler.page.waitForTimeout(400);
			}
			await input.fill('Kayak, then lunch');
			await expect(
				traveler.page.getByRole('button', { name: 'Add 1 & continue' }).filter({ visible: true })
			).toBeVisible();
			await input.press('Enter');

			const chip = traveler.page
				.locator('span.rounded-full', { hasText: 'Kayak, then lunch' })
				.filter({ visible: true });
			await expect(chip).toHaveCount(1);
			await expect(traveler.page.locator('span.rounded-full', { hasText: /^✓Kayak$/ })).toHaveCount(
				0
			);

			// #403 — the goal keeps the prompt it answered: the list shows its kicker.
			await traveler.page.waitForLoadState('networkidle');
			await traveler.page.goto(`${BASE}/trips/${FIXTURE_SLUG}/goals`, { waitUntil: 'networkidle' });
			const row = traveler.page
				.locator('div.relative', { has: traveler.page.getByRole('link', { name: 'Kayak, then lunch' }) })
				.filter({ visible: true });
			await expect(row.locator('[data-goal-kicker]')).not.toHaveText('');
		} finally {
			await traveler.ctx.close();
		}
	});
});
