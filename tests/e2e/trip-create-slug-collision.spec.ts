import { test, expect, type Browser } from '@playwright/test';
import { E2E_BASE } from './e2e-env';

// #395 — two people creating a trip with the same name.
//
// The bug: the slug is unique across ALL trips, but the old collision probe ran
// as the caller and couldn't see the other person's trip. The second create
// picked the taken slug, PB rejected it, and the action rethrew that as a 500
// page — every retry with the same name recomputed the same slug.
//
// The fix: the trips create hook dedupes the slug with app privileges, and the
// form warns first when the name matches the caller's own current trip or a
// co-traveler's (usually it is the same trip). Strangers' trips are never
// mentioned — that, and ended/archived/tombstone handling, is covered by the
// fresh-PB harness `backend/test-tripnames.mjs`.
//
// owner + traveler share the fixture trip, so they are co-travelers, and the
// traveler can NOT see the owner's new trip — exactly the case that used to 500.
// (Not `rules-nonmember`: first-run-trip-less + onboarding-organic need that
// user to own zero trips.)

const BASE = E2E_BASE;
const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';

const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

async function setupFixture() {
	const res = await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ emails: EMAILS, slug: 'e2e-rules-test-dupname' })
	});
	expect(res.ok).toBe(true);
}

async function devLogin(browser: Browser, email: string) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { ctx, page };
}

test.describe('Trip create: same name across users (#395)', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test.beforeAll(setupFixture);

	test('co-traveler is warned, can create anyway; owner is pointed at their own trip', async ({
		browser
	}) => {
		const title = `E2E Dup ${Date.now().toString(36)}`;
		const slug = title.toLowerCase().replace(/\s+/g, '-');
		const heading = (page: import('@playwright/test').Page) =>
			page.getByRole('heading', { name: title }).filter({ visible: true }).first();

		// 1. Owner creates it — no heads-up, plain slug.
		const owner = await devLogin(browser, EMAILS.owner);
		await owner.page.goto(`${BASE}/trips/new`);
		await owner.page.fill('input[name="title"]', title);
		await owner.page.getByRole('button', { name: 'Create trip' }).click();
		await owner.page.waitForURL(`${BASE}/trips/${slug}`, { timeout: 15000 });

		// 2. Traveler (co-traveler, can't see that trip) types the same name with
		//    punctuation. Before #395 this was a 500 page; now a heads-up naming
		//    the owner, then "Create anyway" lands on a suffixed slug.
		const traveler = await devLogin(browser, EMAILS.traveler);
		await traveler.page.goto(`${BASE}/trips/new`);
		await traveler.page.fill('input[name="title"]', `${title}!`);
		await traveler.page.getByRole('button', { name: 'Create trip' }).click();
		const warn = traveler.page.getByTestId('duplicate-trip');
		await expect(warn).toBeVisible();
		// The owner's NAME (whatever an earlier fixture set it to), never an address.
		await expect(warn).toContainText(new RegExp(`\\S already has a trip called “${title}”`));
		await expect(warn).not.toContainText('@');
		await expect(traveler.page.getByText('Something went wrong')).toHaveCount(0);
		// No way into someone else's trip from here — only a request to its owner.
		await expect(warn.getByRole('link', { name: 'Open it' })).toHaveCount(0);
		await warn.getByRole('button', { name: 'Request an invite' }).click();
		await expect(traveler.page.getByTestId('invite-requested')).toContainText('Request sent');
		await expect(warn.getByRole('button', { name: 'Request an invite' })).toHaveCount(0);
		await expect(traveler.page.locator('input[name="title"]')).toHaveValue(`${title}!`);
		// Not the same trip after all → create their own.
		await warn.getByRole('button', { name: 'Create anyway' }).click();
		await traveler.page.waitForURL(`${BASE}/trips/${slug}-1`, { timeout: 15000 });
		await expect(heading(traveler.page)).toBeVisible();
		await traveler.ctx.close();

		// 3. Owner tries the same name again — told it's theirs, with a way in.
		//    Editing the name away from the clash dismisses the heads-up.
		await owner.page.goto(`${BASE}/trips/new`);
		await owner.page.fill('input[name="title"]', title);
		await owner.page.getByRole('button', { name: 'Create trip' }).click();
		const mine = owner.page.getByTestId('duplicate-trip');
		await expect(mine).toContainText(`You already have a trip called “${title}”`);
		await owner.page.fill('input[name="title"]', `${title} again`);
		await expect(mine).toHaveCount(0);
		await owner.page.fill('input[name="title"]', title);
		await mine.getByRole('link', { name: 'Open it' }).click();
		await owner.page.waitForURL(`${BASE}/trips/${slug}`, { timeout: 15000 });
		await owner.ctx.close();
	});
});
