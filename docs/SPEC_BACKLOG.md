# SPEC_BACKLOG

Genuine unbuilt **frontier**, indexed by capability. One section per L1 capability, mirroring `docs/CAPABILITY_MAP.md` (8 core + 2 enabling). The Map is the canonical model; this file is the *to-build* slice of it.

**Rules of the file:**
- Entries are **frontier only** — not-yet-built work. Shipped work lives in the Map (status tags) and the code, not here.
- Before starting an entry, amend `docs/SPEC.md` per the CLAUDE.md scope-change protocol. When promoting an entry into a milestone / issue, cut it from this file in the **same** commit that amends `SPEC.md`.
- Entries leave only when **built** or during an **explicit backlog audit** — never auto-pruned for sitting.
- *ADR-accepted ≠ shipped.* Several entries below are decided (ADR exists) but unbuilt; the ADR is the design, this is the queue.

> **Rewritten 2026-06-21 (BUILD_PLAN S1):** was organized by the old `CONTEXT.md` bounded contexts and ~70% fossil (describing shipped work). Re-indexed to the capability Map; confirmed-shipped items cut. A short **Cleanup pass** stub at the end lists the verify-then-delete items not yet swept.

---

## 1 · Ideation 🔴 *gap*

*Decide where, when, and why — enough to commit to dates. Largely unbuilt; only Goals exist.*

### When + availability — the date-finding wedge *(headline bet)*
- **What:** A **new** Availability mechanism (member × date-range → yes/maybe/no overlap), aggregated by range-overlap to rank **group candidate windows**. "Maybe" is a first-class third value. The winning window one-taps into real dates (the `forming → dated` promotion). "The poll is the invite."
- **Not:** a Vote, nor a reskin of `votes`/`goal_votes`/`suggestion_votes` (kept separate per ADR-0004/0009). **Never** auto-suggests destinations (charter: no AI-generated itineraries) — it ranks the group's own proposed windows.
- **Blocked by:** the `forming` soft-trip lifecycle (Itinerary prereq below). Integrates with Onboarding (the poll *is* the join surface) but is **not** blocked by it.
- **Slices:** new collection → paint-the-grid heatmap UI → winning-window promotion. Grill the data-model + aggregation semantics separately from the UI/promotion slices.
- **Ref:** `CAPABILITY_MAP.md` §1.

### Why — Goal → "Plan this" commit pathway
- **What:** Goal detail gains a "Plan this" → `items/new?goal={id}` with the goal pre-linked. Closes the missing **commit moment** in the group-input cluster (capture + harvest exist; goals otherwise rot as wishes).
- **Note:** standout cheap tracer-bullet code win. The link is already captured goal-side (`trip_goals.items` via `syncGoalLinks`); this is the forward pathway.

### Why — render linked goals in item detail
- **What:** Show the [[Trip Goal]]s an item addresses on the item detail page. The back-link is stored (`trip_goals.items`) but detail hardcodes `linked_goal_ids: []` and renders nothing. Needs the detail loader to fetch the back-link.
- **Ref:** `docs/CARD_CONTENT_SPEC.md` §6c. "Smart, no clutter."

> **Where** (compare/decide destinations) is deferred until **When** proves the Ideation engine.

---

## 2 · Itinerary 🟢 *mature*

*The shared plan. Core is shipped and stable; frontier is the soft-trip data prereq + a couple of model cleanups.*

### `forming` lifecycle state — soft-trip *(keystone unblock for ALL of Ideation)*
- **What:** A dateless / pre-dates trip lifecycle state. Today the schema **forbids** it — `backend/pb_migrations/0002_trips.js:12-13` makes both dates `required:true`, and no `status`/lifecycle field exists. Relax the NOT-NULL behind a lifecycle status; build the `forming → promote-to-dates` hand-off.
- **Grill:** the state machine (`forming → dated`), what's allowed in `forming`, nav/empty-state, whether "active" still defers to `isTripActive` (`src/lib/trip-mode/activation.ts`).
- **Constraint:** append-only migration (CLAUDE.md PB rule).
- **Why here:** it's an Itinerary data-model change, but it unblocks the entire Ideation capability.

### Tri-State Booking Pill
- **What:** Booking status cycles `not booked → partially booked → booked` (boolean today). Middle state matters for multi-leg transit + grouped lodging. Migration widens the column; UI has pill space. Feeds the booking smart list (Logistics).
- **Note:** dogfood-driven priority.

