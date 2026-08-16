import { describe, it, expect } from 'vitest';
import {
	createPlacesSearch,
	autocompleteUrl,
	PLACES_MIN_QUERY,
	type PlaceSuggestion
} from './places-search';

function suggestion(text: string): PlaceSuggestion {
	return { placePrediction: { placeId: `id-${text}`, text: { text } } };
}

/** A fetch stub whose responses are resolved by hand, in whatever order. */
function deferredFetch() {
	const calls: {
		url: string;
		signal?: AbortSignal;
		resolve: (v: { ok: boolean; json(): Promise<unknown> }) => void;
		reject: (e: unknown) => void;
	}[] = [];

	const fetchImpl = (url: string, init?: { signal?: AbortSignal }) =>
		new Promise<{ ok: boolean; json(): Promise<unknown> }>((resolve, reject) => {
			calls.push({ url, signal: init?.signal, resolve, reject });
		});

	return {
		fetchImpl,
		calls,
		/** Resolve call #i with a 200 carrying `texts` as suggestions. */
		ok(i: number, texts: string[]) {
			calls[i].resolve({ ok: true, json: async () => ({ suggestions: texts.map(suggestion) }) });
		},
		fail(i: number, _status = 502) {
			calls[i].resolve({ ok: false, json: async () => ({ message: 'nope' }) });
		}
	};
}

describe('createPlacesSearch — stale-response race (#377)', () => {
	it('drops an earlier response that resolves AFTER a newer one', async () => {
		const f = deferredFetch();
		const s = createPlacesSearch(f.fetchImpl);

		// User types "par" (slow request), then "paris" (fast request).
		const slow = s.search('par', 'tok');
		const fast = s.search('paris', 'tok');
		expect(f.calls).toHaveLength(2);

		// The newer one comes back first — this is the one that must win.
		f.ok(1, ['Paris, France']);
		await expect(fast).resolves.toEqual([suggestion('Paris, France')]);

		// The earlier one lands late. Even though its fetch resolves normally
		// (the stub ignores the abort signal, exactly like a response already
		// past the network), it must NOT be handed back to the caller.
		f.ok(0, ['Parma, Italy']);
		await expect(slow).resolves.toBeNull();
	});

	it('aborts the in-flight request on the next keystroke', async () => {
		const f = deferredFetch();
		const s = createPlacesSearch(f.fetchImpl);

		const first = s.search('par', 'tok');
		expect(f.calls[0].signal?.aborted).toBe(false);

		s.search('pari', 'tok');
		expect(f.calls[0].signal?.aborted).toBe(true);

		// A real fetch rejects with AbortError once aborted → still null, no throw.
		const err = new Error('The operation was aborted.');
		err.name = 'AbortError';
		f.calls[0].reject(err);
		await expect(first).resolves.toBeNull();
	});

	it('lets the latest response win when responses arrive in order', async () => {
		const f = deferredFetch();
		const s = createPlacesSearch(f.fetchImpl);

		const first = s.search('par', 'tok');
		f.ok(0, ['Parma, Italy']);
		await expect(first).resolves.toEqual([suggestion('Parma, Italy')]);

		const second = s.search('paris', 'tok');
		f.ok(1, ['Paris, France']);
		await expect(second).resolves.toEqual([suggestion('Paris, France')]);
	});

	it('cancel() aborts and invalidates a response already past the network', async () => {
		const f = deferredFetch();
		const s = createPlacesSearch(f.fetchImpl);

		const inflight = s.search('par', 'tok');
		s.cancel();
		expect(f.calls[0].signal?.aborted).toBe(true);

		// Response lands anyway (abort is advisory) — the sequence bump drops it.
		f.ok(0, ['Parma, Italy']);
		await expect(inflight).resolves.toBeNull();
	});

	it('returns an empty list (not null) on a real upstream failure', async () => {
		const f = deferredFetch();
		const s = createPlacesSearch(f.fetchImpl);

		const p = s.search('par', 'tok');
		f.fail(0);
		await expect(p).resolves.toEqual([]);
	});

	it('returns an empty list when the network itself throws', async () => {
		const f = deferredFetch();
		const s = createPlacesSearch(f.fetchImpl);

		const p = s.search('par', 'tok');
		f.calls[0].reject(new TypeError('Failed to fetch'));
		await expect(p).resolves.toEqual([]);
	});

	it('tolerates a body with no suggestions key', async () => {
		const f = deferredFetch();
		const s = createPlacesSearch(f.fetchImpl);

		const p = s.search('par', 'tok');
		f.calls[0].resolve({ ok: true, json: async () => ({}) });
		await expect(p).resolves.toEqual([]);
	});
});

describe('autocompleteUrl', () => {
	it('encodes both the query and the session token', () => {
		expect(autocompleteUrl('caffè & bar', 'a b')).toBe(
			'/api/places/autocomplete?input=caff%C3%A8%20%26%20bar&session_token=a%20b'
		);
	});

	it('pins the minimum query length the component gates on', () => {
		expect(PLACES_MIN_QUERY).toBe(3);
	});
});
