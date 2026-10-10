import { test, expect, type Browser } from '@playwright/test';
import { E2E_BASE } from './e2e-env';

// #251 / PRD #202 — Contribution Slice 4: Inbox tabbed Pending/Approved/Rejected.
//
// Binding acceptance:
//   - The Inbox is split into Pending / Approved / Rejected tabs.
//   - Each tab lists its suggestions with vote tallies.
//   - The Inbox stays owner/co_owner-only (travelers 403, unchanged).
//
// The rules-fixture seeds three pending suggestions, one carrying a vote
// (suggestionAuthored, voted 'like' by the traveler) — enough to assert a tally on
// the Pending tab. Dual-tree scar: scope to the visible subtree.

const BASE = E2E_BASE;
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';

const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

const FIXTURE_SLUG = 'e2e-rules-test-inbox';

async function token(email: string): Promise<string> {
	const res = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	const { token } = (await res.json()) as { token: string };
	return token;
}

async function setupFixture(): Promise<void> {
	const t = await token(EMAILS.owner);
	await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
		body: JSON.stringify({ emails: EMAILS, slug: FIXTURE_SLUG })
	});
}

async function devLogin(browser: Browser, email: string) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { ctx, page };
}

test.describe('#251 Inbox tabs + vote tallies', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeAll(async () => {
		await setupFixture();
	});

	test('owner sees Pending/Approved/Rejected tabs; pending suggestion shows its vote pills', async ({
		browser
	}) => {
		const owner = await devLogin(browser, EMAILS.owner);
		try {
			await owner.page.goto(`${BASE}/trips/${FIXTURE_SLUG}/inbox`);

			// All three tabs present (scope to the visible subtree).
			for (const label of ['Pending', 'Approved', 'Rejected']) {
				await expect(
					owner.page.getByRole('tab', { name: new RegExp(label, 'i') }).filter({ visible: true }).first()
				).toBeVisible({ timeout: 10000 });
			}

			// Pending is the default tab and lists the seeded suggestions. The
			// owner-authored "Owner ghost (voted)" carries one vote → a tally renders
			// on its card.
			const votedCard = owner.page
				.getByText(/owner ghost \(voted\)/i)
				.filter({ visible: true })
				.first();
			await expect(votedCard).toBeVisible({ timeout: 10000 });

			// The Pending tab count is ≥ 3 (three seeded pending suggestions).
			await expect(
				owner.page.getByRole('tab', { name: /pending/i }).filter({ visible: true }).first()
			).toContainText(/\(([3-9]|\d{2,})\)/);

			// #444 — the Pending tab shows tap-to-vote pills, not a tally line: the voted
			// ghost's Like pill counts the traveler's one vote.
			await expect(
				owner.page
					.locator('[aria-label="Pending idea: Owner ghost (voted)"]')
					.filter({ visible: true })
					.locator('[data-vote="like"]')
			).toHaveAttribute('aria-label', /^Like, 1/);

			// Switching tabs renders the other panels without error.
			await owner.page.getByRole('tab', { name: /approved/i }).filter({ visible: true }).first().click();
			await owner.page.getByRole('tab', { name: /rejected/i }).filter({ visible: true }).first().click();
			// Back to Pending — the voted card is visible again.
			await owner.page.getByRole('tab', { name: /pending/i }).filter({ visible: true }).first().click();
			await expect(votedCard).toBeVisible();
		} finally {
			await owner.ctx.close();
		}
	});

	// #444 — the pending idea card: dashed, gold Pending chip, vote pills, a tray of
	// Approve / Edit / Reject, and NO role badge ("Suggested by" already says who).
	test('Pending tab shows the pending idea card: chip, vote pills, Approve / Edit / Reject, no role badge', async ({
		browser
	}) => {
		const owner = await devLogin(browser, EMAILS.owner);
		try {
			await owner.page.goto(`${BASE}/trips/${FIXTURE_SLUG}/inbox`);
			const card = owner.page
				.locator('[aria-label^="Pending idea:"]')
				.filter({ visible: true })
				.first();
			await expect(card).toBeVisible({ timeout: 10000 });

			await expect(card.getByText('Pending', { exact: true })).toBeVisible();
			await expect(card.getByText(/^suggested by /i)).toBeVisible();
			// Four always-on vote pills.
			await expect(card.locator('[data-vote]')).toHaveCount(4);
			// The tray: Approve / Edit / Reject.
			await expect(card.getByRole('button', { name: /^approve$/i })).toBeVisible();
			await expect(card.getByRole('link', { name: /^edit$/i })).toBeVisible();
			await expect(card.getByRole('button', { name: /^reject$/i })).toBeVisible();
			// No role badge.
			await expect(card.getByText(/^(owner|co.?owner|traveler|viewer)$/i)).toHaveCount(0);
		} finally {
			await owner.ctx.close();
		}
	});

	test('a member can vote a pending idea from the Inbox (tap-to-vote pills)', async ({ browser }) => {
		const owner = await devLogin(browser, EMAILS.owner);
		try {
			await owner.page.goto(`${BASE}/trips/${FIXTURE_SLUG}/inbox`);
			// "Neutral ghost" is the viewer's, with zero seeded votes: the owner may vote it.
			const votable = owner.page
				.locator('[aria-label="Pending idea: Neutral ghost"]')
				.filter({ visible: true })
				.first();
			await expect(votable).toBeVisible({ timeout: 10000 });
			const like = votable.locator('button[data-vote="like"]');
			await like.click();
			await expect(like).toHaveAttribute('aria-pressed', 'true', { timeout: 10000 });
		} finally {
			await owner.ctx.close();
		}
	});

	test('Inbox stays owner/co_owner-only: traveler gets 403', async ({ browser }) => {
		const traveler = await devLogin(browser, EMAILS.traveler);
		try {
			const res = await traveler.page.goto(`${BASE}/trips/${FIXTURE_SLUG}/inbox`);
			// SvelteKit error(403) renders the branded error boundary with a 403 status.
			expect(res?.status()).toBe(403);
		} finally {
			await traveler.ctx.close();
		}
	});
});
