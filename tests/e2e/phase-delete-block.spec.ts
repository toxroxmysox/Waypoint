import { test, expect } from '@playwright/test';

// #196 — phase-delete block-until-moved (hook behaviour).
// A phase that still holds unplanned ("idea") items must NOT be deletable:
// items.phase has no cascadeDelete, so a raw delete would clear item.phase and
// strand the ideas in a phase-less limbo that renders on no surface. The
// phases.pb.js onRecordDeleteRequest hook throws a BadRequestError ("Move N
// ideas first") before e.next() to abort the delete.
//
// Verified purely at the PB API level (no browser): create an unplanned item in
// a fresh phase, attempt the delete (expect 400 + actionable message), then
// remove the item and confirm the delete now succeeds.
//
// Requires: PB on :8090 with WAYPOINT_DEV_MODE=true + E2E_TEST_EMAIL set.

const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';

const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

const FIXTURE_SLUG = 'e2e-phase-delete-block';

async function authToken(email: string): Promise<string> {
	const res = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	const { token } = (await res.json()) as { token: string };
	return token;
}

test.describe('#196 phase delete block-until-moved', () => {
	test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run E2E tests');

	let token = '';
	let tripId = '';
	let phaseId = '';

	test.beforeAll(async () => {
		token = await authToken(EMAILS.owner);

		// Fresh fixture trip (also seeds a phase covering the whole trip).
		const fxRes = await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
			body: JSON.stringify({ emails: EMAILS, slug: FIXTURE_SLUG })
		});
		const fx = (await fxRes.json()) as { tripId: string; phaseId: string };
		tripId = fx.tripId;
		phaseId = fx.phaseId;
	});

	test('a phase holding an unplanned idea cannot be deleted', async () => {
		const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

		// Create an unplanned (no-day) item parked in the seeded phase.
		const createRes = await fetch(`${PB_BASE}/api/collections/items/records`, {
			method: 'POST',
			headers: auth,
			body: JSON.stringify({
				trip: tripId,
				phase: phaseId,
				day: '',
				type: 'activity',
				title: 'Stranded idea',
				status: 'unplanned',
				sort_order: 0
			})
		});
		expect(createRes.status).toBe(200);
		const item = (await createRes.json()) as { id: string };

		// Attempt to delete the phase — the hook must block it.
		const blockedRes = await fetch(`${PB_BASE}/api/collections/phases/records/${phaseId}`, {
			method: 'DELETE',
			headers: auth
		});
		expect(blockedRes.status).toBe(400);
		const blockedBody = (await blockedRes.json()) as { message?: string };
		expect(blockedBody.message ?? '').toMatch(/move .*idea/i);

		// The phase must still exist.
		const stillThere = await fetch(`${PB_BASE}/api/collections/phases/records/${phaseId}`, {
			headers: auth
		});
		expect(stillThere.status).toBe(200);

		// Remove the idea, then the delete should go through.
		const delItem = await fetch(`${PB_BASE}/api/collections/items/records/${item.id}`, {
			method: 'DELETE',
			headers: auth
		});
		expect(delItem.status).toBe(204);

		const unblockedRes = await fetch(`${PB_BASE}/api/collections/phases/records/${phaseId}`, {
			method: 'DELETE',
			headers: auth
		});
		expect(unblockedRes.status).toBe(204);
	});
});
