// Integration-style tests over the real route GET handlers with a STUBBED
// upstream (global fetch). Proves: (a) a repeat details/flights lookup within
// TTL is served from cache without a second upstream call, and (b) a 429 fires
// once the per-user bucket is drained past its cap.
//
// $env/dynamic/private is mocked so the handlers see API keys present.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {
		GOOGLE_MAPS_API_KEY: 'test-google-key',
		AERODATABOX_API_KEY: 'test-aero-key'
	}
}));

import { GET as detailsGET } from '../../routes/api/places/details/+server';
import { GET as flightsGET } from '../../routes/api/flights/lookup/+server';
import { GET as autocompleteGET } from '../../routes/api/places/autocomplete/+server';

type Handler = (args: { url: URL; locals: { user: { id: string } | null } }) => Promise<Response>;

// SvelteKit's `error()` THROWS an HttpError ({ status, body }); it does not
// return a Response. In a real request SvelteKit catches it and renders the
// status. Here we normalize both paths to a { status } shape so tests can
// assert on 429 the same way as on a 200 Response.
async function run(p: Promise<Response>): Promise<{ status: number; json: () => Promise<unknown> }> {
	try {
		const res = await p;
		return { status: res.status, json: () => res.json() };
	} catch (e) {
		const status = (e as { status?: number }).status;
		if (typeof status === 'number') {
			return { status, json: async () => (e as { body?: unknown }).body };
		}
		throw e;
	}
}

const callDetails = (placeId: string, userId: string) =>
	run(
		(detailsGET as unknown as Handler)({
			url: new URL(`http://localhost/api/places/details?place_id=${placeId}`),
			locals: { user: { id: userId } }
		})
	);

const callFlights = (flight: string, date: string, userId: string) =>
	run(
		(flightsGET as unknown as Handler)({
			url: new URL(`http://localhost/api/flights/lookup?flight=${flight}&date=${date}`),
			locals: { user: { id: userId } }
		})
	);

const callAutocomplete = (input: string, userId: string) =>
	run(
		(autocompleteGET as unknown as Handler)({
			url: new URL(`http://localhost/api/places/autocomplete?input=${input}`),
			locals: { user: { id: userId } }
		})
	);

beforeEach(() => {
	vi.restoreAllMocks();
});

describe('places/details route', () => {
	it('serves a repeat lookup from cache without a second upstream call', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(
				new Response(JSON.stringify({ id: 'place-cache-1', name: 'Eiffel Tower' }), {
					status: 200
				})
			);

		// Unique place_id so no prior test populated the cache for it.
		const first = await callDetails('place-cache-1', 'details-user-A');
		expect(first.status).toBe(200);
		expect(fetchSpy).toHaveBeenCalledTimes(1);

		// Repeat lookup for the SAME place_id -> cache hit, no second fetch.
		const second = await callDetails('place-cache-1', 'details-user-A');
		expect(second.status).toBe(200);
		expect(await second.json()).toEqual({ id: 'place-cache-1', name: 'Eiffel Tower' });
		expect(fetchSpy).toHaveBeenCalledTimes(1); // STILL one — served from cache
	});

	it('returns 429 once the per-user bucket is drained past the cap', async () => {
		// Fresh Response per call — a Response body can only be read once.
		vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
			new Response(JSON.stringify({ ok: true }), { status: 200 })
		);

		const userId = 'details-flood-user';
		// Burst ceiling is 240; vary place_id so we never hit cache and always
		// reach the bucket check fresh.
		let last: { status: number } | undefined;
		for (let i = 0; i < 241; i++) {
			last = await callDetails(`flood-${i}`, userId);
		}
		expect(last?.status).toBe(429);
	});
});

describe('flights/lookup route', () => {
	it('serves a repeat lookup from cache without a second upstream call', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(
				new Response(JSON.stringify([{ number: 'BA286', status: 'Scheduled' }]), { status: 200 })
			);

		const first = await callFlights('BA286', '2026-07-01', 'flights-user-A');
		expect(first.status).toBe(200);
		expect(fetchSpy).toHaveBeenCalledTimes(1);

		const second = await callFlights('BA286', '2026-07-01', 'flights-user-A');
		expect(second.status).toBe(200);
		expect(await second.json()).toEqual([{ number: 'BA286', status: 'Scheduled' }]);
		expect(fetchSpy).toHaveBeenCalledTimes(1); // cache hit, no second upstream call
	});

	it('returns 429 once the per-user bucket is drained past the cap', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
			new Response(JSON.stringify([]), { status: 200 })
		);

		const userId = 'flights-flood-user';
		let last: { status: number } | undefined;
		for (let i = 0; i < 241; i++) {
			last = await callFlights(`FL${i}`, '2026-07-01', userId);
		}
		expect(last?.status).toBe(429);
	});
});

describe('places/autocomplete route', () => {
	it('enforces the per-user bucket (429 past cap) and stays uncached', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementation(async () =>
				new Response(JSON.stringify({ suggestions: [] }), { status: 200 })
			);

		const userId = 'autocomplete-flood-user';
		let last: { status: number } | undefined;
		for (let i = 0; i < 241; i++) {
			last = await callAutocomplete(`q${i}`, userId);
		}
		expect(last?.status).toBe(429);
		// Uncached: every allowed request (240 of them) reached the upstream.
		expect(fetchSpy).toHaveBeenCalledTimes(240);
	});
});
