import { test, expect } from '@playwright/test';
import { E2E_BASE } from './e2e-env';

// #411 — Clone keeps the phase tiling. The clone action used to create every
// source phase on top of the "Phase 1" the trips create hook seeds, leaving two
// phases on the start day; now that PB enforces tiling that create is refused,
// so clone retargets the seeded phase and creates the rest by shifted start.
//
// Seeds via PB (seed-visual-trip + REST), posts the clone form action directly
// (never drives the UI — CLAUDE.md).

const BASE = E2E_BASE;
const PB = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';
const OWNER_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const SRC_SLUG = 'e2e-clone-src';

type Rec = Record<string, unknown> & { id: string };

async function pb<T = Rec>(
	method: string,
	path: string,
	token: string,
	body?: unknown
): Promise<{ status: number; data: T }> {
	const res = await fetch(`${PB}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: token },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const text = await res.text();
	return { status: res.status, data: (text ? JSON.parse(text) : null) as T };
}

async function list(collection: string, filter: string, token: string, sort = ''): Promise<Rec[]> {
	const q = `perPage=500&filter=${encodeURIComponent(filter)}${sort ? `&sort=${sort}` : ''}`;
	const { data } = await pb<{ items: Rec[] }>(
		'GET',
		`/api/collections/${collection}/records?${q}`,
		token
	);
	return data?.items ?? [];
}

const day = (d: unknown) => String(d ?? '').slice(0, 10);
const plus = (d: string, n: number) => {
	const x = new Date(d + 'T00:00:00Z');
	x.setUTCDate(x.getUTCDate() + n);
	return x.toISOString().slice(0, 10);
};

test.describe('Trip clone round-trip (#411)', () => {
	test.skip(
		process.env.WAYPOINT_DEV_MODE !== 'true' || !OWNER_EMAIL,
		'Needs WAYPOINT_DEV_MODE=true + E2E_TEST_EMAIL'
	);

	test('a two-phase trip clones into two tiled phases', async ({ page }) => {
		const auth = await fetch(`${PB}/api/dev/auth-bypass`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: OWNER_EMAIL })
		});
		const token = ((await auth.json()) as { token: string }).token;

		const seeded = await fetch(`${PB}/api/dev/seed-visual-trip`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ slug: SRC_SLUG, stay: true })
		});
		expect(seeded.ok).toBe(true);
		const { tripId } = (await seeded.json()) as { tripId: string };
		const src = (await pb('GET', `/api/collections/trips/records/${tripId}`, token)).data;
		const srcStart = day(src.start_date);
		const srcEnd = day(src.end_date);
		const srcBoundary = plus(srcStart, 3);
		expect(
			(
				await pb('POST', '/api/collections/phases/records', token, {
					trip: tripId,
					name: 'Second leg',
					start_date: srcBoundary + ' 00:00:00.000Z',
					end_date: srcEnd + ' 00:00:00.000Z',
					order: 1
				})
			).status
		).toBe(200);
		const srcPhases = await list('phases', `trip = "${tripId}"`, token, 'start_date');
		// An idea (no day) — the default clone form copies it as a parking-lot idea.
		expect(
			(
				await pb('POST', '/api/collections/items/records', token, {
					trip: tripId,
					phase: srcPhases[1].id,
					type: 'activity',
					title: 'Clone idea (#411)'
				})
			).status
		).toBe(200);
		expect(srcPhases.map((p) => p.name)).toHaveLength(2);

		// Clone 30 days later, same length.
		const start = plus(srcStart, 30);
		const end = plus(srcEnd, 30);
		const title = `Clone of tiling ${Date.now()}`;
		await page.goto(`${BASE}/api/dev/login`);
		const res = await page.request.post(`${BASE}/trips/${SRC_SLUG}/clone`, {
			// The form's defaults: phases + every item type (a repeated field, so a raw body).
			data: new URLSearchParams([
				['title', title],
				['start_date', start],
				['end_date', end],
				['include_phases', 'on'],
				...['lodging', 'transportation', 'flight', 'activity', 'meal', 'note'].map((t) => [
					'include_item_types',
					t
				])
			]).toString(),
			// x-sveltekit-action: the action answers with its JSON result (redirect or failure).
			headers: {
				origin: BASE,
				'x-sveltekit-action': 'true',
				'content-type': 'application/x-www-form-urlencoded'
			}
		});
		const result = await res.text();
		expect(result, 'clone action result').toContain('"type":"redirect"');

		const [clone] = await list('trips', `title = "${title}"`, token);
		expect(clone, 'cloned trip exists').toBeTruthy();
		const phases = await list('phases', `trip = "${clone.id}"`, token, 'start_date');
		expect(phases.map((p) => p.name)).toEqual(srcPhases.map((p) => p.name));
		const items = await list('items', `trip = "${clone.id}"`, token);
		const idea = items.find((i) => i.title === 'Clone idea (#411)');
		expect(idea, 'idea cloned').toBeTruthy();
		expect(idea!.day).toBe('');
		expect(idea!.phase).toBe(phases[1].id);
		const srcStay = (await list('items', `trip = "${tripId}" && end_date != ""`, token))[0];
		const stay = items.find((i) => i.title === srcStay.title);
		expect(day(stay?.end_date), 'spanning stay keeps its shifted span').toBe(
			plus(day(srcStay.end_date), 30)
		);
		expect(phases.map((p) => [day(p.start_date), day(p.end_date), Number(p.order)])).toEqual([
			[start, plus(srcBoundary, 30), 0],
			[plus(srcBoundary, 30), end, 1]
		]);
	});
});
