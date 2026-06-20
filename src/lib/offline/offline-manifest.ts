// Pure manifest builder for whole-trip offline prefetch (#254, ADR-0010).
//
// Given an active trip's already-loaded data (the trip slug + its days, items,
// and documents), this produces the EXACT, de-duplicated, ordered set of URLs
// the service worker must pull into cache so the whole active trip is browsable
// offline after a single online app-open: every reachable route, each route's
// SvelteKit `__data.json` payload (so client-side navigations replay offline),
// and every document's file bytes (the boarding pass).
//
// PURE: no I/O, no Cache API, no fetch, no DOM. The SW (`sw-runtime`/glue) is
// what fetches the returned list. This is the testable core — "what does 'the
// whole active trip' mean, concretely" lives here and is unit-tested in
// isolation (prior art: `now-state`, `cache-policy`).
//
// What is NOT here (by design, PRD §Out of Scope): inactive/future trips are
// never bulk-prefetched — the caller gates this on the tz-correct `isTripActive`
// (#167) and only ever passes the ONE active trip. This module is given an
// active trip's data; it does not itself decide activeness.

/** The id-bearing shapes this builder needs — a structural subset of the real
 * records, so a field-limited loader fetch (just ids) satisfies it. */
export interface ManifestTrip {
	slug: string;
}
export interface ManifestDay {
	id: string;
}
export interface ManifestItem {
	id: string;
}
export interface ManifestDocument {
	id: string;
}

export interface ManifestInput {
	trip: ManifestTrip;
	days?: ManifestDay[];
	items?: ManifestItem[];
	documents?: ManifestDocument[];
}

/**
 * SvelteKit's data-payload URL for a route path. Mirrors the framework's
 * `add_data_suffix` (`@sveltejs/kit` 2.57): strip a trailing slash, append
 * `/__data.json`. Coupling to this contract is an ADR-0010 consequence; the SW's
 * `cache-policy.isDataRequest` is the matching read side.
 */
export function dataPayloadUrl(routePath: string): string {
	return routePath.replace(/\/$/, '') + '/__data.json';
}

/**
 * Document file-bytes endpoint for a document id under a trip slug. Single source
 * of truth for the byte URL shape, matching `toDocumentView.file_href` and
 * `cache-policy.isDocumentFilePath` (`/trips/<slug>/documents/<id>/file`).
 */
export function documentFileUrl(slug: string, docId: string): string {
	return `/trips/${slug}/documents/${docId}/file`;
}

/**
 * Build the complete prefetch URL list for one active trip.
 *
 * Includes, for the given slug:
 *   - the overview route `/trips/<slug>` and its `__data.json`
 *   - the Trip-Mode home `/trips/<slug>/now` and its `__data.json`
 *   - the Documents list `/trips/<slug>/documents` and its `__data.json`
 *   - every day route `/trips/<slug>/days/<dayId>` and its `__data.json`
 *   - every item-detail route `/trips/<slug>/items/<itemId>` and its `__data.json`
 *   - every document's file bytes `/trips/<slug>/documents/<docId>/file`
 *
 * Routes precede their data payloads precede document bytes, in a stable order
 * (overview → now → documents-list → days → items → doc-bytes). The result is
 * de-duplicated (insertion order preserved) so the SW never fetches a URL twice
 * even if the inputs contain repeats. An inactive/empty trip (no days, items, or
 * documents) yields the minimal set: the always-present overview/now/docs-list
 * routes + their payloads, and no byte URLs.
 */
export function buildOfflineManifest(input: ManifestInput): string[] {
	const { trip, days = [], items = [], documents = [] } = input;
	const slug = trip.slug;

	// The always-present anchor routes, in display priority.
	const overview = `/trips/${slug}`;
	const now = `/trips/${slug}/now`;
	const docsList = `/trips/${slug}/documents`;

	const routes: string[] = [overview, now, docsList];
	for (const d of days) routes.push(`/trips/${slug}/days/${d.id}`);
	for (const i of items) routes.push(`/trips/${slug}/items/${i.id}`);

	const urls: string[] = [];
	// Routes first, then each route's data payload (grouped so a partial fetch
	// failure still leaves a usable prefix), then immutable document bytes last.
	for (const r of routes) urls.push(r);
	for (const r of routes) urls.push(dataPayloadUrl(r));
	for (const doc of documents) urls.push(documentFileUrl(slug, doc.id));

	// De-dupe, preserving first-seen order (a Set over the assembled list).
	return [...new Set(urls)];
}
