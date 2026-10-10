# MCP connector v3.1 (reads): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use svw:executing-plans (small plans) or svw:subagent-driven-development (large plans) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member adds Waypoint as a claude.ai custom connector, logs in with their email code, and asks Claude (web or phone) read-only questions about any of their trips, answered from Waypoint data as card views.

**Architecture:** A remote MCP server (Streamable HTTP, stateless JSON) at `/mcp` inside the existing SvelteKit app, plus a minimal OAuth 2.1 authorization server (CIMD, PKCE S256, email-code login, no consent screen) at `/oauth/*` and `/.well-known/*`. Connections and hashed access/refresh tokens live in PB; each tool call runs as the user through a 15-minute PB impersonation token minted server-side by the superuser client, so PB rules enforce role. Tools are thin I/O glue over existing pure modules (money, timeline, multi-day, trip-time, booking-projection); one shared MCP Apps card view renders every result.

**Tech Stack:** SvelteKit 2 (adapter-node), PocketBase 0.26 JS SDK, `@modelcontextprotocol/sdk` 1.32.1, zod 4, Vitest, Playwright.

**Spec:** `docs/plans/2026-10-10-mcp-reads/grill.md`, amended by `docs/plans/2026-10-10-mcp-reads/spike.md` ("Findings that change the v3.1 plan"). Reference code (not for merge): branch `spike/502-mcp`.

**Intent sources:** `docs/adr/0024-agent-access-posture.md` (amends `docs/adr/0017-*`); glossary `CONTEXT.md` (**AI Access**, **Connection**, Role, Suggestion, Expense, Item Cost).

**Run:** `pnpm test:e2e:clean` for the suite. By hand: production build (`pnpm build && node deploy/server.mjs` with PB from `./backend/start.sh`; `vite dev` skips CSRF so it proves nothing about the token endpoint) behind a `cloudflared tunnel --url http://localhost:3000` quick tunnel; add `https://<tunnel>/mcp` as a custom connector on claude.ai; connect from the Claude iPhone app. Seed: `POST /pb/api/dev/seed-mcp-trips` (Task 4).

## Global Constraints

- Branch: `release/3.1` off `main`; each task's commits land there. Merging to `main` after review needs no sign-off; **deploy only on Scott's word**.
- All tools are read-only: `annotations: { readOnlyHint: true }`. No tool writes PB. No tool touches `users`, `pending_invites`, `join_tokens`, `_otps`, or auth endpoints.
- No email address and no photo/file URL in any tool output (ADR-0024 §5). Two layers: every PB read uses a `fields:` allowlist that omits `email`, file fields (`photo`, `file`, `cover_image`, `avatar`), and every outbound string passes `scrub()` (Task 4).
- AI Access off → only `{ title, start_date, end_date }` plus the exact notice `AI access is turned off for this trip by its owner.` Nothing else from that trip, including from `search`.
- PB filters use `pb.filter('… {:x}', { x })`, never string interpolation of user/model input.
- Trip-local time everywhere via `tripTz` / `tripToday` (`src/lib/shell/trip-time.ts`). Never machine tz.
- Money, timeline order, multi-day spans, booking need: computed by existing modules, not re-implemented.
- MCP server `instructions` string (exact, Task 9 finalizes it): `Waypoint is the user's group-trip planner, and you are helping one of its members. Ground every answer in Waypoint data, in the trip's local time, and say when something isn't recorded rather than guessing. Advice is welcome when it serves what the user asked (better timing, what fits together, what's missing), offered as a suggestion for them to decide: the trip belongs to its members. If a trip's AI access is off, say so plainly.` Principle, not prohibitions: no "never plan" wording anywhere (Scott, 2026-10-10).
- Migrations append only: next numbers `0076`, `0077`.
- Removed/renamed labels → `grep -rn '<old>' tests/` in the same commit.

## Review Focus

