import { test, expect, type APIRequestContext } from '@playwright/test';
import { E2E_BASE, E2E_PB_BASE } from './e2e-env';

// #402 — POST /api/items/{id}/assign-self with a target state.
//
// Re-sending the state you already have (a double tap on "Are you going?", #440)
// must be a 200 no-op. PocketBase refuses a traveler's write that changes nothing
// (the self-assign hook needs exactly one changed id), so the endpoint has to
// short-circuit before writing — this used to surface as a 500.
// A JSON body that isn't an object is a 400, not the legacy toggle.

const BASE = E2E_BASE;
const PB_BASE = E2E_PB_BASE;

const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};
const FIXTURE_SLUG = 'e2e-assign-self-states';

async function pbToken(email: string): Promise<string> {
	const res = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	return ((await res.json()) as { token: string }).token;
}

test.describe('#402 assign-self target states', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	test('the same state twice is a 200 no-op; a non-object body is a 400', async ({
		playwright
	}) => {
		const ownerToken = await pbToken(EMAILS.owner);
		const res = await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
			body: JSON.stringify({ emails: EMAILS, slug: FIXTURE_SLUG })
		});
		expect(res.ok, `rules-fixture: ${res.status}`).toBe(true);
		const ids = (await res.json()) as { itemId: string; memberIds: { traveler: string } };

		const api: APIRequestContext = await playwright.request.newContext({ baseURL: BASE });
		try {
			const login = await api.get(`/api/dev/login?email=${encodeURIComponent(EMAILS.traveler)}`);
			expect(login.ok(), `dev login: ${login.status()}`).toBe(true);

			const post = (data: unknown) =>
				api.post(`/api/items/${ids.itemId}/assign-self`, {
					headers: { 'Content-Type': 'application/json' },
					data: typeof data === 'string' ? data : JSON.stringify(data)
				});

			for (const state of ['going', 'not_going', 'no_answer'] as const) {
				for (const attempt of [1, 2]) {
					const r = await post({ state });
					expect(r.status(), `${state} #${attempt}: ${await r.text()}`).toBe(200);
					const body = (await r.json()) as { state: string };
					expect(body.state).toBe(state);
				}
			}

			for (const bad of ['"going"', '[]', '5']) {
				const r = await post(bad);
				expect(r.status(), `body ${bad}`).toBe(400);
			}
		} finally {
			await api.dispose();
		}
	});
});
