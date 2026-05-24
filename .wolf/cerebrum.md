# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-05-22

## User Preferences

- **Session sizing**: Scott prefers sub-milestone-sized sessions. Full milestones hit compaction and degrade. Split early.
- **Commit granularity**: Commit at sub-milestone boundaries (M6a, M6b, etc.) with descriptive commit messages that list what changed. Scott uses git log as a progress tracker.
- **PR style**: Single PR per milestone, not per sub-milestone. Bundle all sub-milestones into one merge to main.
- **Review then fix**: When doing code review, present all findings with severity/priority first. Let Scott approve which to fix before touching code. Don't fix speculatively.
- **Batch fixes**: When Scott says "fix the recommended ones," implement all recommended fixes in a single pass, commit together.
- **Wolf metadata conflicts**: On merge conflicts in `.wolf/` files, just take either side — they're auto-generated and not worth manual resolution.
- **Direct action on "ok"**: When Scott says "ok [do X]", that's a green light. Don't ask for confirmation, just do it.

## Key Learnings

- **Project:** waypoint
- **Stack:** SvelteKit + TypeScript + Tailwind v4 + PocketBase, deployed to Fly.io with GitHub Actions CD
- **Milestone status (as of M6 merge):** M1-M6 complete. All 6 milestones merged to main.

### Google Places (New) API
- Session tokens for billing optimization go in the `X-Goog-Session-Token` HTTP header, NOT as a query parameter. Passing as `?sessionToken=...` causes each autocomplete+details pair to bill as two separate requests instead of one session.
- The autocomplete endpoint (`places:autocomplete`) accepts session tokens in the JSON body. The details endpoint (`places/{id}`) accepts them as a header.
- Field masks use `X-Goog-FieldMask` header, not query params.

### AeroDataBox (RapidAPI)
- Flight lookup endpoint: `https://aerodatabox.p.rapidapi.com/flights/number/{flightNumber}/{date}`
- Auth via `X-RapidAPI-Key` and `X-RapidAPI-Host` headers.
- Returns 404 for unknown flights — handle gracefully in UI.

### SvelteKit API proxy pattern
- External API keys must never reach the client. Proxy through `+server.ts` routes under `src/routes/api/`.
- Every `+server.ts` inside `(app)` group needs its own `if (!locals.user)` auth guard — layout guards don't protect standalone API endpoints.
- Always guard env var existence before using: `if (!env.API_KEY) error(503, 'Service unavailable')` — avoids non-null assertion crashes in envs where keys aren't configured.
- Remove `!` non-null assertions on env vars after adding guards. TypeScript narrows the type after the `if` check.

### Svelte 5 patterns
- `$effect` is the correct way to read `localStorage` on mount in Svelte 5. Runs client-side only, avoids SSR issues.
- For swipe/touch navigation, use `goto()` from `$app/navigation` instead of `window.location.href`. The latter causes a full page reload, losing SvelteKit client-side routing benefits.
- `$derived.by(() => { ... })` for multi-statement computations. `$derived(expr)` for simple expressions. Never `$derived(() => ...)` — stores a function, not a memoized value.
- `$state(expr)` where `expr` reads `$props` or `data` triggers `state_referenced_locally`. Wrap in `untrack(() => ...)`.

### Tailwind v4 design tokens
- Tokens defined in `@theme {}` block in `layout.css`. Tailwind v4 auto-generates utility classes from them.
- Custom breakpoints: `--breakpoint-md-desktop: 900px`, `--breakpoint-lg-desktop: 1280px`.
- Color tokens: paper, surface, surface-2, ink, ink-soft, ink-muted, line, moss, moss-soft, moss-tint, clay, gold, gold-tint, sky, sky-tint, clay-tint, error.
- Font tokens: sans (Inter), display (Fraunces), mono (JetBrains Mono).

### Form data validation
- `JSON.parse` on user-submitted form data (e.g., `location_coords`) must always be wrapped in try/catch. Return `fail(400, { error: '...' })` on parse failure.
- This applies to both create and edit server actions.

