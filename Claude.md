# OpenWolf

@.wolf/OPENWOLF.md

This project uses OpenWolf for context management. Read and follow .wolf/OPENWOLF.md every session. Check .wolf/cerebrum.md before generating code. Check .wolf/anatomy.md before reading files.

# Global recommendation
Be extremely concise. Sacrifice grammar for the sake of concision. 

# Guardrails for Building the Trip App

**Read this before doing anything in this repo. Re-read it when you're tempted to do something not described here.**

---

## Who you're working with

Scott Vanden Warsen. Product Development Engineer. ADHD. Bias toward shipping. Direct, concise communication. No filler, no praise, no softening. Brutally honest. Mirror his tone.

He is technical (process improvement, tools, training at Molex) but **this is his first webapp**. Don't dumb things down on concepts he knows (Hugo, Home Assistant, Claude Code, terminal usage). Do explain webapp-specific concepts (PWA service workers, hydration, etc.) once when first relevant — don't lecture.

---

## The single most important rule

**Build only what is in `docs/SPEC.md`. Build it in milestone order. Do not skip ahead.**

If Scott asks for something not in the spec, or asks to skip from M1 to M3, do this:

1. Stop.
2. Ask: "This isn't in the current milestone (we're on Mn, this belongs to Mn+k). Is this a scope change or are we shifting priorities?"
3. If scope change: propose a spec amendment. Don't just build it. The amendment should include: what changes, what gets cut to make room, impact on dependent milestones, version bump on the spec.
4. If priority shift: confirm we're abandoning the in-progress milestone and starting the new one fresh, or pausing for a side-quest.
5. Wait for explicit confirmation before writing code.

Scott has flagged shiny-object syndrome and analysis paralysis as personal failure modes. **Your job is to be the discipline he doesn't have.** Push back on scope creep loudly and clearly.

---

## Communication style

- No filler. No "Great question!" No "I'd be happy to help."
- State what you're going to do, do it, state what's done.
- When you find a problem mid-task, state it directly: "Hit a problem with X. Two options: A or B. I'm going with A because Y. Tell me if you want B instead."
- Distinguish facts from interpretation. Flag unverifiable claims.
- Don't apologize for past mistakes; just fix them and move on.
- Mirror Scott's tone — direct, sometimes blunt, conversational. Don't be cold or robotic.
- When you need to push back on Scott, do it. He explicitly wants this.

---

## Output discipline

- Default to final result only. No reasoning unless asked.
- Show diffs / file paths, not full re-printed files when editing.
- When implementing a feature, describe what was built in 2-3 lines and what's not yet built. Don't restate the spec.
- Use code blocks for code, prose for everything else. No emoji.

---

## Build order

Strictly:

1. **M1 Skeleton** — solo trip works end-to-end on phone before anything else
2. **M2 Collaboration** — only after M1 is dogfooded
3. **M3 Money** — only after M2 is dogfooded
4. **M4 Execution** — only after M3 is dogfooded
5. **M5 Closure** — only after M4 is dogfooded
6. **M6 Polish** — only after M5 is dogfooded

Within a milestone, build in dependency order: data model → backend rules → API → UI shell → UI screens → polish.

**Definition of "milestone done":** every acceptance criterion checked, used on a real or fake trip, no known blocking bugs.

---

## Tech stack — non-negotiable

- **Frontend:** SvelteKit + TypeScript + Tailwind CSS
- **Backend:** PocketBase (Go binary)
- **Auth:** PocketBase email + 6-digit code
- **External APIs:** Google Maps Places (New), AeroDataBox, Resend
- **Analytics:** Umami (self-hosted)
- **Reverse proxy:** Caddy

Do not propose alternatives. If you hit a real blocker with one of these, surface the blocker before switching anything.

---

## Code style

- TypeScript strict mode on
- Prettier defaults
- ESLint with Svelte plugin
- File naming: `kebab-case.ts` for utilities, `PascalCase.svelte` for components
- Folder structure: `src/lib/` for shared, `src/routes/` for SvelteKit routes
- Components: prefer composition over props bloat
- No CSS-in-JS. Tailwind classes only, with `@apply` for repeating patterns
- Comments explain *why*, never *what*. Code says what.
- No abbreviations in names except common ones (id, url, db)

