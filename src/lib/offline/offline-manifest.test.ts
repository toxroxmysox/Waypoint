import { describe, it, expect } from 'vitest';
import {
	buildOfflineManifest,
	dataPayloadUrl,
	documentFileUrl,
	type ManifestInput
} from './offline-manifest';

// A representative active trip: multiple days, items spread across them, several
// documents. The manifest is the testable core of the whole-trip prefetch — these
// assert the EXTERNAL contract (trip data in → exact URL set out), not internals.

const SLUG = 'paris-2026';

function representativeTrip(): ManifestInput {
	return {
		trip: { slug: SLUG },
		days: [{ id: 'day1' }, { id: 'day2' }, { id: 'day3' }],
		items: [{ id: 'itemA' }, { id: 'itemB' }, { id: 'itemC' }, { id: 'itemD' }],
		documents: [{ id: 'docBoardingPass' }, { id: 'docHotel' }, { id: 'docRail' }]
	};
}

describe('dataPayloadUrl', () => {
	it('appends /__data.json to a route path (matches SvelteKit add_data_suffix)', () => {
		expect(dataPayloadUrl('/trips/paris/days/day1')).toBe('/trips/paris/days/day1/__data.json');
	});

	it('strips a trailing slash before appending', () => {
		expect(dataPayloadUrl('/trips/paris/')).toBe('/trips/paris/__data.json');
	});

	it('handles the bare overview route', () => {
		expect(dataPayloadUrl('/trips/paris')).toBe('/trips/paris/__data.json');
	});
});

describe('documentFileUrl', () => {
	it('builds the /file byte endpoint, matching file_href + cache-policy', () => {
		expect(documentFileUrl('paris', 'doc9')).toBe('/trips/paris/documents/doc9/file');
	});
});

describe('buildOfflineManifest — representative active trip', () => {
	const urls = buildOfflineManifest(representativeTrip());

	it('includes the overview route + its data payload', () => {
		expect(urls).toContain(`/trips/${SLUG}`);
		expect(urls).toContain(`/trips/${SLUG}/__data.json`);
	});

	it('includes the Trip-Mode Now home + its data payload', () => {
		expect(urls).toContain(`/trips/${SLUG}/now`);
		expect(urls).toContain(`/trips/${SLUG}/now/__data.json`);
	});

	it('includes the Documents list route + its data payload', () => {
		expect(urls).toContain(`/trips/${SLUG}/documents`);
		expect(urls).toContain(`/trips/${SLUG}/documents/__data.json`);
	});

	it('includes EVERY day route + its data payload', () => {
		for (const id of ['day1', 'day2', 'day3']) {
			expect(urls).toContain(`/trips/${SLUG}/days/${id}`);
			expect(urls).toContain(`/trips/${SLUG}/days/${id}/__data.json`);
		}
	});

	it('includes EVERY item-detail route + its data payload', () => {
		for (const id of ['itemA', 'itemB', 'itemC', 'itemD']) {
			expect(urls).toContain(`/trips/${SLUG}/items/${id}`);
			expect(urls).toContain(`/trips/${SLUG}/items/${id}/__data.json`);
		}
	});

	it('includes EVERY document byte URL', () => {
		for (const id of ['docBoardingPass', 'docHotel', 'docRail']) {
			expect(urls).toContain(`/trips/${SLUG}/documents/${id}/file`);
		}
	});

	it('produces the exact complete set — nothing more, nothing less', () => {
		// 3 anchor routes + 3 days + 4 items = 10 routes; ×2 (route + payload) = 20;
		// + 3 document byte URLs = 23 total.
		const expected = [
			// routes
			`/trips/${SLUG}`,
			`/trips/${SLUG}/now`,
			`/trips/${SLUG}/documents`,
			`/trips/${SLUG}/days/day1`,
			`/trips/${SLUG}/days/day2`,
			`/trips/${SLUG}/days/day3`,
			`/trips/${SLUG}/items/itemA`,
			`/trips/${SLUG}/items/itemB`,
			`/trips/${SLUG}/items/itemC`,
			`/trips/${SLUG}/items/itemD`,
			// payloads
			`/trips/${SLUG}/__data.json`,
			`/trips/${SLUG}/now/__data.json`,
			`/trips/${SLUG}/documents/__data.json`,
			`/trips/${SLUG}/days/day1/__data.json`,
			`/trips/${SLUG}/days/day2/__data.json`,
			`/trips/${SLUG}/days/day3/__data.json`,
			`/trips/${SLUG}/items/itemA/__data.json`,
			`/trips/${SLUG}/items/itemB/__data.json`,
			`/trips/${SLUG}/items/itemC/__data.json`,
			`/trips/${SLUG}/items/itemD/__data.json`,
			// document bytes
			`/trips/${SLUG}/documents/docBoardingPass/file`,
			`/trips/${SLUG}/documents/docHotel/file`,
			`/trips/${SLUG}/documents/docRail/file`
		];
		expect(urls).toEqual(expected);
		expect(urls).toHaveLength(23);
	});

	it('contains NO duplicates', () => {
		expect(new Set(urls).size).toBe(urls.length);
	});

	it('orders routes before data payloads before document bytes', () => {
		const firstPayload = urls.findIndex((u) => u.endsWith('/__data.json'));
		const firstByte = urls.findIndex((u) => u.endsWith('/file'));
		const lastRoute = urls.reduce(
			(acc, u, i) => (!u.endsWith('/__data.json') && !u.endsWith('/file') ? i : acc),
			-1
		);
		expect(lastRoute).toBeLessThan(firstPayload);
		expect(firstPayload).toBeLessThan(firstByte);
	});
});

