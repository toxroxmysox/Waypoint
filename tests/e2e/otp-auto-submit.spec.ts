import { test, expect, type Page } from '@playwright/test';
import { E2E_BASE } from './e2e-env';

// #374 / #381 — the OTP code field (login, invite, join share one action,
// `otpAutoSubmit`). The 6th digit submits the form exactly once, non-digits
// are stripped, and after a failed verify a corrected code auto-submits again.
// No real code is needed: a wrong one returns the in-form error, which is the
// point where the latch must release.
//
// Emails are never-registered addresses, so PB issues an otpId without sending
// mail. (`join/[token]` runs the identical action; it has no stable fixture.)

const BASE = E2E_BASE;
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';

function countVerifies(page: Page) {
	const posts: string[] = [];
	page.on('request', (r) => {
		if (r.method() === 'POST' && r.url().includes('verifyOTP')) posts.push(r.url());
	});
	return posts;
}

async function exerciseCodeField(page: Page, posts: string[]) {
	const code = page.locator('input[name="code"]:visible');
	await expect(code).toBeVisible();

	// Non-digits stripped; five digits don't submit.
	await code.pressSequentially('12a345');
	await expect(code).toHaveValue('12345');
	expect(posts).toHaveLength(0);

	// The 6th digit submits, once.
	await code.pressSequentially('6');
	await expect(
		page
			.getByText(/invalid or expired code/i)
			.filter({ visible: true })
			.first()
	).toBeVisible();
	expect(posts).toHaveLength(1);

	// A corrected code (same length, different last digit) submits again.
	await code.press('Backspace');
	await code.pressSequentially('7');
	await expect.poll(() => posts.length).toBe(2);
}

test.describe('OTP code field auto-submit (#374 / #381)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test('login', async ({ page }) => {
		const posts = countVerifies(page);
		await page.goto(`${BASE}/login`);
		await page.fill('input[name="email"]', `otp-probe-${Date.now().toString(36)}@e2e.test`);
		await page.getByRole('button', { name: 'Send code' }).click();
		await exerciseCodeField(page, posts);
	});

	test('invite', async ({ page }) => {
		const res = await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				slug: 'e2e-rules-test-otp',
				emails: {
					owner: 'rules-owner@e2e.test',
					co_owner: 'rules-coowner@e2e.test',
					traveler: 'rules-traveler@e2e.test',
					viewer: 'rules-viewer@e2e.test',
					non_member: 'rules-nonmember@e2e.test'
				}
			})
		});
		const { pendingInviteCode } = (await res.json()) as { pendingInviteCode: string };

		const posts = countVerifies(page);
		await page.goto(`${BASE}/invite/${pendingInviteCode}`);
		await page.getByRole('button', { name: 'Send 6-digit code' }).click();
		await exerciseCodeField(page, posts);
	});
});
