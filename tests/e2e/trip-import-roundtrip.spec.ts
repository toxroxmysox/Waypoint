import { test, expect, type Page } from '@playwright/test';
import { E2E_BASE } from './e2e-env';

// #410 — Export → Import round-trip. The import action predated the trips.pb.js
// create hook's seeding (owner member, "Phase 1", every day): it 403'd on its own
// owner-member create and stranded an empty trip per attempt. This proves a real
// export of a multi-phase trip imports with the same structure, and that a failed
// import leaves nothing behind.
//
// Seeds via PB (seed-visual-trip + REST), never by driving the UI (CLAUDE.md).

const BASE = E2E_BASE;
const PB = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';
const OWNER_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const SRC_SLUG = 'e2e-import-src';

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

async function importFile(page: Page, json: unknown): Promise<void> {
	await page.goto(`${BASE}/trips/import`);
	await page.locator('input[type="file"]').setInputFiles({
		name: 'trip.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(json))
	});
	await page.getByRole('button', { name: 'Import Trip' }).click();
}

test.describe('Trip import round-trip (#410)', () => {
	test.skip(
		process.env.WAYPOINT_DEV_MODE !== 'true' || !OWNER_EMAIL,
		'Needs WAYPOINT_DEV_MODE=true + E2E_TEST_EMAIL'
	);

	let token = '';

	test.beforeAll(async () => {
		const auth = await fetch(`${PB}/api/dev/auth-bypass`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: OWNER_EMAIL })
		});
		token = ((await auth.json()) as { token: string }).token;
	});

	test('a multi-phase export imports with the same structure', async ({ page }) => {
		const seeded = await fetch(`${PB}/api/dev/seed-visual-trip`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ slug: SRC_SLUG })
		});
		expect(seeded.ok).toBe(true);
		const { tripId } = (await seeded.json()) as { tripId: string };

		// Split the seeded single phase into two tiles: "Phase 1" → day 4, then
		// "Second leg" day 4 → trip end (the shared boundary day).
		const trip = (await pb('GET', `/api/collections/trips/records/${tripId}`, token)).data;
		const start = new Date(day(trip.start_date) + 'T00:00:00Z');
		start.setUTCDate(start.getUTCDate() + 3);
		const boundary = start.toISOString().slice(0, 10);
		const [phase1] = await list('phases', `trip = "${tripId}"`, token, 'order');
		expect(
			(
				await pb('PATCH', `/api/collections/phases/records/${phase1.id}`, token, {
					end_date: boundary + ' 00:00:00.000Z'
				})
			).status
		).toBe(200);
		expect(
			(
				await pb('POST', '/api/collections/phases/records', token, {
					trip: tripId,
					name: 'Second leg',
					location: 'Elsewhere',
					start_date: boundary + ' 00:00:00.000Z',
					end_date: day(trip.end_date) + ' 00:00:00.000Z',
					order: 1
				})
			).status
		).toBe(200);

		// One confirmation code on a dated item (ADR-0016: codes are documents).
		const srcItems = await list('items', `trip = "${tripId}"`, token);
		const dated = srcItems.find((i) => i.day);
		expect(dated).toBeTruthy();
		expect(
			(
				await pb('POST', '/api/collections/documents/records', token, {
					kind: 'code',
					trip: tripId,
					item: dated!.id,
					code_label: 'Booking ref',
					code_value: 'RT-410'
				})
			).status
		).toBe(200);

		// Export through the app (session cookie), then import that exact file.
		await page.goto(`${BASE}/api/dev/login`);
		const exported = await page.request.get(`${BASE}/trips/${SRC_SLUG}/export`);
		expect(exported.ok()).toBe(true);
		const json = (await exported.json()) as {
			trip: { title: string };
			phases: unknown[];
			items: unknown[];
			days: Array<{ date: string; notes: string }>;
		};
		expect(json.phases).toHaveLength(2);

		await importFile(page, json);
		await page.waitForURL((u) => /\/trips\/[^/]+-imported-[a-z0-9]+$/.test(u.pathname), {
			timeout: 20000
		});
		const newSlug = new URL(page.url()).pathname.split('/').pop()!;

		try {
			const [imported] = await list('trips', `slug = "${newSlug}"`, token);
			expect(imported).toBeTruthy();
			const newId = imported.id;

			// Exactly one owner membership (the hook's), not a duplicate.
			const members = await list('trip_members', `trip = "${newId}"`, token);
			expect(members.filter((m) => m.role === 'owner')).toHaveLength(1);

			// Phases: same names, tiled — first starts at the trip start, the
			// boundary is shared, the last ends at the trip end. No stray "Phase 1".
			const phases = await list('phases', `trip = "${newId}"`, token, 'order');
			expect(phases.map((p) => p.name)).toEqual(['Phase 1', 'Second leg']);
			expect(day(phases[0].start_date)).toBe(day(imported.start_date));
			expect(day(phases[0].end_date)).toBe(boundary);
			expect(day(phases[1].start_date)).toBe(boundary);
			expect(day(phases[1].end_date)).toBe(day(imported.end_date));

			// Days: one per date (seeded, not duplicated), notes carried over.
			const days = await list('days', `trip = "${newId}"`, token, 'date');
			const srcDays = await list('days', `trip = "${tripId}"`, token, 'date');
			expect(days).toHaveLength(srcDays.length);
			expect(days.map((d) => d.notes)).toEqual(srcDays.map((d) => d.notes));
			// The boundary day sits in both phases (a travel day).
			const boundaryDay = days.find((d) => day(d.date) === boundary)!;
			expect((boundaryDay.phases as string[]).length).toBe(2);

			// Items: same count + titles; every item has a phase; codes re-created.
			const items = await list('items', `trip = "${newId}"`, token);
			expect(items).toHaveLength(srcItems.length);
			expect(items.map((i) => i.title).sort()).toEqual(srcItems.map((i) => i.title).sort());
			expect(items.every((i) => i.phase)).toBe(true);
			// #450: compare each item's day + phase with its source, not just "has a phase".
			// Tuples [title, day date, phase name], sorted (titles may repeat).
			const srcPhaseName = new Map(
				(await list('phases', `trip = "${tripId}"`, token)).map((p) => [p.id, String(p.name)])
			);
			const srcDayDate = new Map(srcDays.map((d) => [d.id, day(d.date)]));
			const newPhaseName = new Map(phases.map((p) => [p.id, String(p.name)]));
			const newDayDate = new Map(days.map((d) => [d.id, day(d.date)]));
			const tuple = (
				i: Rec,
				phaseName: Map<string, string>,
				dayDate: Map<string, string>
			): string =>
				JSON.stringify([
					i.title,
					i.day ? dayDate.get(String(i.day)) : '',
					phaseName.get(String(i.phase)),
					i.status
				]);
			expect(items.map((i) => tuple(i, newPhaseName, newDayDate)).sort()).toEqual(
				srcItems.map((i) => tuple(i, srcPhaseName, srcDayDate)).sort()
			);
			const codes = await list('documents', `trip = "${newId}" && kind = "code"`, token);
			expect(codes.map((c) => c.code_value)).toEqual(['RT-410']);
		} finally {
			const [imported] = await list('trips', `slug = "${newSlug}"`, token);
			if (imported) await pb('DELETE', `/api/collections/trips/records/${imported.id}`, token);
		}
	});

	test('a failed import leaves no trip behind', async ({ page }) => {
		const title = `E2E broken import ${Date.now()}`;
		const bad = {
			_waypoint_version: 1,
			exported_at: new Date().toISOString(),
			trip: { title, start_date: '2027-03-01', end_date: '2027-03-03', timezone: 'UTC' },
			phases: [
				{
					name: 'Only',
					location: '',
					country_code: '',
					start_date: '2027-03-01',
					end_date: '2027-03-03',
					order: 0
				}
			],
			days: [],
			// Not a valid item type → PB rejects the item create mid-import.
			items: [{ day_date: '2027-03-01', phase_name: 'Only', type: 'not-a-type', title: 'Bad' }]
		};
		await page.goto(`${BASE}/api/dev/login`);
		await importFile(page, bad);
		await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 15000 });
		expect(await list('trips', `title = "${title}"`, token)).toHaveLength(0);
	});
});
