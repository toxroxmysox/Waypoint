# M4 Status

**Status: MERGED.** Started 2026-05-17. Merged to main 2026-05-18 via [PR #7](https://github.com/toxroxmysox/Waypoint/pull/7).

---

## Sub-milestones

### M4a — Backend Foundation (done)
Migrations, hooks, types, crypto, trip-mode utilities.

Tasks:
- [x] Migration `0024_votes.js`: votes collection
- [x] Migration `0025_vault.js`: vault_entries collection + vault_password_hash on trips
- [x] `votes.pb.js`: enforce vote-as-self hook
- [x] Vote, VaultEntry types + vault_password_hash on Trip type
- [x] `vault.ts`: server-side scrypt hash/verify for vault password
- [x] `crypto.ts`: client-side AES-GCM encrypt/decrypt with PBKDF2 + 5 tests
- [x] `trip-mode.ts`: isToday, findNextItem, groupItemsByDay + 8 tests
- [x] `pnpm check`: 0/0/0

### M4b — Voting + Item Management UI (done)
Vote buttons, promote/demote, move item, vote counts on day detail.

Tasks:
- [x] `items/[itemId]/+page.server.ts`: vote/unvote/promote/demote/moveItem actions + load votes
- [x] `VoteButtons.svelte`: thumbs-up toggle with vote count
- [x] `MoveItemSheet.svelte`: bottom sheet to reassign item day/slot/phase
- [x] Wired voting, promote/demote, move into item detail page
- [x] Vote counts displayed on day detail item cards
- [x] `pnpm check`: 0/0/0

### M4c — Vault UI (done)
Vault password setup, unlock flow, encrypted entry CRUD.

Tasks:
- [x] `api/vault/unlock/+server.ts`: vault unlock API endpoint (scrypt verify)
- [x] Vault password setup in trip settings with no-recovery warning
- [x] `vault/+page.server.ts`: load entries, createEntry/deleteEntry actions
- [x] `vault/+page.svelte`: unlock flow, entry list with expand/collapse, create bottom sheet, delete
- [x] Activated vault link on More page
- [x] `pnpm check`: 0/0/0

### M4d — Trip Mode (done)
Today view with large cards, now indicator, tomorrow peek, upcoming days.

Tasks:
- [x] `NowDivider.svelte`: clay-colored "Up next" / "Now" divider
- [x] `TripModeCard.svelte`: large one-handed item card with time, status pills, confirmation codes
- [x] `today/+page.server.ts`: loads today's items + upcoming days by UTC date match
- [x] `today/+page.svelte`: slot-based grouping, NowDivider before next item, tomorrow peek section
- [x] `today/upcoming/+page.server.ts` + `+page.svelte`: next 3 days view with SubTabs
- [x] Trip Mode toggle link on trip overview page
- [x] Visual verification deferred (PocketBase not running in worktree)
- [x] `pnpm check`: 0/0/0

### M4e — Offline PWA (done)
Service worker rewrite, A2HS banner, offline mode toggle.

Tasks:
- [x] `service-worker.ts`: dual cache (STATIC_CACHE for assets, DATA_CACHE for API responses), offline mode via postMessage
- [x] `A2HSBanner.svelte`: iOS manual instructions + Android `beforeinstallprompt` install button, 30-day dismiss
- [x] Wired offline toggle into `+layout.svelte` (online/offline events, offline banner) and More page
- [x] Visual verification deferred (PocketBase not running in worktree)
- [x] `pnpm check`: 0/0/0

### M4f — E2E + Polish (done)
Playwright tests, full test suite verification, status file.

Tasks:
- [x] `tests/e2e/m4-execution.spec.ts`: 6 tests (vote button, vault locked, trip mode today, A2HS, mobile responsive vault + trip mode)
- [x] `pnpm check`: 5 pre-existing PUBLIC_PB_URL errors only
- [x] Unit tests: 36/36 passing (date-math, debt-simplify, crypto, trip-mode)
- [x] E2E tests: written but cannot run without PocketBase — deferred to dogfooding

---

## Lessons learned (M4)

- **Svelte `{@const}` must be a direct child of a block tag.** Placing `{@const x = ...}` inside a `<div>` within an `{#if}` block fails silently or errors. Move the `@const` up to be an immediate child of the `{#if}`.
- **`sessionStorage` is the right scope for vault passwords.** Cleared on tab close, survives page navigations within the session. localStorage would be a security risk; cookies would leak to the server.
- **Service worker `offlineMode` flag must be set via `postMessage`, not localStorage.** The SW runs in a separate thread and can't read localStorage directly. The pattern: UI toggles localStorage + sends `postMessage({ type: 'SET_OFFLINE', offline: bool })` to `navigator.serviceWorker.controller`.
- **`beforeinstallprompt` only fires on Android Chrome.** iOS Safari has no programmatic install prompt — must show manual "Add to Home Screen" instructions with share icon. Check `navigator.userAgent` for iOS detection.
- **Parallel subagent dispatch works well for independent UI tasks.** M4d Tasks 1+2+3 and M4e Tasks 1+2+3 were dispatched in parallel batches, cutting wall-clock time significantly without conflicts.
- **Visual verification requires PocketBase running.** In worktree-based development, PB isn't running, so preview verification must be deferred to dogfooding on the main branch with a live PB instance.
- **Always check for field conflicts across migrations.** Migration 0026 re-added `vault_password_hash` that already existed in 0002 with `hidden: true` — the re-add would have stripped the hidden flag and exposed the hash to clients. Caught in code review and deleted.
- **PocketBase `hidden: true` fields aren't returned in API responses.** Use this for sensitive fields like password hashes. But verify the TypeScript interface doesn't expose them to the client via SvelteKit data serialization — the `parent()` data flow sends the full record object.
- **Service worker `caches.match()` returns `undefined`, not `Response`.** Casting to `Promise<Response>` hides the undefined and crashes `respondWith()` when offline. Always handle the undefined case.

---

## Open decisions

None.

---

## Post-merge review notes

Three-agent code review found and fixed:
1. SW navigation fallback crash (undefined → Response cast)
2. TripModeCard null guard on confirmation_codes
3. Redundant migration 0026 (would strip hidden flag on vault_password_hash)
4. Settings template: replaced hash access with server-derived boolean

Deferred to M6 polish:
- Rate limiting on vault unlock endpoint
- A2HS beforeinstallprompt listener cleanup
- Timezone documentation in deploy config (server must run TZ=UTC)
