# PRD — Offline: A Read-Only Active Trip on a Plane

> Owner: Scott Vanden Warsen
> Created: 2026-06-13 (from the #116 audit; grilled 2026-06-13; charter scenarios 19 + 28; findings WP-B-010, WP-A-004)
> Status: Approved (design grilled + modules/testing confirmed 2026-06-13)
> Glossary: [[Trip Mode]], [[Document]], [[Trip Documents]], [[Item]], [[Day]], [[Phase]] in CONTEXT.md.
> Relates to: the [[Document]] offline precache (V4_DOCUMENTS_PRD S5 — folds into the broader prefetch); the active-window check rides **#167** (`isTripActive` UTC→trip-tz fix) for correct edge timing.
> Records: an **ADR** (offline strategy — SW-cached SSR pages + whole-trip prefetch, not IndexedDB offline-first) and a **SPEC §Offline rewrite** (the current section is a live-doc lie).

## Problem Statement

Waypoint promises to replace the "pinned-message + screenshots" stack for a trip — but the moment a traveler actually needs it most, on a plane with no signal, it gives them a blank wall.

The app is server-rendered (every page's data is fetched server-side from PocketBase). Those fetches never pass through the browser's service worker, and the rendered pages and their data payloads are never cached. So:

- **Cold-launching the PWA offline** (the normal case — iOS evicts PWAs from memory aggressively, so reopening on the plane is a fresh launch) returns a raw plain-text **`503 'Offline'`**. The app shell doesn't even load.
- **Navigating offline** — tapping from Docs to Today — fails its data fetch and dead-ends in the same 503, losing the traveler's place.
- **The itinerary is never available offline at all** — no trip, day, item, or overview data is cached anywhere; there's no client store.
- The **one** thing that works — document file bytes (the boarding pass) — only caches if the traveler opened the Documents tab *while online during the trip*, and even then is unreachable offline because the page that would show it won't load.
- The **manual "offline mode" toggle** is inert: it gates `/api/*` requests that server-rendered pages never make, it's buried in the planning-only "More" menu (hidden in Trip Mode — the exact mode you're in on the plane), and tapping it reloads the page, which itself 503s when truly offline.

And the docs lie about all of this: SPEC's offline section claims "Full trip works offline after one online load" and "Service worker caches all trip data when online" — neither is true. This fails charter scenarios 19 (find the boarding pass offline) and 28 (I'm on the plane — what can I see?) outright, and sends the traveler back to their email and airline apps — the stack Waypoint exists to replace.

## Solution

After a traveler opens an active trip online even once, the **entire active trip is available read-only offline** — the itinerary (Now, Today, every day, every item, the overview) and every [[Document]] (the boarding pass, hotel vouchers). On the plane they open Waypoint and see their day and their boarding pass, not a 503.

- **The service worker caches what it serves.** Navigations and their data payloads are cached network-first — fresh when online, the last-seen version when not. A minimal app shell is precached so a cold launch offline always renders the app, never a raw error.
- **The whole active trip is prefetched on open.** When the traveler opens the app during the trip's active window, the service worker proactively pulls the entire trip — all days, items, the overview, the Documents list, and all document bytes — into the cache, best-effort. The day-1 flight is covered without the traveler having hunted through tabs the night before.
- **Offline is automatic and honest.** There's no toggle to find. When the device is offline, an app-wide banner says "Offline — showing [Trip] as of [time]," prominent in [[Trip Mode]]. The data is a clearly-labeled snapshot; it revalidates the moment signal returns.
- **Read-only, gracefully.** Any attempt to change something offline is blocked with a toast ("You're offline — reconnect to make changes"). Anything genuinely not cached shows a friendly "not available offline" state, never a raw 503.

## User Stories

