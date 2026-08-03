/**
 * Latest-wins autocomplete fetching for `PlacesAutocomplete.svelte` (#377).
 *
 * The component debounces keystrokes by 300ms, but debouncing only thins the
 * request stream — it does not order the responses. A request fired at t=0 that
 * takes 900ms still resolves AFTER one fired at t=600ms that takes 100ms, and
 * the late arrival used to overwrite `predictions` with results for text the
 * user had already typed past. On a slow connection that reads as the list
 * flickering back to stale suggestions mid-typing.
 *
 * Two guards, deliberately both:
 *   1. `AbortController` — cancels the superseded request so the network work
 *      stops (the reason abort beats a bare token: it saves the round trip).
 *   2. A monotonic sequence token — abort is *advisory*. A response already in
 *      flight can still land, and `fetch` implementations/polyfills differ on
 *      exactly when they reject. The token makes "only the newest wins" a
 *      property of this module rather than of the fetch implementation.
 *
 * Kept out of the component so it is unit-testable in the node project — the
 * component tree has no test environment here.
 */

export interface PlaceSuggestion {
	placePrediction: { placeId: string; text: { text: string } };
}

/** Below this many characters the component doesn't search at all. */
export const PLACES_MIN_QUERY = 3;

/**
 * A search outcome. `null` means "superseded or aborted" — the caller must
 * leave its current state alone; a newer search owns the UI. `[]` means a real
 * empty result (or a failed lookup), which the caller SHOULD render.
 */
export type SearchResult = PlaceSuggestion[] | null;

export interface PlacesSearch {
	/** Run a search. Aborts any in-flight one. Resolves `null` when superseded. */
	search(query: string, sessionToken: string): Promise<SearchResult>;
	/** Cancel any in-flight request (input cleared, component destroyed). */
	cancel(): void;
}

type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<{
	ok: boolean;
	json(): Promise<unknown>;
}>;

function isAbortError(e: unknown): boolean {
	return e instanceof Error && e.name === 'AbortError';
}

export function autocompleteUrl(query: string, sessionToken: string): string {
	return `/api/places/autocomplete?input=${encodeURIComponent(query)}&session_token=${encodeURIComponent(sessionToken)}`;
}

export function createPlacesSearch(fetchImpl: FetchLike = fetch as unknown as FetchLike): PlacesSearch {
	let ctrl: AbortController | null = null;
	let seq = 0;

	return {
		async search(query, sessionToken) {
			ctrl?.abort();
			const myCtrl = new AbortController();
			const mySeq = ++seq;
			ctrl = myCtrl;

			try {
				const res = await fetchImpl(autocompleteUrl(query, sessionToken), {
					signal: myCtrl.signal
				});
				// Superseded while the request was open — drop it silently.
				if (mySeq !== seq) return null;
				// #340: the proxy returns a real status on upstream failure — don't
				// parse an error body as if it were results.
				if (!res.ok) return [];
				const body = (await res.json()) as { suggestions?: PlaceSuggestion[] } | null;
				// Re-check: `json()` is a second await point, so a newer search can
				// have started between the headers and the body.
				if (mySeq !== seq) return null;
				return body?.suggestions ?? [];
			} catch (e) {
				if (mySeq !== seq || isAbortError(e)) return null;
				// Real failure (offline, parse error): an empty list, never a crash.
				return [];
			} finally {
				if (ctrl === myCtrl) ctrl = null;
			}
		},

		cancel() {
			// Bumping the sequence matters as much as the abort: it invalidates a
			// response that is already past the network and cannot be aborted.
			seq++;
			ctrl?.abort();
			ctrl = null;
		}
	};
}
