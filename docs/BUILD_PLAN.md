# Waypoint — Sequenced BUILD Plan (2-Week Attack)

> **Date:** 2026-06-21 · Canonical model: `docs/CAPABILITY_MAP.md` (8 core + 2 enabling).

## How to use this

This is a **queue, not a calendar.** Sessions are numbered globally (S1, S2, …) and ordered by **leverage × dependency × cheapness** — pick up the lowest open number whose blockers are clear, not "today's date." **One issue or one PR per session;** planning and execution are *separate* sessions (a feature's grill and its build never share a session). Ceremony per `CLAUDE.md`: **bug** → PR · **enhancement** → plan-optional → PR · **feature** → grill → plan → exec → PR · **research** → ADR (no PR) · **refactor** → plan → PR. Tracer-bullet vertical slices beat IA-polish. `afk` sessions run unsupervised; `hitl` needs human checkpoints. **Board reality (2026-06-21): only 4 issues are OPEN (#259, #236, #111, #97).** Every other number below (#228/#229/#230/#118/#239/#166/#202) is a **closed decision-record (ADR), not grabbable work** — so each decided-but-unbuilt build gets a *fresh* issue cut via the `to-issues` skill before its session (see S2). Don't try to "grab" a closed issue.

## Sequencing principle

Order = **leverage × dependency × cheapness**, hard gates respected:

1. **Cheap-high-leverage first.** A 30-min docs rewrite that stops every future session re-reading lies, and a one-page ADR that unblocks a class of work, beat any feature. Pay them down first — but **time-box them** (the owner over-builds systems; don't let meta-work become the work).
2. **Aim the "build a lot" urge at the 🔴 gaps, not the mature 🔵 frontier.** The three gaps — **Onboarding, date-finding wedge, Trip Memory** — and the one live **Money correctness bug (#259)** outrank IA consolidation and frontier slivers on 🟢 trunks. Don't strip-mine the frontier.
3. **Respect data-model + ADR prerequisites.** *ADR-accepted ≠ shipped.* The date-wedge is **hard-blocked** on a `forming` soft-trip migration (`trips.start_date/end_date` are `required:true` today — verified `0002_trips.js:12-13`). Money Units, Paid-Moment, and codes→Documents are all decided-but-unbuilt. Sequence the unblocker before the feature.
4. **AI posture decided (ADR-0017, Accepted 2026-06-22); the six surfaces are DEFERRED.** AI *assists over owned data, never generates the trip*; on/off is **per-trip, per-feature, opt-in**; runtime (local vs cloud) **left open to a future grill**. The six assist surfaces are **not a priority — collectively deferred**, no AI work scheduled. **Email Digest (S15) is NOT gated on AI.**
5. **Never run two planning-only sessions back-to-back.** Interleave a cheap **code-win** (Goal→"Plan this", or the open #236 bug) between grills/ADRs so the session ledger keeps shipping. Momentum is the thing the owner actually asked to maximize.
6. **Split a one-line bug fix from the strategic decision it touches.** #259 is a *live* settle-up data bug; make only the *narrow* disposition call it needs and ship it — don't let it wait on the full two-axis Money model.
7. **Keep FLEX explicit.** The homepage question is an **open decision inside the Onboarding grill**, not pre-bound in code. The recommendation (lifecycle hero-band on the existing trip-home page) is a reversible swap.

---

## SPEC_BACKLOG disposition

`docs/SPEC_BACKLOG.md` is ~70% fossil — it's organized by the old `CONTEXT.md` contexts the Map supersedes, and most of it describes shipped work. **Rewrite it capability-indexed** (one section per L1, mirroring `CAPABILITY_MAP.md`), keeping only genuine frontier. Every cut below is verified on disk.

| Item | Disposition | Evidence / Note |
|---|---|---|
| Item Voting UI (#30) | **CUT** | `VoteStacks` / `VoteCountPill` / `GhostCard` shipped |
| Swipe-Quiz Voting Experience | **CUT** | `SwipeDeck.svelte` + `/trips/[slug]/swipe` route shipped |
| Item ↔ Expense two-way nav (#128) | **CUT** | `src/lib/money/linked-expenses.ts` shipped |
| Tasks domain (whole section) | **CUT** | ADR-0003 built it: `checklists`/`tasks`, migration 0030, #45/#52 — pre-ADR fossil |
| Documents S3/S4/S5 (#73/#72/#74) | **CUT** | all closed; `DocumentLightbox.svelte` exists |
| Vault retirement (#69) | **CUT** | done; migration 0031 |
| App Icon Refresh (#38) | **CUT (verify-pass)** | likely done (regenerated PNGs); confirm in the sweep, then delete |
| Flight timezone capture | **CUT (verify-pass)** | `start_tz`/`end_tz` fields exist; confirm `handleFlightSelect` persists, then delete |
| Collaboration polish batch | **REFRAME** | split: keep invite-resend / role-downgrade / edit-approve; park dogfood-driven ones |
| Trip Mode v4 concepts | **REFRAME** | mostly absorbed (#166/#211); keep at most Day-Wrapped Stats |
| P3 polish batches | **REFRAME** | collapse to one "pull opportunistically" pointer |
| Off-the-table list | **REFRAME** | make it a *pointer to `charter.md`*, not a 4th drifting copy |
| Trip Memory PRD (ADR-0007) | **KEEP** | firm, shelved → re-home under Records & Archive |
| codes→Documents (ADR-0016) | **KEEP** | accepted, unbuilt → Documents |
| Receipt-on-expense (3rd Document scope) | **KEEP** | Documents/Money |
| Weather · Calendar webcal · Email Digest | **KEEP** | Integrations (*elevate Email Digest*) |
| Maps deep-link | **KEEP (verify-first)** | confirm 🟢 coverage before scheduling |
| Goal → "Plan this" pathway | **KEEP** | Itinerary — strong early filler |
| swipe-completion notif · phase-exit sweep (T-1) | **KEEP** | Group Input / Trip Execution |
| IA merges (Plan/Money/Today) · Tri-State Booking Pill | **KEEP (low)** | post-gap, dogfood-driven |
| "Decided against" one-liners (multi-currency, archive-memory) | **KEEP** | preserve the rejection record |

**Rewrite tactic (S1):** ship the capability-indexed rewrite using the *already-confirmed* cuts now (~30 min). Do **not** let the verify-then-delete items (flight-tz persistence, maps coverage, collab-polish triage, app-icon) gate it — spin those into a later cleanup pass.

---

## The plan

### Wave 0 — Pay down the debt (cheap, unblocks every later session)

**S1. Rewrite SPEC_BACKLOG → capability-indexed** — docs · Platform · firm
**Why:** Stops every future planning session re-reading stale "v4 target" noise; mirrors the canonical Map. ~30 min.
**How:** Docs only, no PR ceremony. Use confirmed cuts (table above); defer the verify-then-delete sweep. No blockers.
**Ref:** `docs/SPEC_BACKLOG.md` (target) · `docs/CAPABILITY_MAP.md` (index to mirror)

**S2. Cut fresh BUILD issues for the decided-but-unbuilt work** — process · Platform · firm
**Why:** The board has 4 open issues; the ADRs (0007/0014/0015/0016) and Onboarding/#259 are decisions, not grabbable tickets. The "one issue per session" rule has nothing to attach to until these exist. **This is the single biggest operational gap.**
**How:** Run the `to-issues` skill once to slice: Onboarding build, #259 split_data fix, Paid-Moment substrate+affordance, Money Units, codes→Documents, Trip Memory, date-wedge slices. Label each `afk`/`hitl` + capability. No PR. No blockers (do alongside S1).
**Ref:** ADR-0007/0014/0015/0016 · `#111` (Onboarding, already open) · `#259` (already open)

**S3. AI-assist posture ADR** — research · Integrations (enabling) · ✅ **DONE (#264, ADR-0017 Accepted 2026-06-22)**
**Why:** Posture before any AI surface; draws the assist-vs-generate line + the control model. **Outcome:** AI *assists over owned data, never generates*; on/off **per-trip, per-feature, opt-in**; **runtime left open** to a future grill; the six surfaces are **deferred** (no AI work scheduled).
**How:** Research → ADR-0017, no PR. Shipped.
**Ref:** `docs/adr/0017-ai-assist-posture.md`

---

### Wave 1 — Onboarding + the front door (the NOW gap)

**S4. Onboarding thin-slice — GRILL (incl. homepage FLEX branch)** — feature(grill) · People & Membership → Onboarding · flex
**Why:** Council's unanimous NOW pick; a 🔴 gap; highest activation leverage (a stranger currently lands on a bare planning tool). **Cheap** — it *stitches shipped parts* (`/join/[token]` already redirects to `/trips/[slug]`; `/claim`, `/goals`, `/swipe` all exist), not greenfield. It also forces the homepage fork, so it must precede any landing-target commit.
**How:** grill → plan (session 1 of 2). Resist #111's "wizard" framing (the issue is literally titled *wizard*). Fuse the first-timer hero with the trip-home decision. Open code in S5, not here.
**Ref:** `#111` (OPEN)

**S5. Onboarding thin-slice — EXECUTE** — feature · People & Membership → Onboarding · firm
**Why:** Wire join/claim → oriented trip home → **one** "first contribution" CTA → add a per-member onboarding-complete signal (verified: **no such signal exists anywhere today** — net-new).
**How:** exec → PR (session 2). **Blocked by S4.** `hitl`. **First-contribution CTA targets `/goals` (capture), not `/swipe`** — a brand-new trip has no seeded swipe candidates, so the deck would be empty. Run `pnpm test:e2e` after (adds links/buttons).
**Ref:** `#111` + fresh build issue from S2

---

### Wave 2 — Money correctness (the one live bug, decoupled from strategy)

> Rebalanced: **only #259 carries week-1 urgency** (a live data bug). Paid-Moment and Money Units are decided-but-unbuilt enhancements on a working 🟡 trunk — they run **after / parallel to** the date-wedge (Wave 3), not ahead of it.

**S6. Narrow #259 disposition call** — research(scoped) · Money ∩ People · firm
**Why:** The #259 fix needs exactly one product decision: **on reassign, does the departed member's split-share move to the reassign target, or stay a historical fact on the tombstone?** That determines what the fix *writes*. Make *only* this call now — do **not** block the fix on the full two-axis ADR.
**How:** Scoped decision (one-liner amending ADR-0015's surface). No code. No blockers.
**Ref:** `#259` (OPEN) · ADR-0015

**S7. Fix #259 — departed member orphaned in `split_data`** — bug · Money ∩ People · firm
**Why:** **Verified live correctness bug:** `members.pb.js:538-551` reassign rewrites `expenses.paid_by`/`created_by`, settlements, `items`, etc. — but **never touches `split_data`**, so a departed member stays embedded in expense splits and `debt-simplify` reads a ghost. Wrong balances today.
**How:** bug → PR. **Blocked by S6.** Hot path is the goja sandbox (`members.pb.js`) — **inline all helpers; watch the DateField-truthy scar** (use `getString` for truthiness). Verify settle-up on `pnpm test:e2e:clean`.
**Ref:** `#259` (OPEN)

**S8. Full two-axis Money model ADR (participation × unit)** — research · Money · firm
**Why:** Money Units (S10) must not bake a whole-group-split assumption. The two axes — **unit** (settlement collapse) and **participation** (split membership) — stay independent; conflating them re-creates Splitwise friction. Runs **parallel** to the date-wedge; only S10 truly needs it.
**How:** ADR amend (extends 0015). No code. No blockers (S6 is the subset already decided).
**Ref:** ADR-0015 · fresh issue from S2

**S9. Paid-Moment affordance + prefilled add-expense** — feature · Money · firm
**Why:** #228/#229 closed as ADR-0014 **decisions** — *no code shipped* (verified: no `Log payment` string, no `initial*` props). Build the #228 URL-param/prefill **substrate** first, then the #229 affordance on top. "Paid" is derived from the linked-expense predicate.
**How:** plan → PR (design pre-grilled by ADR-0014, no new grill). Substrate before affordance. Runs after/parallel to the wedge.
**Ref:** ADR-0014 · fresh issues from S2 (#228/#229 are closed)

**S10. Money Units collection + debt-simplify unit-aggregation** — feature · Money · firm
**Why:** ADR-0015 decided, **code not shipped** (verified: no `money_units` collection, no unit pre-aggregation). New trip-scoped unit **referencing `Member`** (never a second member store); defined-unit preset rides the S9 prefill.
**How:** plan → PR. **Blocked by S8 + S9.** Settle-up math change → verify on `pnpm test:e2e:clean` before deploy.
**Ref:** ADR-0015 · fresh issue from S2

---

### Wave 3 — Soft-trip prerequisite + the date-finding wedge (the headline bet)

> **Start this in week 1, in parallel with Onboarding execution.** It's the 🔴 headline gap and council's biggest opportunity; its dependencies (the `forming` migration, the join flow) *are* week-1 work, so it can run alongside — don't let it sit behind the Money wave.

**S11. `forming` lifecycle state — soft-trip GRILL** — feature(grill) · Itinerary (data prereq) · flex
**Why:** **KEYSTONE unblock for ALL of Ideation.** Today the schema *forbids* a dateless trip (`0002_trips.js:12-13`, both dates `required:true`; no `status`/lifecycle field exists). The date-wedge ("the poll is the invite") by definition starts *before* dates exist.
**How:** grill → plan. Grill the state machine: `forming → dated`; what's allowed in `forming`; nav/empty-state; does "active" still defer to `isTripActive` (located in **`src/lib/trip-mode/activation.ts`**). **Append-only migration, never delete** (CLAUDE.md PB rule).
**Ref:** `backend/pb_migrations/0002_trips.js:12-13` · fresh issue from S2

**S12. `forming` migration + minimal forming UI — EXECUTE** — feature · Itinerary · firm
**Why:** Relax the NOT-NULL behind a lifecycle status; build the `forming → promote-to-dates` hand-off (the "pre-trip soft-commit" open seam).
**How:** exec → PR. **Blocked by S11.** Append-only.
**Ref:** fresh issue from S2

**S13. Date-finding wedge — Availability data-model GRILL** — feature(grill) · Ideation → When + availability · exploratory
**Why:** Council **headline**; biggest greenfield. Availability is a **4th mechanism** (member × date-range → yes/maybe/no overlap) — explicitly **NOT** a Vote, **NOT** a reskin of `votes`/`goal_votes`/`suggestion_votes` (kept separate per ADR-0004/0009). New collection + range-overlap aggregation where **"maybe" is a first-class third value.** **HARD LINE: ranks GROUP candidate windows, never auto-suggests destinations** (charter: no AI-generated itineraries).
**How:** grill → plan. **Blocked by S11/S12 (forming).** **Integrates with** Onboarding (the poll *is* the join surface) but is **NOT blocked by it** — the collection/heatmap/promotion build fine against a `forming` trip without the onboarding hero, so the two big bets overlap. Grill **only** the data-model + aggregation semantics here; split the UI/promotion into their own slices (S14) so week-2 `afk` sessions don't thrash.
**Ref:** `CAPABILITY_MAP.md` §1 · fresh issues from S2

**S14. Date-finding wedge — slices EXECUTE (afk, week 2)** — feature · Ideation → When + availability · exploratory
**Why:** Availability collection → paint-the-grid heatmap UI → winning-window one-taps into real dates (the `forming → dated` promotion).
**How:** exec → PR **per slice** (collection / heatmap / promotion as separate issues). **Blocked by S13.** `afk`-able in week 2 — but the **mobile (375px) visual-verification gate still applies** (paint-the-grid heatmap is non-trivial on a phone; an afk agent must still hit the preview check).
**Ref:** fresh issues from S2

---

### Wave 4 — Re-engagement + Trip Memory (parallelizable second bets)

**S15. Email Digest Phase 1 — cron'd "what changed" diff** — feature · Integrations (enabling) · flex
**Why:** The Map's "highest-leverage absence" vs the non-technical-friend bar. Push is off-the-table, so **email is the only re-engagement lever.** Phase 1 has **no AI dependency** — a dumb structured diff.
**How:** light grill (cadence / content / opt-out) → plan → PR. **Confirm the scheduled-trigger mechanism exists in the grill** — Resend (outbound) is shipped, but the *cron* infra for outbound digests is unstated; don't let Phase 1 stall on missing scheduling plumbing. **Structured writes only** (reply-to-thread is off-table). **NOT gated on AI** (ADR-0017): the digest ships independently. Tokenized one-tap write-back is a later structured-writes phase; any *optional* AI narration would just be one more per-trip AI feature toggle — but the digest never waits on AI.
**Ref:** fresh issue from S2

**S16. Trip Memory — `memories` collection + capture/review surfaces** — feature · Records → Trip Memory · firm
**Why:** De-risked 🔴 gap: PRD grilled, ADR-0007 accepted, **no `memories` collection exists** (verified). The **DB-enforced cap** (one photo + one thought per member per day, unique `(day, author)` index) *is the whole personality* — it's what keeps this from becoming Apple Photos.
**How:** **SKIP grill** (PRD pre-grilled) → SPEC amend → `to-issues` → exec → PR. Keep author **USER-resolvable** (so the Crew moonshot stays additive). Add a capture door to the Trip Execution Add workflow. **`heic.ts` does NOT exist** — HEIC transcoding is its *own* slice, not a free pull.
**Ref:** `docs/TRIP_MEMORY_PRD.md` · ADR-0007 · fresh issues from S2

**S17. codes → Documents migration (ADR-0016)** — refactor · Documents · firm
**Why:** ADR accepted, **unbuilt**; codes still live on `items.confirmation_codes`, **read across 26 files** (verified — incl. export/portability/clone/import). Correctness-neutral plumbing, low urgency.
**How:** plan → PR, **split into 3 sub-PRs** (a 26-file repoint is too big for one session): (1) append-only migration + new code object + backfill; (2) repoint readers capability-by-capability; (3) leave `items.confirmation_codes` inert. Touches export/portability → needs `pnpm test:e2e`.
**Ref:** ADR-0016 · fresh issues from S2

---

### Wave 5 — Frontier fillers & quick-wins (pull opportunistically — do NOT preempt gap work)

Single-session each; use them as the **code-wins interleaved between early grills/ADRs** (Principle 5). They must not jump ahead of the 🔴 gaps.

- **Goal → "Plan this" → `items/new?goal={id}`** — enhancement → PR · Itinerary. Closes the "goals rot as wishes" seam. **The standout early filler** — a fast tracer-bullet code win to slot between S1–S8 grills.
- **Save-bar float bug (#236)** — bug → PR · already **OPEN**, `hitl`. Verify at 375px. Cheap code-win between planning sessions.
- **Anticipation countdown component (in-app only)** — enhancement → PR · Platform. *(Moved out of Wave 1 — it's presentational polish with zero gap/correctness value; Principle 2 says don't prioritize it over the live bug and the gaps.)* Reuse premise holds (`src/lib/shell/format.ts` + `now-state.ts`), but **dedup-check `ContextRail.svelte` first** (it already does context-rail time work). Build once, consume twice (trip-home hero + `/trips` Upcoming card). Charter-safe (never push).
- **Self-leave UI** — enhancement → PR (backend exists, ADR-0008) · `/trips` Upcoming countdown line (rides the countdown component) · receipt-on-expense 3rd Document scope · status-tag legibility polish · **Weather** (Open-Meteo) · **Calendar webcal** feed · swipe-completion notification (4th notif type).

**DEFER beyond the window:**
- Ideation **Where** (after **When** proves the engine) · polymorphic `comments` extraction + swipe-comment pathway · IA merges (Plan / Money / Today) · Plan Health · decision-provenance record.
- **Crew / cross-trip Living Record (D1 trip→account)** — **PARKED. Biggest scope-creep risk.** Do *clone-carries-roster* first as the cheap demand test before unparking.

---

## Decision points / kept-flexible

1. **Homepage FLEX (owner-flagged)** — dedicated trip/app HOMEPAGE vs reuse Itinerary-as-home. **Resolve inside the Onboarding grill (S4), not standalone — and don't pre-bind it in code.** Council recommendation: **neither pole** — a lifecycle-aware **hero band** swapped on the existing trip-home page (`/trips/[slug]/+page.svelte`, the shipped #239 Overview surface): pre-trip countdown + next-action + first-timer hero; planning = as-is; active = thin band → `/now`; wrap-up banner already ships. Note: the **app-home half is already closed** — `/trips/+page.svelte` already buckets active/upcoming/past. So the open question is *only* the per-trip hero band, which is a reversible swap (not a new route).
2. **#259 narrow disposition (S6)** — does the orphaned split-share move to the reassign target or stay on the tombstone? **Decide this small thing fast and ship S7; don't wait on the full model (S8).**
3. **Two-axis Money model (S8)** — **unit** (settlement collapse) and **participation** (split membership) stay independent. Conflating them re-creates Splitwise friction. Blocks only Money Units (S10).
4. **`forming` state machine (S11)** — what's allowed in `forming`; the pre-trip threshold; does "active" still defer to `isTripActive` (`trip-mode/activation.ts`). Shapes the entire Ideation substrate.
5. **Availability mechanism (S13)** — confirm a **new collection**, NOT a reskin of `votes`/`goal_votes`/`suggestion_votes`. "Maybe" is a first-class third value; aggregation = range-overlap, not score-sort.
6. **Email Digest write-back (S15)** — Phase-1 dumb diff ships independently; **NOT gated on AI** (ADR-0017). Tokenized one-tap write-back (vote/availability/RSVP) is a later structured-writes phase; any optional AI narration is just a per-trip AI toggle, never a blocker. Confirm the cron mechanism in the grill. Structured writes only.
7. **Per-item participation (deferred)** — a 5th input mechanism feeding the default split. Grill *before* Money Units if Money becomes a later focus.
8. **Crew / trip→account product-unit (D1)** — **PARKED.** Do clone-carries-roster first as the demand test before unparking.

---

## Start here — first 5 sessions

1. **S1 · Rewrite `docs/SPEC_BACKLOG.md`** → capability-indexed; cut the confirmed fossils (table above). Docs only, no PR. ~30 min. *Cheapest move; clears noise for every later session.* **(Pair with S2 — do both before opening any feature.)**
2. **S2 · Cut fresh BUILD issues** for the decided-but-unbuilt work via `to-issues` (Onboarding, #259-fix, Paid-Moment, Money Units, codes→Docs, Trip Memory, date-wedge). No PR. *Without this, "one issue per session" has nothing to attach to.* **(S3 — the AI-posture ADR — runs in parallel here; it must not gate Wave 1.)**
3. **S4 · Onboarding GRILL (#111)** — resolve scope + the homepage FLEX branch (lifecycle hero-band recommendation); reject the wizard framing. grill → plan only. *Do not open code.*
4. **Code-win interleave · Goal → "Plan this"** (`items/new?goal={id}`) — enhancement → PR. *Slot a fast tracer-bullet PR here so two planning sessions don't run back-to-back* (or the open **#236** save-bar bug if you'd rather kill a known bug).
5. **S5 · Onboarding EXECUTE** — wire join/claim → oriented trip home → one CTA to the **`/goals`** capture deck + onboarding-complete signal. exec → PR, `hitl`, `pnpm test:e2e` after. **Blocked by S4.**

> Then fork: pull **#259 (S6→S7)** as an early bug PR, and start **forming (S11→S12)** in parallel so the AFK-able date-wedge slices (S14) fill week 2.

**Key files for the first sessions:** `docs/SPEC_BACKLOG.md` (rewrite target) · `docs/CAPABILITY_MAP.md` (canonical index). **Key gate refs (all verified):** `backend/pb_migrations/0002_trips.js:12-13` (soft-trip blocker) · `backend/pb_hooks/members.pb.js:538-551` (#259 hot-path — rewrites `paid_by`/`created_by` but not `split_data`) · `src/lib/money/linked-expenses.ts` (Paid-Moment substrate) · `src/lib/trip-mode/activation.ts` (`isTripActive`) · `docs/adr/0014`/`0015`/`0016`/`0007` (decided-but-unbuilt).