### Clone wizard
- Date inputs should prefill with source trip dates so users have a starting point. Empty date pickers are confusing UX.
- The `shiftDate()` approach for cloning: calculate offset between source and target start dates, apply to all phase/day dates.

### Responsive layout
- `AppShell.svelte` wraps trip routes with mobile/desktop breakpoint detection.
- Mobile: `BottomNav` for navigation, hides on input focus to avoid keyboard overlap.
- Desktop (900px+): `SideRail` for navigation.
- `FAB.svelte` uses safe area inset positioning for iOS notch devices.

### Print stylesheet
- `print.css` imported via `layout.css`. Hides nav, FAB, bottom nav. Shows main content full-width.
- `window.print()` triggered from More page button — no special route needed.

### E2E testing
- Playwright tests for M6 in `tests/e2e/m6-polish.spec.ts`.
- Dev login route: `GET /api/dev/login` — redirects to `/trips` with test user session.
- Use `.or()` for cross-test data flexibility, `.first()` when multiple elements match.

## Do-Not-Repeat

- [2026-05-22] **Don't use `JSON.parse()` on user-submitted form data without try/catch.** Malformed input crashes the server action with a 500. Always wrap in try/catch and return `fail(400)`. Found in both `items/new/+page.server.ts` and `items/edit/+page.server.ts`.
- [2026-05-22] **Don't use non-null assertions (`!`) on env vars in API routes.** If the key isn't configured, the request crashes. Guard with `if (!env.KEY) error(503, ...)` first, then use the narrowed type.
- [2026-05-22] **Don't use `window.location.href` for navigation in SvelteKit components.** It causes a full page reload. Use `goto()` from `$app/navigation` for client-side routing. Found in DayNav swipe handler.
- [2026-05-22] **Don't pass Google Places session tokens as URL query parameters.** The Places (New) API expects `X-Goog-Session-Token` as an HTTP header. Query param approach silently works but defeats session billing optimization — each request bills separately.
- [2026-05-22] **Don't leave form inputs without default values when source data is available.** Clone wizard date pickers were empty despite having source trip dates. Always prefill when the data exists.
- [2026-05-22] **Don't use `{@const}` outside block elements.** `{@const}` tags can only be direct children of `{#if}`, `{#each}`, etc. Use `$derived` in the script block instead.
- [2026-05-22] **Don't use `window.location.href` for `og:url` in SSR.** Use `page.url.href` from `$app/state` — works server-side and client-side.

## Decision Log

- [2026-05-22] **Google Places (New) API over legacy Places API.** The New API has per-field pricing (cheaper for autocomplete-only use cases), built-in session token support for billing optimization, and better TypeScript types. Trade-off: newer, less community documentation.
- [2026-05-22] **AeroDataBox via RapidAPI for flight lookup.** Chose over FlightAware (expensive) and OpenSky (limited commercial flight data). AeroDataBox has a free tier sufficient for v1 usage, good coverage of commercial flights. Trade-off: RapidAPI dependency, rate limits on free tier.
- [2026-05-22] **Proxy external APIs through SvelteKit `+server.ts` routes.** Keeps API keys server-side, allows adding auth guards, gives a stable internal API surface even if external APIs change. Trade-off: extra hop, but latency is negligible for user-triggered actions.
- [2026-05-22] **Single PR per milestone (not per sub-milestone).** Scott prefers reviewing and merging the complete milestone as one unit. Sub-milestones are committed separately for rollback granularity, but the PR bundles everything.
- [2026-05-22] **`AppShell` breakpoint at 900px for desktop layout.** Matches the `--breakpoint-md-desktop` design token. Below 900px: bottom nav + no side rail. Above 900px: side rail + no bottom nav. Chose 900px over 768px because the side rail needs enough width to not feel cramped alongside main content.
- [2026-05-22] **Trip cloning uses date offset approach.** When cloning, calculate the day difference between source start date and new start date, then shift all phase/day dates by that offset. Simpler than recalculating relative positions, preserves the exact trip structure.