### Flight type vs. transportation-subtype ambiguity
- **What:** `flight` is a valid item type (migration 0027, full field config) but `ItemForm.svelte` omits it from the type-pill list; flight is also reachable as a `transportation` subtype (which wires `FlightLookup`). Two paths to the same thing.
- **Resolve:** when next touching `ItemForm` — pick one canonical path. Not blocking.

### IA — merge Phases index into Overview → one "Plan" surface *(refactor, low)*
- **What:** Collapse `/trips/[slug]/phases` into the trip Overview (phase cards w/ day chips + parking-count + inline quick-add + per-phase lists; management verbs behind an "Edit phases" toggle; `/phases` → redirect). Itinerary SubTabs 4→3 (Plan | Lists | Goals). Drops parking-lot capture from 3 taps to 1–2.
- **Note:** the biggest IA bite of the audit; **needs its own plan when picked up**; entangles with #159/#160 (ContextRail parking drag) + #89 (phase-detail layout). `layers.md`. Post-gap, dogfood-driven.

---

## 2a · Logistics 🟡 *(Itinerary sub)*

*Get the planned trip ready for trip day: booked, packed, confirmed.*

### Tasks model — generalize checklists / packing / grocery / booking-to-do
- **What:** The Checklist/Task primitive is shipped (`checklists`/`tasks`, ADR-0003). Frontier is the **views** that compose it:
  - **Packing list** — manual entries, per-person assignable; optionally weather-aware (→ Integrations · Weather).
  - **Booking to-do** — auto-filled from planned-but-unbooked items + manual add; checking one off can flip the item's booking status (Tri-State Booking Pill).
  - **Grocery list** — a community (shared, not per-person) list with a location/time trigger; generalizes to "location/time-triggered checklist."
- **Note:** the primitive is one model; do **not** ship the three lists as three separate features. Some of this entangles with the readiness rollup (Map §2a).