1. **Ambiguous trip reference.** "Lucerne" matches two trips, or a phase name not a title. Expect: resolve slug/id exactly first, then title/location contains; >1 match → error text listing the candidates' titles and dates, never silently the first. (Task 4 `resolveTrip` test.)
2. **Day edges.** `tomorrow` beyond the trip end; a trip with an empty/invalid timezone; the check-out day of a multi-night stay; a red-eye that lands today (#498). Expect: out-of-trip date → note, not error; UTC fallback; lodging shows "staying" on middle nights and "check-out" on its last day; red-eye on today. (Task 5 tests.)
3. **Revocation mid-session.** Refresh-token replay after rotation; Disconnect while Claude holds a live access token; user removed from a trip. Expect: replay → `invalid_grant` and the whole connection's tokens revoked; Disconnect → next `/mcp` call 401; removed trip absent from `list_trips`. (Tasks 3, 4 tests.)
4. **Emails in odd shapes.** Uppercase, `mailto:` in rich-text notes, inside a placeholder member's name, in an expense description, a comment, a task title, a memory thought; photos via file names or `/api/files/` URLs. Expect: zero matches across every tool. (Task 9 isolation sweep; seed covers each shape in Task 4.)
5. **Big history.** A user with many trips searching "restaurant". Expect: results capped at 25 cards with `+N more — narrow by trip, type, or date` in the heading; no tool returns more than 50 cards. (Task 6 test.)

---

### Task 1: AI Access setting

**Files:**
- Create: `backend/pb_migrations/0076_trips_ai_access.js`
- Modify: `src/lib/itinerary/types.ts` (Trip), `src/routes/(app)/trips/[slug]/settings/+page.server.ts`, `src/routes/(app)/trips/[slug]/settings/+page.svelte`, `src/routes/(app)/trips/import/+page.server.ts`, `src/routes/(app)/trips/[slug]/clone/+page.server.ts`, `src/lib/portability/export.ts`, `backend/pb_hooks/trips.pb.js`
- Test: `tests/e2e/ai-access-setting.spec.ts`

**Interfaces:**
- Produces: `Trip.ai_access: boolean`, true = connected AI can read the trip. Default true. A PB bool defaults to false, so: the migration sets every existing trip to true; `trips.pb.js` sets it true on create when the request body omits it (so any future creation path is on by default); import uses `importData.trip.ai_access ?? true`, clone copies the source `?? true`, export includes it.

- [ ] **Step 1: Write the failing test** `tests/e2e/ai-access-setting.spec.ts` (serial, seed via `/api/dev/rules-fixture`):
  - `owner turns AI Access off and on`: settings shows a checkbox labelled `AI Access`, checked by default, helper text `Lets members' connected AI assistants (like Claude) read this trip. Turning it off hides everything but the trip's name and dates.`; uncheck + save → PB record `ai_access === false`; re-check → `true`.
  - `new trips default on`: a trip created through `/trips/new`, and one created by a bare PB `trips.create` without the field, both read `ai_access === true`.
  - `traveler cannot change AI Access`: PB `trips.update(id, { ai_access: false })` with a traveler's token rejects (status 400/403) and the record stays `true`.
- [ ] **Step 2:** `pnpm test:e2e:clean -- ai-access-setting` → FAIL (no field).
- [ ] **Step 3:** Migration adds bool `ai_access` and backfills true. Settings action writes `ai_access: data.get('ai_access') === 'on'`, mirroring `auto_approve_suggestions`. Add the create-default to `trips.pb.js`; add owner/co_owner gating there only if the traveler test fails without it.
- [ ] **Step 4:** Re-run → PASS. `pnpm check` clean. 375px screenshot: `pnpm verify:visual '/trips/{slug}/settings' --widths 375`.
- [ ] **Step 5: Commit** `feat(#502): AI Access trip setting (default on)`.

### Task 2: Connection storage and user-scoped PB

**Files:**
- Create: `backend/pb_migrations/0077_mcp_connections.js`, `src/lib/server/mcp/admin-pb.ts`, `src/lib/server/mcp/oauth/store.ts`, `src/lib/server/mcp/oauth/pending.ts`, `src/lib/server/mcp/oauth/crypto.ts`
- Test: `src/lib/server/mcp/oauth/crypto.test.ts`, `src/lib/server/mcp/oauth/pending.test.ts`

**Interfaces:**
- Produces (PB):
  - `mcp_connections`: `user` (relation users, required, cascadeDelete), `client_id` (text), `client_name` (text), `last_used_at` (date), autodate `created`. Rules: list/view/delete `user = @request.auth.id`; create/update `null` (superuser only).
  - `mcp_tokens`: `connection` (relation mcp_connections, required, **cascadeDelete**), `kind` (select `access|refresh`), `hash` (text, unique index), `expires_at` (date). All rules `null`.
- Produces (TS):
  - `crypto.ts`: `randomToken(): string` (32 bytes base64url), `sha256Hex(s: string): string`, `pkceS256Ok(verifier: string, challenge: string): boolean`.
  - `pending.ts` (in-memory, `globalThis`-anchored; loss on restart only fails an in-flight login): `createPending(p: Omit<PendingAuth,'id'|'created'>): PendingAuth`, `getPending(id): PendingAuth | undefined` (15 min TTL), `issueCode(pending, userId: string): string` (deletes pending; code TTL 5 min), `takeCode(code): CodeRecord | undefined` (single use). `PendingAuth = { id, client: OAuthClient, redirect_uri, state, code_challenge, resource, created }`, `CodeRecord = { userId, client: OAuthClient, redirect_uri, code_challenge, expires }`, `OAuthClient = { client_id, client_name?, redirect_uris: string[] }`.
  - `admin-pb.ts`: `adminPb(): Promise<PocketBase>` (cached superuser via `PB_ADMIN_EMAIL`/`PB_ADMIN_PASSWORD`, re-auth on 401), `userPb(userId: string): Promise<PocketBase>` (`impersonate(userId, 900)`, cached per user until 60 s before expiry; the token never leaves the server).
  - `store.ts`: `TokenSet = { access_token, refresh_token, token_type: 'Bearer', expires_in: 3600 }`; `exchangeCode(p: { code, client_id, redirect_uri, code_verifier }): Promise<TokenSet | OAuthError>` (reuses the user's existing connection for the same `client_id`, else creates one); `rotateRefresh(p: { refresh_token, client_id }): Promise<TokenSet | OAuthError>`; `lookupAccess(token): Promise<{ connectionId, userId } | null>` (updates `last_used_at` at most once a minute). `OAuthError = { error: 'invalid_grant' | 'invalid_request' | 'unsupported_grant_type'; error_description?: string }`. Access TTL 3600 s, refresh TTL 30 days, honouring `MCP_ACCESS_TTL_S` env for tests.

- [ ] **Step 1: Write the failing tests:**
  - `crypto.test.ts`: `pkceS256Ok` true for RFC 7636 Appendix B pair (`dBjftJeZ4CVP-mJ92K9pVhk4bLrDhGfUq7zr0YBZ-ac` / `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`), false for a wrong verifier; `sha256Hex` deterministic, 64 hex chars.
  - `pending.test.ts`: `getPending` undefined after 15 min (fake timers); `issueCode` removes the pending; `takeCode` returns the record once then `undefined`; expired code → `undefined`.
- [ ] **Step 2:** `pnpm vitest run src/lib/server/mcp/oauth` → FAIL.
- [ ] **Step 3:** Implement the four modules and the migration. Replay detection in `rotateRefresh`: on rotation, don't delete the old refresh row; set its `expires_at` to now. Unknown hash → `invalid_grant`. Hit on an expired refresh row → replay: delete every token of that connection, return `invalid_grant`. Rows stay until the connection is deleted (cheap; one user, few rotations).
- [ ] **Step 4:** Re-run → PASS. Store/PB paths are proven by Task 3's e2e.
- [ ] **Step 5: Commit** `feat(#502): MCP connection + token storage, user-scoped PB`.

### Task 3: OAuth endpoints and the CSRF shim

**Files:**
- Create: `src/routes/api/dev/test-cimd/+server.ts`, `src/routes/api/dev/test-callback/+server.ts` (both 404 unless `WAYPOINT_DEV_MODE=true`), `src/lib/server/mcp/oauth/clients.ts`, `src/routes/.well-known/oauth-authorization-server/+server.ts`, `src/routes/.well-known/oauth-protected-resource/[...rest]/+server.ts`, `src/routes/oauth/authorize/+page.server.ts`, `src/routes/oauth/authorize/+page.svelte`, `src/routes/oauth/authorize/dev/+server.ts`, `src/routes/oauth/token/+server.ts`, `deploy/server.mjs`, `deploy/token-origin.mjs`
- Modify: `deploy/start.sh` (`node /app/build/index.js` → `node /app/deploy/server.mjs`), `Dockerfile` (copy `deploy/*.mjs`), the A2HS banner component (hide when `page.url.pathname.startsWith('/oauth')`)
- Test: `deploy/token-origin.test.ts`, `tests/e2e/mcp-oauth.spec.ts`, `tests/e2e/mcp-helpers.ts`

**Interfaces:**
- Consumes: Task 2 `pending.ts`, `store.ts`, `crypto.ts`.
- Produces:
  - `resolveClient(client_id: string): Promise<OAuthClient | { error: string }>`: CIMD only (https URL; `http://localhost`/`127.0.0.1` accepted only when `WAYPOINT_DEV_MODE=true`, for the e2e test client; fetch with 5 s timeout, `redirect: 'error'`, `doc.client_id === client_id`, non-empty `redirect_uris`, 1 h cache). No DCR: Claude uses CIMD (spike); no `/oauth/register`, no `registration_endpoint`.
  - `deploy/token-origin.mjs`: `fillTokenOrigin(req: IncomingMessage): void`: for `POST /oauth/token` with **no** Origin header only, sets `origin` to `${x-forwarded-proto ?? 'http'}://${host}`. `deploy/server.mjs` applies it then calls `build/handler.js`.
  - `tests/e2e/mcp-helpers.ts`: `connect(email: string): Promise<{ access: string; refresh: string }>` (authorize GET → dev complete → token), `callTool(access: string, name: string, args?: object): Promise<{ text: string; structured: any; isError?: boolean }>`, `rpc(access, method, params)`.
  - Dev-only `GET /oauth/authorize/dev?req=&email=` (404 unless `WAYPOINT_DEV_MODE=true`): finishes a pending request as the bypass user, same redirect as `verifyOTP`. Exists only so e2e can skip the emailed code.

- [ ] **Step 1: Write the failing tests:**
  - `token-origin.test.ts`: absent Origin on `POST /oauth/token` → filled with `https://app.example` given `x-forwarded-proto: https`, `host: app.example`; present foreign Origin unchanged; `POST /login` without Origin unchanged; `GET /oauth/token` unchanged.
  - `mcp-oauth.spec.ts` (serial; uses a test CIMD document served by the preview at `/api/dev/test-cimd` — add it to the dev route, dev-mode-gated — whose `redirect_uris` = `[`${BASE}/api/dev/test-callback`]`):
    - `metadata`: `/.well-known/oauth-authorization-server` has `client_id_metadata_document_supported: true`, `code_challenge_methods_supported: ['S256']`, no `registration_endpoint`; `/.well-known/oauth-protected-resource/mcp` names `${BASE}/mcp` and the issuer.
    - `authorize rejects unregistered redirect_uri`: 400 page, no redirect.
    - `authorize without PKCE`: 303 to redirect_uri with `error=invalid_request`.
    - `email step`: the authorize page renders an email field and, after `requestOTP` with a never-registered `@e2e.test` address, a code field whose `pattern` attribute is exactly `[0-9]{6}` and a hidden `req` input; no `pb_auth` set-cookie on either response.
    - `full flow`: `connect()` → token `form-urlencoded` POST (with `Origin: BASE`, standing in for `fillTokenOrigin`, since `vite preview` has no shim) returns `token_type: 'Bearer'`; wrong `code_verifier` → `invalid_grant`; code reused → `invalid_grant`; refresh → new pair, old refresh reused → `invalid_grant` **and** the new access token now 401s on `/mcp`.
    - `token endpoint ignores cookies`: a request carrying a valid web `pb_auth` cookie and no code still `invalid_grant`.
- [ ] **Step 2:** `pnpm vitest run deploy` and `pnpm test:e2e:clean -- mcp-oauth` → FAIL.
- [ ] **Step 3:** Port from `spike/502-mcp` with these changes: PB-backed store; CIMD-only clients; carry `req` in both forms and skip query validation in `load` when `client_id` is absent (spike finding 3); `pattern={'[0-9]{6}'}`; plain forms, no `enhance`, so the final 303 is a real navigation; login uses a fresh `createPb()` so no web session cookie; authorize page copy: heading `Connect {appName} to Waypoint`, sub `Sign in with your email code. {appName} will see your trips the way you do.`; token responses `cache-control: no-store`. Strip all spike `log()` calls; log only errors.
- [ ] **Step 4:** Re-run → PASS. Then the one check the preview can't do: `pnpm build && PORT=3000 PROTOCOL_HEADER=x-forwarded-proto HOST_HEADER=host node deploy/server.mjs`, `curl -s -XPOST localhost:3000/oauth/token -d grant_type=refresh_token` → JSON `invalid_grant` (not 403); same with `-H 'Origin: https://evil.example'` → 403.
- [ ] **Step 5:** 375px screenshot of `/oauth/authorize?...` (valid test-CIMD query) showing no A2HS banner.
- [ ] **Step 6: Commit** `feat(#502): OAuth 2.1 authorization server (CIMD, PKCE, email code)`.

### Task 4: MCP endpoint, trip gate, presentation, `list_trips`, Connected apps

**Files:**
- Create: `src/routes/mcp/+server.ts`, `src/lib/server/mcp/server.ts`, `src/lib/server/mcp/context.ts`, `src/lib/server/mcp/present.ts`, `src/lib/server/mcp/card-html.ts`, `src/lib/server/mcp/tools/list-trips.ts`, `src/lib/account/components/ConnectedApps.svelte`
- Modify: `src/routes/(app)/account/+page.server.ts` (load connections, `disconnect` action), `src/routes/(app)/account/+page.svelte`, `backend/pb_hooks/dev-auth.pb.js` (`/api/dev/seed-mcp-trips`), `package.json` (`@modelcontextprotocol/sdk` 1.32.1, exact)
- Test: `src/lib/server/mcp/present.test.ts`, `tests/e2e/mcp-tools.spec.ts`, `tests/e2e/connected-apps.spec.ts`

**Interfaces:**
- Consumes: Task 2 `lookupAccess`, `userPb`; Task 1 `ai_access`.
- Produces:
  - `context.ts`: `McpContext = { pb: PocketBase; user: { id: string; name: string }; now: Date }`; `TripRef = { trip: Trip; role: Role; memberId: string; open: boolean }`; `myTrips(ctx): Promise<TripRef[]>` (active memberships, newest start first); `resolveTrip(ctx, ref: string): Promise<TripRef>` (slug or id exact → else title/location_summary contains, case-insensitive; 0 → throws `No trip matching "<ref>" that you're a member of.`; >1 → throws `"<ref>" matches several trips: <title (start → end)>, …. Which one?`).
  - `present.ts`: `Card = { emoji: string; title: string; tag?: string; lines: string[] }`; `scrub<T>(v: T): T` (replaces email-shaped strings incl. `mailto:` with `[email removed]`, and any URL containing `/api/files/` with `[file removed]`); `result(heading: string, cards: Card[], extra?: Record<string, unknown>)` → `{ content: [{type:'text', text}], structuredContent, _meta }`, both scrubbed, cards capped at 50 with `+N more` appended to heading; `offTrip(trip: Trip)` → result with heading = title, one card with dates and the exact AI-off notice; `EMOJI: Record<ItemType, string>` (lodging 🛏️, flight ✈️, transportation 🚆, activity 🎟️, meal 🍽️, note 📝, checklist ☑️); `stripHtml(s: string): string`.
  - `server.ts`: `buildServer(ctx: McpContext): McpServer`; registers the card resource `ui://waypoint/cards.html` (`text/html;profile=mcp-app`) and every tool from `tools/index.ts`'s `TOOLS: ToolDef[]`, `ToolDef = { name; title; description; inputSchema: ZodRawShape; run(ctx, args): Promise<ToolResult> }`. Errors thrown by `run` become `isError: true` text results.
  - Seed `POST /api/dev/seed-mcp-trips` → `{ owner: { email }, traveler: { email }, viewer: { email }, outsider: { email }, trips: { current: slug, past: slug, off: slug, foreign: slug } }`. `current`: today inside it, 2 phases, a 3-night lodging, a flight with a code Document and one without, overlapping activities, an unbooked `requires_booking` item, a parking-lot idea with votes, a goal, an expense + settlement, a checklist with an open assigned task, day notes, a comment, a memory with thought **and** photo. `past`: last year, `Hotel Schweizerhof` in Lucerne (phase location `Lucerne`), a restaurant in Lisbon. `off`: `ai_access = false`. `foreign`: outsider-only. Email-shaped strings (see Review Focus 4) in every text field it creates.
  - Account `disconnect` action: `locals.pb.collection('mcp_connections').delete(id)` (cascade kills tokens).

- [ ] **Step 1: Write the failing tests:**
  - `present.test.ts`: `scrub` removes `Abby@Example.COM`, `mailto:x@y.io`, `<a href="mailto:a@b.co">`, a `/pb/api/files/abc/def/photo.jpg` URL; leaves `Hotel @ Lucerne` and `10:30` intact; `result` with 60 cards keeps 50 and heading ends `+10 more`.
  - `mcp-tools.spec.ts` (`describe('list_trips')`): owner sees current, past, off (tag contains `AI access off`), not foreign; viewer sees current with tag `viewer`; `tools/list` returns all registered tools with `readOnlyHint: true`; unauthenticated `POST /mcp` → 401 with `www-authenticate` containing `resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"`; `resolveTrip` ambiguity: `get_day({trip:'e2e'})` (matches all seeded) → `isError` text containing `matches several trips`.
  - `connected-apps.spec.ts`: after `connect(owner)`, account page lists `Connected apps` with the test client's name and `Last used`; clicking `Disconnect` removes it and the access token now 401s; a second user can't see or delete the first user's connection (PB API 404).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `/mcp`: bearer → `lookupAccess` → `userPb(userId)` → `buildServer` → `WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })`; non-POST → 405. `list_trips` card: emoji 🧭, title, tag = role (+ ` · AI access off`), lines: dates, `location_summary · slug`. `card-html.ts` from spike, unchanged except version string. ConnectedApps copy: section heading `Connected apps`; empty state `No AI assistants connected. Add Waypoint as a connector in Claude to ask about your trips.`; row: client name, `Connected <date> · Last used <relative>`, button `Disconnect`.
- [ ] **Step 4:** Re-run → PASS; `pnpm check`; 375px screenshot of `/account` with one connection.
- [ ] **Step 5: Commit** `feat(#502): /mcp endpoint, trip gate, list_trips, Connected apps`.

### Task 5: `get_trip` and `get_day`

**Files:**
- Create: `src/lib/server/mcp/tools/get-trip.ts`, `src/lib/server/mcp/tools/get-day.ts`, `src/lib/server/mcp/day-data.ts`
- Test: `tests/e2e/mcp-tools.spec.ts` (`describe('get_trip')`, `describe('get_day')`), `src/lib/server/mcp/day-data.test.ts`

**Interfaces:**
- Consumes: `resolveTrip`, `offTrip`, `result`, `EMOJI`.
- Produces: `resolveDate(tz: string, date: string, now: Date): string` ('today' | 'tomorrow' | 'yesterday' | YYYY-MM-DD → YYYY-MM-DD, trip-local); `loadDay(ctx, trip: Trip, date: string): Promise<{ day: Day | null; stays: Item[]; items: Item[]; notes: string }>` with `items` ordered by `orderDayItems` and stays from `spanningItemsForDate`; `dayCards(d): Card[]` (stays first, line `staying · night N of M` or `check-out` via `nightInfo`, time range, place, tag `booked`). Trip_brief (Task 9) reuses `loadDay` + `dayCards`.
- Tool inputs: `get_trip { trip: string }`; `get_day { trip: string, date?: string = 'today' }`.

- [ ] **Step 1: Write the failing tests:**
  - `day-data.test.ts`: `resolveDate('Europe/Zurich','tomorrow', new Date('2026-07-01T23:30:00Z'))` = `2026-07-03` (already the 2nd in Zurich); invalid tz falls back to UTC; `2026-07-05` passes through.
  - e2e `get_day`: current trip today: lodging card first with `staying`; untimed items after timed (spike finding 9 fixed by `orderDayItems`); last night's date shows lodging `check-out`; date outside the trip → structured `note: 'That date is outside the trip.'`, not `isError`; off trip → exactly the AI-off notice and no item titles.
  - e2e `get_trip`: phases with dates and location; one "where we sleep" card per night (`no lodging` when none); members by display name, no emails; goals with status from `deriveGoalStatus`; parking-lot ideas with vote counts; viewer gets the same content as owner.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5: Commit** `feat(#502): get_trip, get_day`.

### Task 6: `search` and `get_item`

**Files:**
- Create: `src/lib/server/mcp/tools/search.ts`, `src/lib/server/mcp/tools/get-item.ts`
- Test: `tests/e2e/mcp-tools.spec.ts` (`describe('search')`, `describe('get_item')`)

**Interfaces:**
- Consumes: `myTrips`, `resolveTrip`, `codesForItem` (`src/lib/documents/codes.ts`), `linked-expenses.ts`.
- Tool inputs: `search { query?: string, trip?: string, type?: ItemType, country?: string, from?: string, to?: string, status?: ItemStatus, booked?: boolean, min_cost?: number, max_cost?: number }` (at least one of query/filters required); `get_item { item: string }` (id from a search card).
- Search covers items (title, description, location), day notes, code Documents (`code_label`, `code_value`), expenses (description), goals (title, description) over open trips only. `country` (ISO-2) matches the item's phase `country_code`, else the trip's `countries`. **Never** suggestions/comments. Each card's tag = trip title; item cards carry `id: <itemId>` line so `get_item` can follow. Off trips skipped and listed in structured `skipped: [{ title, start_date, end_date, notice }]`. Cap 25 cards.
- `get_item`: full item, codes, comments (approved `suggestions` with `target_type = "comment"`, author display name), going / not going by name, votes, linked expenses. Item on an off trip → `offTrip`.

- [ ] **Step 1: Write the failing tests:** owner `search({query:'Lucerne', type:'lodging'})` returns `Hotel Schweizerhof` tagged with the past trip; `search({query:'restaurant', country:'PT'})` finds the Lisbon restaurant; searching the comment's unique text returns 0 cards; searching text only in the off trip returns 0 cards and `skipped` names the off trip; a search matching >25 results caps with `+N more`; `get_item` on the commented item includes the comment text and author name, the code value, `Going:` names; `get_item` of a foreign-trip item id → `isError`, no title leaked; viewer `get_item` works.
- [ ] **Step 2:** FAIL. **Step 3:** Implement (one PB query per collection, filters built with `pb.filter`). **Step 4:** PASS. **Step 5: Commit** `feat(#502): search, get_item`.

### Task 7: `get_money` and `audit_trip`

**Files:**
- Create: `src/lib/server/mcp/tools/get-money.ts`, `src/lib/server/mcp/tools/audit-trip.ts`, `src/lib/server/mcp/audit.ts`
- Test: `src/lib/server/mcp/audit.test.ts`, `tests/e2e/mcp-tools.spec.ts` (`describe('get_money')`, `describe('audit_trip')`)

**Interfaces:**
- `get_money { trip }`: balances by member name from `computeBalances`; who-owes-whom from `unitDebts` (unit labels as the Expenses page shows them); spend vs budget via `groupBudgetTotal`; spend by category; planned remaining via `remainingPlannedTotal`. Same inputs the `/expenses` and `/money` loaders use; no new arithmetic.
- `audit.ts`: `auditTrip(input: { trip: Trip; days: Day[]; items: Item[]; codeDocs: CodeDoc[]; tasks: Task[] }): AuditGap[]`, `AuditGap = { kind: 'no_lodging' | 'unbooked' | 'flight_no_code' | 'overlap' | 'unplaced_idea' | 'open_task'; title: string; date?: string; itemId?: string }`. Uses `spanningItemsForDate` (nights), `needsBooking`, `codesForItem`, `detectOverlaps`, parking-lot definition from `parking-lot-cards.ts`, `Task.checked`. Last trip day has no night. `audit_trip { trip }` renders one card per gap, grouped by kind, heading `What's missing`. 

- [ ] **Step 1: Write the failing tests:**
  - `audit.test.ts`: 4-day trip with a 2-night lodging on day 1 → one `no_lodging` for night 3, none for day 4; flight without code → `flight_no_code`; booked lodging not `unbooked`; two overlapping timed activities → one `overlap`; checked task absent.
  - e2e: `get_money` owner balances match the seeded expense split to the cent and the who-owes line names both members; viewer same figures; `audit_trip` on current lists the seeded unbooked item, the code-less flight, the overlap, the idea, the open task.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5: Commit** `feat(#502): get_money, audit_trip`.

### Task 8: `what_changed`, `get_lists`, `get_memories`

**Files:**
- Create: `src/lib/server/mcp/tools/what-changed.ts`, `src/lib/server/mcp/tools/get-lists.ts`, `src/lib/server/mcp/tools/get-memories.ts`
- Test: `tests/e2e/mcp-tools.spec.ts` (three describes)

**Interfaces:**
- `what_changed { trip, since: string }` (ISO datetime or `yesterday` / `last week`, trip-local): items, expenses, goals, memories, comments, tasks with `created >= since` (tag `added`, plus author name when the record has one) or `updated >= since` (tag `edited`). Heading notes deletions aren't tracked. First step verifies each collection has `created`/`updated` autodate fields; any without is left out and named in the tool description.
- `get_lists { trip }`: each checklist with its tasks, checked state, assignee name; open tasks first.
- `get_memories { trip, date?: string }`: memory `thought` text, day date, author name; `fields:` excludes `photo`; memories with only a photo are omitted.

- [ ] **Step 1: Write the failing tests:** `what_changed` with `since` = seed time minus 1 s lists the seeded item as `added`; after a PB edit to it, `since` = just before the edit lists it `edited`; `get_lists` shows the open task with assignee name; `get_memories` returns the thought, and the full output contains neither the photo filename nor `/api/files/`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5: Commit** `feat(#502): what_changed, get_lists, get_memories`.

### Task 9: `trip_brief`, posture text, isolation and role sweep

**Files:**
- Create: `src/lib/server/mcp/tools/trip-brief.ts`
- Modify: `src/lib/server/mcp/server.ts` (final `instructions`), every `tools/*.ts` description
- Test: `tests/e2e/mcp-isolation.spec.ts`

**Interfaces:**
- `trip_brief { trip?: string }` (default: the open trip containing trip-local today, else the next upcoming): composes `getNowViewState`/`current-phase` for where we are, `loadDay` + `dayCards` for what's next today, tonight's lodging with `location_address`, codes for today's and tomorrow's bookings via `codesForItem`. No new data logic.
- Descriptions: each says plainly what it returns. No prohibitions; the posture lives in `instructions`.

- [ ] **Step 1: Write the failing tests** (`mcp-isolation.spec.ts`), table-driven over every tool in `tools/list` with valid args for the current trip, plus `search` with several queries:
  - `no email in any output`: concatenated `text` + JSON of `structured` across all calls has no match for `/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i`.
  - `no photo in any output`: no `/api/files/`, no seeded photo filename, no `cover_image`/`avatar` keys.
  - `outsider`: every tool on the current trip → `isError` with `No trip matching`, no titles.
  - `off trip`: every trip-scoped tool → output equals `offTrip` (title, dates, notice), nothing else.
  - `viewer`: every tool succeeds.
  - `trip_brief` names tonight's lodging and its address, and today's next timed item.
- [ ] **Step 2:** FAIL. **Step 3:** Implement `trip_brief`, the instructions string from Global Constraints, the descriptions; update the spike `instructions` text everywhere it was copied; fix any leak at its source `fields:` list (not just by `scrub`). **Step 4:** PASS. Full `pnpm test:e2e:clean` and `pnpm vitest run` green; `pnpm check` clean.
- [ ] **Step 5: Commit** `feat(#502): trip_brief, posture text, isolation sweep`.

### Task 10: Release checks (hitl)

**Files:**
- Create: `docs/MCP_CONNECTOR.md` (member setup: add `https://app.vandenwarsen.com/mcp` as a custom connector on claude.ai → sign in with email code → in the connector's settings set every tool to **Always allow**; Disconnect lives in Waypoint account settings)
- Modify: `docs/DEPLOY_RUNBOOK.md` (post-deploy MCP smoke), `CONTEXT.md` only if a term shifted

- [ ] **Step 1:** Cloudflare zone check on `app.vandenwarsen.com` (spike finding 2): with Scott, confirm Bot Fight Mode / AI-crawler blocking don't challenge `/mcp`, `/oauth/*`, `/.well-known/oauth-*`; add a WAF skip rule scoped to those paths if they do. Verified by: Step 3's connect succeeding from claude.ai.
- [ ] **Step 2:** Merge `release/3.1` → `main` after the whole-branch review; **wait for Scott's word**, then deploy per `docs/DEPLOY_RUNBOOK.md`. Smoke: `curl -s -XPOST https://app.vandenwarsen.com/oauth/token -d grant_type=refresh_token` → `invalid_grant` JSON (not 403, not a Cloudflare challenge).
- [ ] **Step 3:** Scott and Abby, each with their own Claude account, add the connector on the web and use it from the iPhone app; ask the four grill examples (Lucerne hotel, tomorrow's flight, unbooked items, who owes whom); confirm cards render; Scott switches AI Access off on one trip and Claude reports it; Disconnect → next question fails. Record results in the release PR body.
- [ ] **Step 4:** Close #502 (and #412) on ship.

---

## Execution notes

- No new PB realtime, no new stack, no writes. If a task finds it needs one, stop: that's a departure from the grill.
- Task 3 depends on 2; Task 4 on 1–3; Tasks 5–8 on 4 and are independent of each other; 9 on 5–8; 10 last.
