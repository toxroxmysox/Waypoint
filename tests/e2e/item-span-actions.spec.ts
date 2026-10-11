import { test, expect, type Page } from '@playwright/test';
import { E2E_BASE } from './e2e-env';

// #411 — items.pb.js now refuses an item span (end_date) without a start day, on
// or before it, and an unscheduled item without a phase. Two day-page/closeout
// actions wrote exactly those shapes; this posts them directly against a
// spanning stay that has no phase of its own.
//
// Seeds via PB (seed-visual-trip + REST), posts the form actions directly
// (never drives the UI — CLAUDE.md).

const BASE = E2E_BASE;
const PB = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';
const OWNER_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const SLUG = 'e2e-item-span-actions';

type Rec = Record<string, unknown> & { id: string };

async function pb<T = Rec>(method: string, path: string, token: string, body?: unknown): Promise<{ status: number; data: T }> {
	const res = await fetch(`${PB}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: token },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const text = await res.text();
	return { status: res.status, data: (text ? JSON.parse(text) : null) as T };
}

async function action(page: Page, path: string, fields: Record<string, string>): Promise<string> {
	const res = await page.request.post(`${BASE}${path}`, {
		data: new URLSearchParams(fields).toString(),
		headers: {
			origin: BASE,
			'x-sveltekit-action': 'true',
			'content-type': 'application/x-www-form-urlencoded'
		}
	});
	return res.text();
}

test.describe('Item span actions (#411)', () => {
	test.skip(
		process.env.WAYPOINT_DEV_MODE !== 'true' || !OWNER_EMAIL,
		'Needs WAYPOINT_DEV_MODE=true + E2E_TEST_EMAIL'
	);

	test('push to parking and trim-to-start-day keep the item valid', async ({ page }) => {
		const auth = await fetch(`${PB}/api/dev/auth-bypass`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: OWNER_EMAIL })
		});
		const token = ((await auth.json()) as { token: string }).token;
		const seeded = await fetch(`${PB}/api/dev/seed-visual-trip`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ slug: SLUG })
		});
		expect(seeded.ok).toBe(true);
		const { tripId } = (await seeded.json()) as { tripId: string };
		const days = (
			await pb<{ items: Rec[] }>('GET', `/api/collections/days/records?filter=${encodeURIComponent(`trip="${tripId}"`)}&sort=date`, token)
		).data.items;
		const stay = (body: Record<string, unknown>) =>
			pb('POST', '/api/collections/items/records', token, {
				trip: tripId,
				day: days[1].id,
				type: 'lodging',
				title: 'Span stay (#411)',
				status: 'planned',
				end_date: days[3].date,
				...body
			});

		await page.goto(`${BASE}/api/dev/login`);

		// Push to parking: a phase-less spanning stay leaves its day.
		const parked = await stay({});
		expect(parked.status).toBe(200);
		const pushed = await action(page, `/trips/${SLUG}/days/${days[1].id}?/pushToParking`, { item_id: parked.data.id });
		expect(pushed, 'pushToParking result').toContain('"type":"success"');
		const p = (await pb('GET', `/api/collections/items/records/${parked.data.id}`, token)).data;
		expect([p.day, p.end_date, p.status]).toEqual(['', '', 'unplanned']);
		expect(p.phase, 'parked item keeps a phase').not.toBe('');

		// Closeout trim to the start day: a one-day item, so the span goes.
		const trimmed = await stay({});
		const trim = await action(page, `/trips/${SLUG}/closeout?/trimEnd`, {
			item_id: trimmed.data.id,
			end_date: String(days[1].date).slice(0, 10)
		});
		expect(trim, 'trimEnd result').toContain('"type":"success"');
		const t = (await pb('GET', `/api/collections/items/records/${trimmed.data.id}`, token)).data;
		expect(t.end_date).toBe('');
	});
});