### Pre-departure "unbooked sweep" *(low conviction)*
- **What:** A T-minus-N "you leave Saturday and the riad isn't booked" surface — the one concrete sliver of the dropped proactive next-step engine.
- **Note:** the full engine was dropped (brushes the no-hub charter line); fold into Booking Smart List work (#198-adjacent). dogfood-driven. `pathways.md` P-4.

---

## 3 · Group Input 🟡 *building*

*Make opinions known fast (vote) or in depth (comment); converge into the plan.*

### Swipe-deck completion → owner signal + ranked door
- **What:** Draining a phase's deck writes one in-app notification ("X finished voting on Paris" — a **4th notif type**) + a "k of n voted" phase-card line, both deep-linking to the vote-sorted parking lot. Harvest is write-only today, so "did everyone vote, what won?" currently happens in the group text.
- **Note:** D1-safe (async, in-app). `pathways.md` P-5.

### Swipe-quiz comment pathway
- **What:** The swipe deck has no comment pathway — a frontier seam noted in the Map (§3). Pull when the polymorphic `comments` extraction lands.

> **Deferred:** polymorphic `comments` collection extraction (today `Comment` is a `suggestions` row, item-only — 🔵 latent per Map). Pull before the swipe-comment pathway.

---

## 4 · People & Membership 🟢 *mature*

*Right people, right access, recognizable identity; the who-did-what record survives joins/claims/departures.*

### Onboarding — first-five-minutes *(🔴 gap, NOW next-build)*
- **What:** join/claim → **oriented** trip home → **one** "first contribution" CTA → a per-member onboarding-complete signal. A stranger currently lands on a bare planning tool; no onboarding-complete signal exists anywhere today (net-new).
- **Stitches shipped parts** — `/join/[token]` already redirects to `/trips/[slug]`; `/claim`, `/goals`, `/swipe` all exist. Not greenfield.
- **First-contribution CTA targets `/goals` (capture), not `/swipe`** — a brand-new trip has no seeded swipe candidates.
- **Resist the "wizard" framing** (#111's title). Fuse the first-timer hero with the trip-home decision (the homepage FLEX branch — a lifecycle-aware hero band on the existing `/trips/[slug]/+page.svelte`, a reversible swap, **not** a new route; the app-home half `/trips/+page.svelte` already buckets active/upcoming/past).
- **Ref:** `#111` (OPEN).

### Self-leave UI
- **What:** Backend exists (ADR-0008); the member-facing self-leave affordance is unbuilt. Enhancement.

### Role downgrade
- **What:** The promote endpoint only upgrades traveler → co_owner; downgrade is missing.

### Invite resend
- **What:** A "resend invite email" button (today the only path is revoke + recreate).

### Edit-and-approve inbox UI
- **What:** Backend `/api/suggestions/review` accepts a `payload` override; the UI exposes no edit form.

> **Dogfood-driven (pull only on real friction):** notification dedup/batching · notification realtime (bell is page-load only) · traveler auto-approve E2E test (test 6 in `test-suggestions.mjs` SKIPped — needs PB admin creds in `.env.local`). Comment edit/delete: comments are immutable **by design**, not a gap.

---

## 5 · Money 🟡 *building*

*No one returns to Splitwise. Core (expenses/splits/settlements/budgets/debt-simplify) is shipped; frontier is the two-axis model + Paid Moments + Money Units.*

### Two-axis Money model *(ADR — research, gates Money Units)*
- **What:** Keep the two axes independent — **unit** (settlement collapse) and **participation** (split membership). Conflating them re-creates Splitwise friction. ADR amend (extends ADR-0015).
- **Note:** only Money Units truly needs this. Subset already decided: #259's narrow reassign-disposition call.

### Paid-Moment affordance + prefilled add-expense
- **What:** #228/#229 closed as **ADR-0014 decisions — no code shipped** (no `Log payment` string, no `initial*` props). Build the #228 URL-param/prefill **substrate** first, then the #229 affordance on top. "Paid" is **derived** from the linked-expense predicate (`src/lib/money/linked-expenses.ts`), not a new flag.
- **Ref:** ADR-0014.

### Money Units collection + unit-aggregated debt-simplify
- **What:** ADR-0015 decided, **code not shipped** (no `money_units` collection, no unit pre-aggregation). A new trip-scoped unit that **references `Member`** (never a second member store) and **resolves on tombstone** (ADR-0008). The defined-unit preset rides the Paid-Moment prefill.
- **Blocked by:** the two-axis ADR + the Paid-Moment substrate. Settle-up math change → verify on `pnpm test:e2e:clean`.
- **Ref:** ADR-0015.

### IA — Money one-page with budget header *(low)*
- **What:** Collapse Expenses|Budget sub-tabs into a single Money page: estimated-vs-spent header (math already in `budget/+page.svelte`), balances + Settle Up above the ledger, header-tap → budget editor (`/budget` survives as editor only). Read drops from 2 taps + a guess → 0 taps.
- **Note:** design alongside #198 (plan-vs-budget) + #211 (trip-mode Money summary). `layers.md`.

> **Decided against (recorded so it isn't re-proposed):** **multi-currency** — single-currency by design (charter / CLAUDE.md).

---

## 6 · Documents 🟡 *building*

*Every booking reference — file or code — one tap away. Core upload/view/delete + Trip Documents aggregate are shipped (Vault retired, ADR-0005).*

### codes → Documents migration *(ADR-0016, refactor)*
- **What:** Confirmation codes still live on `items.confirmation_codes`, **read across 26 files** (incl. export/portability/clone/import). ADR-0016 moves them into Documents. Correctness-neutral plumbing, low urgency.
- **Split into 3 sub-PRs:** (1) append-only migration + new code object + backfill; (2) repoint readers capability-by-capability; (3) leave `items.confirmation_codes` inert. Touches export/portability → needs `pnpm test:e2e`.
- **Ref:** ADR-0016.

### Remaining v4 slices
- **Clipboard paste** (#73 — paste screenshots) · **Preview surfaces** (#72) · **Offline precache** of the active trip's Documents (#74).
- **Ref:** `docs/V4_DOCUMENTS_PRD.md`.

### Receipt on the expense — 3rd Document parent scope
- **What:** Optional attach/paste a receipt on an expense, stored as a Document with **parent scope = Expense** (extends {Item|Trip} via the same entry-point principle); a "Receipts" group in Trip Documents. Receipts are half of why groups keep Splitwise. Append-only enum-widen migration.
- **Note:** Documents ∩ Money. `pathways.md` T-3.

### Document upload → "Mark booked?" chip
- **What:** On `uploadDocument` success for `requires_booking && !booked`, a one-tap chip does the same `booked=true` write as the Smart List. The PDF *is* evidence of booking, yet booking truth drops between Documents and Itinerary today.
- **Note:** Documents ∩ Itinerary. `pathways.md` P-2.

---

## 7 · Trip Execution 🟡 *building*

*On the trip: always know now/next, act one-handed, works without signal. Owns zero native data — surfaces + process over borrowed data.*

### Light Replanning doors
- **What:** Manage the unplanned/unexpected — promote a parked idea, skip/swap (#166). Planned per Map §7.

### Phase-exit sweep — "Leaving Paris tomorrow, N ideas still parked"
- **What:** On a phase's last day (when a later phase exists), Today renders a keep/let-go card writing only the `phase` field (day-less items) + a "Review in planning" door. The unowned **phase→phase** seam: parking ideas are phase-scoped, so leaving a phase strands its un-promoted ideas (replanning is same-phase; closeout is weeks too late).
- **Note:** `pathways.md` T-1.

### Document chip on Trip-Mode item cards
- **What:** Cards for items with ≥1 Document get an artifact chip → one-tap open from the offline cache. Boarding-pass-at-the-gate is a 3-hop hunt today. Rides #203 + `CARD_CONTENT_SPEC`.
- **Note:** Trip Execution ∩ Documents. `pathways.md` T-2.

### IA — Today one-scroll, drop the upcoming sub-tab *(low)*
- **What:** Today as one scroll: timeline → inline checklists (#52) → collapsed "Next 3 days" (today/upcoming inlined, route redirects). `today/upcoming` is 68 lines of read-only lookahead behind a sub-tab.
- **Note:** afternoon-sized, independent of the Plan merge. `layers.md`.

> **Day-Wrapped Stats** (items/distance/spent on the day-wrapped state) is the one surviving sliver of the dropped Trip-Mode v4 concept batch (rest absorbed by #166/#211). Pull opportunistically.

---

## 8 · Records & Archive 🟡 *building*

*The trip ends well and lives on — private keepsake + public record; the data stays yours.*

### Trip Memory *(🔴 gap — firm PRD, ADR-0007 accepted, unbuilt)*
- **What:** Each member captures **one photo + one short thought, per day** — a curated highlight, not a journal. **No `memories` collection exists.** The **DB-enforced cap** (unique `(day, author)` index) *is the whole personality* — it's what keeps this from becoming Apple Photos / Day One.
- **Decisions (PRD/ADR):** Memory ≠ Document (separate entity/collection/context; scope by entry point, no OCR). Member-only, **excluded from the Public Archive**. Capture: Note Before Bed (Trip Mode, end of day) + live composer + retroactively in Closeout; review: Trip Mode Today + Closeout. **No standalone gallery** (that's the deferred cross-trip "living record"). Storage: PB file storage now, NAS later. Keep author **USER-resolvable** (so the Crew moonshot stays additive).
- **Build:** SKIP grill (PRD pre-grilled) → SPEC amend → `to-issues` → exec. Add a capture door to the Trip Execution Add workflow.
- **`heic.ts` does NOT exist** — HEIC transcoding (client-side WASM, pre-upload; a *shared* Memory+Documents capability) is its **own** slice, not a free pull.
- **Ref:** `docs/TRIP_MEMORY_PRD.md` · ADR-0007.

### Wrap-up completion
- **What:** Post-end orchestration (triggers settle → closeout → publish). #195. Partly shipped (wrap-up banner); completion is frontier per Map §8.

### Clone with memory
- **What:** Clone gains opt-ins to **bring ideas we never did** (considered/unplanned → unplanned, day-less, phase-mapped) and **unmet goals** (non-done `trip_goals`). Clone hard-sets `status='planned'` and ignores goals today, so the Remember→Plan seam discards exactly the regret data closeout curated.
- **Note:** rides #173 (clone fix). `pathways.md` PT-1.

### Money epilogue → fold into wrap-up (#195)
- **What:** Read-only estimate-vs-actual recap (Σ `cost_estimate` vs Σ expenses; per-member paid/owed) as the **settle-step landing in the wrap-up PRD #195**, **not** a standalone build. The trip→record seam drops the money story today.
- **Note:** `pathways.md` PT-2.

> **Decided against (recorded so it isn't re-proposed):** **archive-memory** — the "extend the archive to plan + memory" idea was **rejected** (Trip Memory grill, 2026-06-09). Memory records are for the travelers, never the public (no tractable PII-strip for images); reviewed member-only at Closeout. Archive stays **plan-only**. The deferred cross-trip *private* "living record of all trips" is a separate future grill. See ADR-0007.

---

## Enabling · Platform ⚪

*The invisible floor: signed in, loads, offline, navigates, keeps time.*

### Anticipation countdown component *(in-app only)*
- **What:** A pre-trip countdown surfaced on the trip-home hero band + `/trips` Upcoming card. Build once, consume twice. Emotional register: anticipation/hype welcome — **never via push** (charter; in-app only).
- **Note:** **dedup-check `ContextRail.svelte` first** (it already does context-rail time work); reuse `src/lib/shell/format.ts` + `now-state.ts`. Presentational polish — do **not** preempt gap/correctness work.

> **P3 polish batches — pull opportunistically** (detail lives in each exploration file under `docs/app-audit/v2/explorations/`, the single source of truth): landing & post-action contract (`landing-map.md`) · empty-state copy/CTA gaps (`empty-states.md`) · desktop shell / ContextRail branches + BottomSheet centered-modal variant (`desktop.md`) · terminology nits (`terminology.md`).

---

## Enabling · Integrations & Syncing ⚪

*Play well with the outside world — pull in, push out, link across.*

### Email Digest *(highest-leverage absence; elevate)*
- **What:** Outbound cron'd "here's what changed on your trip" email via Resend. Push is off-the-table, so **email is the only re-engagement lever** for non-technical friends who won't open the PWA unprompted.
- **Phase 1:** a dumb structured diff — **no AI dependency.** **Confirm the scheduled-trigger mechanism exists** in the grill (Resend outbound is shipped; the *cron* infra is unstated). **Structured writes only** (reply-to-thread is off-table).
- **Later phases (gated on the AI-assist posture ADR):** LLM narration + tokenized one-tap write-back (vote/availability/RSVP).

### Weather (Open-Meteo)
- **What:** Free, no API key (fits open-source-first). Planning-side feeds the packing list; execution-side forecast on the Now tab. A widget, not a domain.

### Calendar feed (subscribe, not export)
- **What:** A stable `webcal://` subscribed feed per trip, each event keyed by item id as its `UID`. Subscribe once → auto-syncs forever; edits/deletes propagate with zero further taps (Google Calendar + iCloud). A one-time `.ics` export creates the duplicate/delete problem; a download-`.ics` button can exist as a fallback.

### Maps deep-link ("Open in Maps")
- **What:** Deep-link out to the device's map app (`maps://` / `https://maps.google.com/?q=`) from an item's stored Places coords. **Not** an embedded map (embeds off the table) — a link out. Execution glue.
- **Note:** verify 🟢 coverage before scheduling (see Cleanup pass).

---

## Cleanup pass (verify-then-delete)

Not yet swept — confirm on disk, then delete from this file (a later doc-hygiene pass, per BUILD_PLAN S1; these do **not** gate the rewrite):

- **Flight timezone capture** — `start_tz`/`end_tz` fields exist; confirm `handleFlightSelect` actually persists them (capture-only, never shown). If persisted → delete.
- **Maps deep-link coverage** — confirm whether "Open in Maps" already ships across item surfaces before scheduling the Integrations entry above.
- **Collaboration polish triage** — re-confirm which of the People & Membership small items (invite-resend / role-downgrade / edit-approve) are still genuinely unbuilt vs. shipped.
- **App Icon Refresh (#38)** — likely done (regenerated paper/ink/moss PNGs + apple-touch-icon, maskable safe area). Confirm, then delete; relates to open bug #38 (iOS wrong icon).

---

## Off the table

**Not a 4th copy.** The authoritative NOT-list lives in `docs/agents/charter.md` (mirrored as a pointer in `CAPABILITY_MAP.md` §"NOT on the map"): multi-currency · push notifications · embedded maps · real-time co-editing · native apps · AI-generated itineraries · trip-level messaging/discussion beyond item comments. **Anticipation/hype is welcome — but in-app only, never via push.**