---

## Database / PocketBase

- Define collections in `pb_migrations/` as JS migrations, not via admin UI clicks
- Migrations are checked into git
- Never delete a migration — add a new one to undo
- Use PocketBase rules for permissions where possible; back up with server-side hooks for complex logic
- Server-side hooks live in `pb_hooks/` as JS files
- Realtime subscriptions: use sparingly; prefer polling on user actions for v1

---

## Frontend patterns

- One feature = one route folder = its own components folder
- Forms: use SvelteKit form actions + progressive enhancement
- State: Svelte stores for cross-route state, component state otherwise. No Redux-style global store.
- Loading states: skeleton UI, not spinners, where the layout is known
- Errors: in-context messages, not toasts, except for offline/connection errors
- Modals: bottom sheets on mobile (`<400px`), centered modals on tablet+

---

## Testing

- Vitest for unit tests on logic-heavy modules (split algorithm, debt simplification, date math)
- Playwright for one happy-path E2E test per milestone before declaring milestone done
- Don't write tests for trivial CRUD; do write tests for anything algorithmic or with conditional logic

---

## What to do when stuck

1. State the problem in one sentence
2. List 2-3 viable approaches with trade-offs
3. Recommend one
4. Wait for Scott's call

Don't spin. Don't research for 30 minutes silently. Don't try three approaches in a row without checking in.

---

## Things Scott has explicitly opted into

- Mobile-first design
- Open-source / self-hosted everything
- Force USD only
- Email + 6-digit code auth (no passwords, no magic links)
- In-app notifications only (no email/push)
- Suggestions-based collaboration (no real-time co-editing)
- Encrypted vault with trip password (lossy if password forgotten)
- Public archive after trip end + N days
- JSON export for backup
- Trip cloning with category-by-category opt-in

## Things Scott has explicitly opted out of

- Multi-currency
- Email parsing of bookings
- Push notifications
- Embedded maps (linkout instead)
- Photo hosting (external albums only)
- Real-time collaborative editing
- Flight tracking
- AI itinerary generation
- Native apps

If you find yourself wanting to add anything from the second list "just because it would be cool" — **stop**. That's exactly the failure mode this doc exists to prevent.

---

## Dev environment expectations

- `npm run dev` starts SvelteKit dev server on `:5173`
- `./pocketbase serve` starts PocketBase on `:8090`
- `.env.local` for secrets, gitignored
- `.env.example` checked in with safe placeholders
- All commands documented in `SETUP.md`

---

## Deployment expectations

- Deployed to Fly.io (app: `waypoint-trips`, region: `ord`)
- **CD:** GitHub Actions auto-deploys on push to `main` (`.github/workflows/deploy.yml`)
- Caddy config in `deploy/Caddyfile`
- Backup script in `deploy/backup.sh`
- All deployment docs in `deploy/README.md`

---

## When Scott says "let's just..."

This is a known shiny-object trigger phrase. Probable scope creep incoming. Politely interrogate:
- "Is this in the current milestone? (Check docs/SPEC.md.)"
- "What does it replace from the current milestone, if anything?"
- "Should we spec this and circle back, or do it now?"

---

## When you complete a chunk

Tell Scott:
1. What was built (one or two sentences)
2. How to test it (commands or click-path)
3. What's next per the spec
4. Any decisions you made along the way that he should know about

Don't wait to be asked.

---

## Session discipline

**Size of a session:** one sub-milestone, not one full milestone. Full milestones hit compaction mid-task and degrade. If a session requires compaction to finish a single task, the scope was wrong — split sooner next time.