describe('buildOfflineManifest — inactive / empty trip (minimal set)', () => {
	it('with no days/items/documents → only the anchor routes + their payloads, no bytes', () => {
		const urls = buildOfflineManifest({ trip: { slug: SLUG } });
		expect(urls).toEqual([
			`/trips/${SLUG}`,
			`/trips/${SLUG}/now`,
			`/trips/${SLUG}/documents`,
			`/trips/${SLUG}/__data.json`,
			`/trips/${SLUG}/now/__data.json`,
			`/trips/${SLUG}/documents/__data.json`
		]);
		expect(urls.some((u) => u.endsWith('/file'))).toBe(false);
		expect(urls).toHaveLength(6);
	});

	it('treats explicit empty arrays the same as omitted', () => {
		const omitted = buildOfflineManifest({ trip: { slug: SLUG } });
		const empty = buildOfflineManifest({ trip: { slug: SLUG }, days: [], items: [], documents: [] });
		expect(empty).toEqual(omitted);
	});

	it('a trip with documents but no days/items still lists every byte URL', () => {
		const urls = buildOfflineManifest({
			trip: { slug: SLUG },
			documents: [{ id: 'd1' }, { id: 'd2' }]
		});
		expect(urls).toContain(`/trips/${SLUG}/documents/d1/file`);
		expect(urls).toContain(`/trips/${SLUG}/documents/d2/file`);
		// No day/item routes leaked in.
		expect(urls.some((u) => u.includes('/days/'))).toBe(false);
		expect(urls.some((u) => u.includes('/items/'))).toBe(false);
	});
});

describe('buildOfflineManifest — de-duplication', () => {
	it('drops duplicate day/item/document ids in the inputs', () => {
		const urls = buildOfflineManifest({
			trip: { slug: SLUG },
			days: [{ id: 'day1' }, { id: 'day1' }],
			items: [{ id: 'itemA' }, { id: 'itemA' }, { id: 'itemA' }],
			documents: [{ id: 'docX' }, { id: 'docX' }]
		});
		expect(new Set(urls).size).toBe(urls.length);
		expect(urls.filter((u) => u === `/trips/${SLUG}/days/day1`)).toHaveLength(1);
		expect(urls.filter((u) => u === `/trips/${SLUG}/items/itemA`)).toHaveLength(1);
		expect(urls.filter((u) => u === `/trips/${SLUG}/documents/docX/file`)).toHaveLength(1);
	});
});

describe('buildOfflineManifest — slug fidelity', () => {
	it('threads the exact slug into every URL', () => {
		const urls = buildOfflineManifest({
			trip: { slug: 'a-weird_slug.99' },
			days: [{ id: 'd' }],
			documents: [{ id: 'doc' }]
		});
		// Every URL is under the trip namespace: the bare overview `/trips/<slug>`
		// plus everything below `/trips/<slug>/...`.
		expect(
			urls.every((u) => u === '/trips/a-weird_slug.99' || u.startsWith('/trips/a-weird_slug.99/'))
		).toBe(true);
	});
});