1. As a traveler on a plane with no signal, I want to open Waypoint and see today's plan, so that I don't have to remember where I'm going next.
2. As a traveler at the gate, I want to pull up my boarding pass offline, so that I don't fall back to my email or the airline app.
3. As a traveler offline, I want to browse any day of the trip — not just today — so that "what's our hotel address on day 5?" has an answer without signal.
4. As a traveler offline, I want to open any item's detail (address, confirmation code, reservation), so that the execution-critical facts are there when I need them.
5. As a traveler, I want the whole trip to be ready offline after I've opened the app online once during the trip, so that I don't have to pre-load each screen manually.
6. As a traveler who never opened the Documents tab, I want my day-1 boarding pass cached anyway, so that the single most offline-critical artifact is there on departure morning.
7. As a traveler whose phone evicted the PWA from memory, I want a cold launch offline to still show the app and my cached trip, so that reopening on the plane works.
8. As a traveler navigating offline, I want to move between Now, Today, days, and Documents without dead-ending, so that the app stays usable end-to-end without signal.
9. As a traveler, I want a clear "Offline — showing your trip as of [time]" banner, so that I know I'm looking at a snapshot and roughly how fresh it is.
10. As a traveler, I do NOT want to hunt for an "offline mode" switch, because the app should just work offline automatically.
11. As a traveler who tries to edit something offline, I want a clear "you're offline, reconnect to change this" message, so that I understand why the action didn't take rather than thinking the app is broken.
12. As a traveler, when my signal comes back I want the trip to refresh to the latest, so that I'm not stuck looking at a stale snapshot once I'm online again.
13. As a traveler, I want a page that genuinely wasn't cached to show a friendly "not available offline" state, so that I never hit a raw error wall.
14. As a trip member sharing my phone or logging out, I want my cached trip cleared on logout, so that my trip data isn't left readable by the next person.
15. As a viewer (read-only member), I want the same offline read of the trip, so that I stay oriented on the trip without signal.
16. As a planner before the trip starts, I don't expect heavy offline prefetch of a trip that isn't active yet, so that the app doesn't waste storage/bandwidth caching trips I'm not on right now.
17. As a phone user, I want offline to work one-handed at 375px in Trip Mode, so that the plane experience matches the live-trip experience.
18. As any user, I want the documented offline promise to match reality, so that I (and future contributors) can trust what the app claims to do.

## Implementation Decisions