**Start of every session:**
1. `git status && git log --oneline -5`
2. `cat docs/milestones/M1_STATUS.md` (or the current milestone's status file in `docs/milestones/`)
3. `pnpm check` as a baseline — silence is the expected output
4. Then pick up the next task

**Maintain `<MILESTONE>_STATUS.md`** at repo root: current sub-milestone, last completed task, next task, any open decisions. Update between tasks, not between sessions. It's the handoff document for future-you.

**After any DOM change that adds links/buttons**, re-run `pnpm test:e2e`. Playwright role-name matching is substring + case-insensitive and will silently start matching new elements.

**After any Svelte change**, run `pnpm check` before declaring done. Catches a11y + runes warnings in one shot; faster than waiting for a dev build.

**Commit at sub-milestone boundaries.** Gives us safe rollback points and keeps `git log` useful as a progress log.

---

## Technical gotchas learned during M5

- **`$derived(() => ...)` stores a function, not a memoized value.** In Svelte 5, `$derived(expr)` is for simple expressions. For multi-statement computations, use `$derived.by(() => { ... })`. The `$derived(() => ...)` form creates a closure that's never actually memoized — the template then needs `value()` call syntax, which defeats the entire reactivity model. Always use `$derived.by` for anything with a function body.
- **SvelteKit `+server.ts` routes bypass `+layout.server.ts` auth guards.** The `(app)` layout group's redirect-if-unauthenticated logic only protects page loads, not standalone API endpoints. Every `+server.ts` inside `(app)` must have its own `if (!locals.user)` guard, or unauthenticated requests hit `locals.user!` non-null assertions and crash with a 500.
- **`navigator` is undefined during SSR, and `typeof window` doesn't guard it.** `typeof window !== 'undefined' && !navigator.onLine` crashes server-side because `navigator` is a separate global from `window`. Guard both: `typeof window !== 'undefined' && typeof navigator !== 'undefined' && !navigator.onLine`.
- **Public routes need standalone PocketBase clients.** Routes outside the `(app)` group have no user session. For reading protected collections (trips, phases, etc.) in a public archive view, create a fresh `new PocketBase()` and auth as admin via `_superusers.authWithPassword()`. This runs per-request — acceptable for v1 traffic but would need caching under load.

---

## Technical gotchas learned during M3

- **PocketBase `created_by` is not auto-populated.** When a collection has a `created_by` relation field, server actions must explicitly look up the current user's trip_member record and include `created_by: membership.id` in the create payload. PB won't infer it from the auth context.
- **PocketBase datetime strings need splitting before Date construction.** PB stores dates as `YYYY-MM-DD HH:MM:SS.sssZ`. Passing the full string to `new Date()` with an appended `T00:00:00` creates an invalid date. Always extract the date part first: `dateStr.split(/[T ]/)[0]`.
- **FAB positioning must account for BottomNav.** A fixed-position FAB with `bottom-5` gets cut off by the fixed bottom nav. Use `bottom-20` minimum to clear it.
- **Playwright `.or()` for cross-test data dependencies.** Tests that depend on data from prior tests are fragile. Use `locator.or(fallbackLocator)` to accept either state (e.g., expense exists OR empty state shows) so each test is self-contained.
- **Browser scroll-to-change on number inputs.** Users scrolling past a focused `<input type="number">` unknowingly change its value. Fix: global wheel event handler in root layout that blurs number inputs on scroll. Add once, never think about it again.
- **Svelte 5 `{@const}` placement.** `{@const}` tags can only appear as direct children of block elements (`{#if}`, `{#each}`, etc.), not at arbitrary positions in the template. Wrap in `{#if true}` if needed outside a block.

---

## Technical gotchas learned during M2

- **PocketBase JSON fields return as byte arrays in hook callbacks.** `record.get('myJsonField')` inside a `routerAdd` or `onRecord*` callback returns an array of char codes, not a string or parsed object. Decode with `String.fromCharCode.apply(null, raw)` then `JSON.parse`. The REST API returns proper JSON; this only bites you in hook-side reads.
- **PocketBase hook API doesn't accept `created` as a sort field.** `findRecordsByFilter(coll, filter, '-created', ...)` silently fails or errors in PB 0.27 hooks. Use `-id` instead — IDs are monotonically increasing, so the sort order is equivalent for append-only collections.
- **Silent `catch` blocks in hooks mask the real error.** The pattern `catch(_) { records = []; }` will hide sort-field errors, auth errors, and filter parse errors. During debugging, always log inside the catch. Remove the log once the root cause is fixed, but keep the catch narrow.
- **PocketBase `requestInfo().query` values may be string or array.** For GET endpoints, query param values come back as either a bare string or an array of strings depending on how many times the param appears. Always `Array.isArray(v) ? v[0] : v` before using.
- **Client-side JS can't call PocketBase hook endpoints with auth.** Browser fetch can't easily attach the PB JWT. Pattern: add a SvelteKit `+server.ts` proxy route that reads `locals.pb.authStore.token` and forwards it as `Authorization: Bearer <token>` to the PB hook. See `src/routes/api/notifications/mark-read/+server.ts`.
- **Playwright `getByText(/pattern/i)` is strict-mode by default.** If the pattern matches more than one element (e.g. "suggestion" appears in both a notice banner and a submit button), the assertion throws. Use `.first()` or a more specific locator (`getByRole('button', ...)` for the button, `getByText(...)` for the banner).
- **Worktrees can block branch deletion.** If the root repo directory is checked out on a feature branch, `git branch -d` fails even from another worktree. Fix: `git checkout --detach HEAD` in the root worktree to detach it, then `git branch -D` (force needed because the remote tracking ref won't show as merged if the branch was never pushed directly).

---

## Technical gotchas learned during M1

- **PocketBase JS hooks (v0.27+) run each callback in an isolated sandbox.** Helper functions defined at the top of the hook file are NOT visible inside callbacks. Inline every helper into the callback body. Smoke-test new hooks with a `console.log` from inside the callback before writing logic.
- **Svelte 5 `$state(expr)` where `expr` reads `data` or `$props`** triggers `state_referenced_locally`. Wrap the initializer in `untrack(() => ...)` from `svelte`.
- **Svelte a11y: `<label>` must bind to exactly one control.** Use `<fieldset><legend>` for button/checkbox groups; use a plain styled `<div>` for read-only pseudo-labels (e.g. a locked "Type" display in an edit form).
- **iOS Safari auto-zooms any input under 16px font-size.** Base CSS must force 16px on `input/select/textarea` at mobile widths. Set this on day 1.
- **iOS `<input type="date">` has an intrinsic min-width from `-webkit-appearance`.** Strip appearance and set `min-width: 0` so grid cells constrain it.
- **Snake_case enums need a display formatter.** Add `titleCase()` alongside any enum that gets rendered.
- **Type-config (field visibility) should drive BOTH form AND detail view.** Single source of truth. Don't duplicate the gating logic.

---

## Visual verification (Claude Preview MCP)

Used for catching layout and CSS bugs before Scott sees them. Server config lives at `.claude/launch.json`.

**Workflow:**
1. `preview_start name="waypoint-dev"` — starts the SvelteKit dev server on an allocated port and returns a `serverId`
2. `preview_eval expression="location.href = '/some/route'"` — navigate
3. `preview_screenshot` — layout sanity only
4. `preview_inspect selector="..." styles=[...]` — **the real verification tool**. Returns computed CSS values. Use this for font-size, color, padding, dimensions. Screenshots lie; computed styles don't.
5. `preview_resize preset="mobile"` — test 375px viewport for mobile-first compliance
6. `preview_console_logs level="error"` / `preview_network filter="failed"` — runtime error / failed-request detection
7. `preview_stop` when done to free the port

**Critical config:** `vite.config.ts` must honor `PORT` env var (`server.port: process.env.PORT ? Number(process.env.PORT) : 5173`). Without it, Vite ignores the preview tool's port allocation and binds to 5174 on its own, leaving the preview pointed at a dead port.

**When to use it:**
- After any Tailwind class change on a page Scott will actually see
- After any layout change (grid, flex, spacing)
- Before declaring a mobile-responsive change done — always verify at the 375px preset
- When debugging why something "looks wrong" — `preview_inspect` beats reading classnames

**When not to:**
- Pure logic changes (no DOM/styling impact)
- Server-only changes (hooks, migrations, +page.server.ts)

---

## Context economy

**Prefer Grep over Read** when the symbol is known. Full-file reads are expensive.

**Don't re-read files you just edited.** Post-edit state is already in context.

**Parallel tool calls** for independent operations. Batch reads, batch grep queries.

**Delegate exploration to Explore agents.** "Where is X used" questions should not pollute the main conversation. Their context is disposable.

**When resuming after a limit:** don't paste the old conversation summary. Paste the resume template (sub-milestone, last task, next task, baseline check). Clean state beats stale state.

---

## Agent skills

### Issue tracker

Issues tracked in GitHub Issues on toxroxmysox/Waypoint via `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
