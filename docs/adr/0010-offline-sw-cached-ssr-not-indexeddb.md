# ADR-0010: Offline = service-worker-cached SSR output + whole-trip prefetch, not a client-side (IndexedDB) data store

**Status:** Accepted
**Date:** 2026-06-13
**Deciders:** Scott
**Context:** `docs/OFFLINE_PRD.md` (Offline: a read-only active trip on a plane); audit #116 (WP-B-010, WP-A-004). The app is server-rendered — `+page.server.ts` loaders fetch from PocketBase via `locals.pb` server-side (adapter-node), so those fetches are invisible to the browser's service worker.

## Decision

Make the active trip available **read-only offline** by caching the service-worker-visible output of the SSR app — navigations (HTML) and their per-route data payloads (`__data.json`), **network-first** — plus a precached app shell, and **proactively prefetching the whole active trip** (all days, items, the overview, the Documents list, and all document bytes) on app-open during the trip's active window. We do **not** introduce a client-side data store (IndexedDB) with offline-first rendering.

## Why

- **The SSR investment stands.** `locals.pb` server fetches never reach the SW. Rather than rearchitect to a client-fetch + client-store model (a second data path through the whole app, plus sync), cache what the browser actually requests: navigations + `__data.json` + assets + document bytes. This is a service-worker + small-UI change, not an app rewrite.
- **Read-only-on-a-plane doesn't need a live local database.** A last-seen snapshot (network-first, so fresh when online) plus a whole-trip prefetch delivers the promise — the boarding pass and the full itinerary — without a sync/store layer.
- **Trip data is bounded.** A trip is dozens of items and a handful of documents; prefetching it whole on one online app-open is cheap and gives "it just works offline" without the user pre-visiting each page.

## Considered and rejected

- **IndexedDB offline-first** (mirror trip data to IDB; render from it when offline). The "truest" offline, but a major rearchitecture of an SSR app — a second data source, offline-aware rendering across components, and a sync story. Over-scoped for a read-only need.
- **A dedicated client-rendered offline view/route** reading a client cache. Scoped, but duplicates the itinerary rendering as a parallel surface and gives a divergent offline UX — more work than caching the real pages, for a worse result.
- **Status quo + fix the manual toggle.** The toggle gates `/api/*` calls SSR pages never make; "fixing" it solves nothing. Rejected — the toggle is removed and offline becomes automatic.

## Consequences

- **Offline is a snapshot**, not live data — the last successful cache write. A staleness banner ("showing your trip as of [time]") communicates this; network-first revalidates the moment signal returns.
- **Cached navigations are server-rendered, authenticated HTML.** Caches are therefore **device-scoped and cleared on logout**. A future multiple-accounts-per-device case would need per-identity cache partitioning — out of scope now (personal-phone PWA).
- **`__data.json` caching couples to SvelteKit's data-loading contract.** A SvelteKit major that changed that contract would require revisiting `cache-policy`. Acceptable, and isolated to one pure module.
- **Editing offline stays out** (read-only). This ADR doesn't preclude adding IndexedDB *later* for the narrower offline-write need — it only declines IDB as the *read* mechanism now.
- **Additive, no data model change** — no collections or fields; a PWA/service-worker + UI change. The existing document-bytes precache (V4_DOCUMENTS_PRD S5) folds in as one branch.