- **`offline-manifest` is a new pure, deep module — the testable core.** Given an active trip's loaded data (trip, phases, days, items, documents), it produces the exact set of route URLs + data-payload URLs + document-byte URLs to prefetch. Pure, no I/O; the service worker calls it and fetches the list. This is where "what does "the whole active trip" mean, concretely" lives, and it's unit-tested in isolation.
- **`cache-policy` is a new pure module** classifying an incoming request into a strategy: app-shell/asset → cache-first; navigation + its data payload → network-first with cached fallback; document bytes → cache-first; everything else → network passthrough; on a navigation miss while offline → serve the precached shell. Pure request-in / strategy-out; unit-tested.
- **The service worker is rewritten as a thin shell over those two modules.** It precaches the app shell + build assets at install; on a prefetch message (fired on app-open during the active window) it fetches the `offline-manifest` list into the cache (best-effort / allSettled, as the existing document precache already does); it applies `cache-policy` to every fetch. The existing document-bytes caching folds in as one branch. The dead network-first-with-empty-fallback navigation handler and the inert `SET_OFFLINE` plumbing are removed.
- **Prefetch trigger: app-open during the active window, from any [[Trip Mode]] surface** — not only a Documents-tab visit (today's bug). "Active window" uses the same `isTripActive` check, which must be on its trip-timezone fix (**#167**) so the window's edges are correct. Prefetch is scoped to the **one active trip**; trips that aren't active aren't bulk-prefetched (story 16).
- **Caching strategy for SSR output:** navigations are cached network-first (fresh online, last-seen offline); SvelteKit's per-route data payload (`__data.json`) is cached alongside so client-side navigations replay offline; a minimal **app-shell document is precached** so a cold launch offline renders the app instead of a 503. The cached HTML is a server-rendered, authenticated view — so caches are **device-scoped and cleared on logout** (mitigates a shared-device leak); old cache versions are evicted by the existing version scheme.
- **Read-only enforcement (`offline write-guard`):** when offline, mutation entry points (form actions / submit handlers) are short-circuited with a toast ("You're offline — reconnect to make changes") rather than failing silently or 503-ing. Read navigation is unaffected.
- **Offline status UI replaces the toggle.** The manual offline toggle and its localStorage flag are **removed** (WP-A-004 — it was inert against SSR). In its place, an app-wide **offline banner** keyed off `navigator.onLine` + the online/offline events shows "Offline — showing [Trip] as of [snapshot time]," surfaced prominently in Trip Mode. Going offline/online flips the banner; no user action required.
- **Staleness + revalidation:** the snapshot time shown in the banner is the last successful cache write for the trip; network-first means the moment signal returns, navigations fetch fresh and the prefetch re-runs on the next app-open online.
- **Editing offline stays out** (read-only promise) — the write-guard blocks it; no offline edit queue or sync. SPEC's "Edits while offline = blocked with toast" becomes literally true.
- **Documentation:** SPEC's §Offline (and the M5/PWA offline claims) are **rewritten** to the real contract — read-only active trip after one online open, whole-trip prefetch, editing blocked, no full-app offline for inactive trips. CONTEXT.md's [[Document]] "available offline in Trip Mode" stays accurate; the Shell context note already lists offline.

## Testing Decisions

- Good tests assert **external behavior** — trip data in → correct prefetch URL set out; a request in → the right cache strategy out; offline + a cached trip → the trip renders. Not internal cache bookkeeping.
- **Vitest, dense — the two pure modules:**
  - `offline-manifest`: a representative trip (multiple phases, days, items, several documents) produces the complete, correct URL set — every day route, item-detail data payload, the overview, the Documents list, and every document-byte URL; an inactive/empty trip produces the minimal set; no duplicates. Prior art: the existing pure-module suites (`now-state.test.ts`, sort-order tests).
  - `cache-policy`: each request shape maps to the right strategy (asset→cache-first, navigation→network-first, doc-bytes→cache-first, navigation-miss-offline→shell), including the negative cases (a non-trip API call passes through).
- **Service-worker glue tests (Scott's call to cover the wiring):** drive the SW's fetch/message handlers against a **mocked Cache API + fetch** harness — assert that a prefetch message populates the cache from the manifest, that an offline navigation returns the cached page (and the shell on a miss), that `__data.json` is served from cache offline, and that the document-bytes branch serves cached bytes. These are inherently more brittle than the pure tests (SW lifecycle is awkward), so they target observable cache reads/writes, not implementation details.
- **Playwright, one offline path:** load an active trip online → `context.setOffline(true)` → reload (cold-launch sim) → the app shell + trip render from cache → today's items are visible → open a day and an item detail → open a cached document → attempt an edit and get the offline toast. Playwright's offline emulation makes this the real "plane" proof. Prior art: existing E2E specs.
- **Not separately unit-tested:** the offline banner UI and the write-guard wiring (covered by the E2E path).

## Out of Scope

- **Offline editing / sync queue / conflict resolution.** The promise is read-only; mutations are blocked offline. A future offline-write story is its own large effort (multi-writer conflict resolution) and is explicitly deferred.
- **IndexedDB / client-side offline-first rendering.** Rejected in the grill (and the ADR) — a major rearchitecture of an SSR app for a read-only-on-a-plane need. The SW-caching approach delivers the promise without it.
- **Full offline for trips that aren't active** (other trips, future trips, planning a trip from scratch offline). Only the one active trip is prefetched; other trips work offline only for pages visited online (cache-on-visit), and that's acceptable.
- **Offline access to the [[Public Archive]]** — a separate public, token-gated surface.
- **Background sync / periodic background refresh** while the app is closed — prefetch is on app-open, not a background job.
- **A new offline data model** — no new collections or fields; this is a caching/PWA-shell change only.

## Further Notes

- **Origin:** audit #116. Absorbs **WP-B-010** (P1, fleet-verified — offline is doc-bytes-only with no reachable UI; cold-launch/nav 503; day-1 flight uncovered; SPEC offline contract is a live-doc lie) and **WP-A-004** (P2 — the manual toggle is buried in planning-only nav and inert against SSR). Report: `docs/app-audit/v2/index.html`.
- **Root cause is the SSR architecture:** server-side `locals.pb` fetches never reach the service worker, so nothing the SW could cache flows through it for the itinerary. The fix meets SSR where it is — cache the rendered output + data payloads + proactively prefetch — rather than rearchitecting to a client-fetch model. The ADR records that choice and the rejected alternatives (IndexedDB offline-first; a dedicated client-rendered offline view).
- **Charter scenarios 19 + 28** are the acceptance lens: the boarding pass is findable offline, and "what can I see on the plane" is "my whole active trip, read-only."
- **Relationship to Documents:** the V4_DOCUMENTS_PRD S5 document precache (already shipped) is the seed of this — it precached doc bytes but had no reachable UI offline. This PRD subsumes it into a whole-trip prefetch with an actual offline shell, so the cached bytes are reachable.
- **Slicing into issues** at milestone promotion via `to-issues`. Natural first slice: the `cache-policy` + SW shell so cold-launch offline renders *something* (tracer-bullet), then `offline-manifest` + prefetch, then the banner + write-guard, then the SPEC rewrite.
- The **manual toggle removal** is part of this PRD (it's inseparable from making offline automatic), closing WP-A-004 here rather than as a separate fix.
