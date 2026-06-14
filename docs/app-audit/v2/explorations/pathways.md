# Pathways Exploration — Net-New Pathway Improvements (v2 audit)

> Role: new-pathways designer, #116 audit v2. 2026-06-12.
> Lens: charter vision (one home, four pillars Plan→Collaborate→Execute→Remember, NOT-list binding).
> Job: what findings.json / fresh-findings.json DON'T cover — connective tissue between bounded
> contexts, momentum flows (complete X → app offers Y), group-coordination flows, lifecycle hand-offs.
> Inputs read: charter.md, findings.json (25), fresh-findings.json (50, 6 slices; designer/cross +
> power/cross = 0), taskpaths.json verdicts, SPEC_BACKLOG.md, CONTEXT.md, TRIP_REPLANNING_PRD,
> TRIP_MEMORY_PRD, V4_DOCUMENTS_PRD, V4_GROUP_INPUT_PRD, TASKS_PRD, V3_PRD §5 + targeted code reads.

---

## Coverage map — what is already owned elsewhere (skipped here, cited)

| Territory | Owner — do not re-propose |
|---|---|
| Replanning doors (ideas-from-free-time, skip→replace, promote-to-today, weighted Now) | `docs/TRIP_REPLANNING_PRD.md` (approved; absorbs SPEC_BACKLOG "Ideas from Free Time" + "Inline contextual parking lot") |
| Wrap-up third state (settle→closeout→archive sequence) | Charter D5, WP-A-001 — pre-flagged P1, routed grill→PRD |
| Memory capture/review (Note Before Bed, composer, closeout retro) | `docs/TRIP_MEMORY_PRD.md` (shelved firm) — TRIP_REPLANNING explicitly excludes Memory touchpoints; so does this doc |
| Goals review step in closeout wizard | V4_GROUP_INPUT_PRD "Closeout integration — DEFERRED out of v4"; taskpath #33 flags the CONTEXT.md doc-vs-code mismatch |
| Item↔expense two-way **navigation** | SPEC_BACKLOG Money (target v4); item-side "View in expenses" shipped per #128 comment in `items/[itemId]/+page.server.ts:54` |
| Booking smart list, tri-state pill, packing/grocery views, task_assigned notification | SPEC_BACKLOG Tasks + TASKS_PRD §9/§10 (deferred) |
| Calendar feed, weather, maps deep-links, email digest | SPEC_BACKLOG Integrations (deferred) |
| Mid-trip money **glance**, trip-mode add-flow exits, offline doc path, archive share UX, clone bugs (flights, day collision), export gaps, first-five-minutes landing, suggestion visibility, leave-trip, /account reach | findings.json WP-A-004/005/008/009/011/013/014/016/017/018/019/020/024 + fresh-findings equivalents |
| Per-member flights / item↔member association | WP-A-017 (taskpath #14 "gap, not in backlog") |
| Day density (taskpath #12 "clean"), traveler-initiated invite (taskpath #3 "clean"), browse goals+votes (taskpath #10 "findable, split by design per ADR-0004") | judged clean/intentional — no pathway needed |
| Trip-level messaging, push, realtime, multi-currency, embedded maps, native, AI itineraries | CLAUDE.md / charter NOT-list — dead on arrival |

Everything below is checked against this map; each proposal cites its nearest neighbor and how it differs.

---

## Method note — what "pathway" means here

Findings are gap-shaped (broken, buried, missing link). These proposals are flow-shaped: the app
already holds both ends of a connection and never walks the user across it. Three archetypes:
**connective tissue** (item↔expense↔document↔goal↔checklist), **momentum** (after completing X,
offer Y at the moment of completion), **hand-off** (lifecycle seams: setup→planning, planning→trip,
phase→phase, trip→record, record→next trip). All proposals honor D1 (no collaboration hub —
contextual surfaces only), D3 (today-only boundary in Trip Mode), and the scale invariant
(degrade gracefully solo).

---

## PLANNING

### P-1. "Plan this" door on Trip Goal detail (goal → first item)

**What.** Goal detail (`goals/[goalId]/+page.svelte`) gains a primary action next to the existing
"Link items" sheet: **Plan this** → `items/new?goal={id}` with the goal pre-selected in the form's
existing "Addresses goal(s)" control. On save, the user lands back on goal detail with the item
linked and the goal's derived status freshly bumped (unplanned). Optional phase preselect if the
trip has exactly one phase.

**Why.** The group-input cluster has capture (`/goals/capture`) and harvest (goal votes) but no
**commit** moment: today the only way a goal becomes plan is to start from the item form and
remember to tag it, or retro-link from goal detail (verified: goal detail offers link-*existing*
only, line 155; V4_GROUP_INPUT_PRD specs no creation door). "Try paella" rots as a wish unless
someone re-enters it as an item by hand. Charter: Plan+Collaborate pillars; V2-adjacent — the
contributor's aspiration is heard but never carried into the plan; goal status derivation
(CONTEXT.md [[Trip Goal]]) only pays off once items link. Momentum archetype: the decide moment
(group loved this goal) should offer the commit.

**Adjacency.** SPEC_BACKLOG "Linked goals in item detail" is render-only (the reverse direction);
not this. No finding touches goal→item creation.

---

### P-2. Document upload → "Mark booked?" confirm chip

**What.** When `uploadDocument` succeeds on an item where `requires_booking && !booked`
(`items/[itemId]/+page.server.ts:142-159` currently returns bare `{uploadSuccess: true}`), the
success state renders a one-tap chip inline at the upload spot: **"Booked? Mark it"** → the same
`booked=true, booked_by` write the booking Smart List does (`lists/booking/+page.server.ts:82`).
Dismissable, never modal, state-based only (no content inspection).

**Why.** Uploading a confirmation PDF *is* evidence of booking — the app watches the proof arrive
and still counts the item unbooked. Booking Readiness (`needsBooking()` pill, booking Smart List,
the pre-departure sweep scenario #13) stays wrong until someone separately visits the list. V3
seam: booking truth drops between the Documents context and the Itinerary projection. Connective
tissue: document↔booking-readiness, currently zero edges between them.

**Adjacency.** V4_DOCUMENTS_PRD cut "content-based scope suggestion" (OCR) — this is **not** that:
no file reading, a pure state nudge. Tri-State Booking Pill (deferred) unaffected — works on the
shipped boolean. WP-A-016 is about codes on the Documents tab; different.

---

### P-3. Booked moment → "Log what you paid" expense prefill

**What.** The two places an item flips to booked — the booking Smart List row check-off and the
item-detail booked toggle — answer with a transient affordance (toast-with-action per project
error/confirmation rules): **"Log what you paid"** → `expenses?action=add` prefilled:
`linked_item={id}`, amount = item `cost_estimate_usd`, payer = current member, description = item
title. Skippable; nothing nags.

**Why.** Booking is the moment money actually leaves someone's account during planning, and it's
exactly when the group's Splitwise habit fires (charter V1: checking Splitwise = Waypoint failed).
Today the booked write is a dead end (verified: action returns success, no follow-on). Capturing
the expense at the booked moment keeps Money authoritative from planning onward and feeds the
mid-trip/post-trip money story with real prepaid data. Connective tissue: itinerary↔money on the
**creation** side.

**Adjacency.** SPEC_BACKLOG "Item ↔ Expense two-way navigation" + #128 cover **navigation** over
existing links; the fresh planning-P2 budget finding covers comparing estimates vs budget. Neither
creates the expense at the moment it becomes real. Fresh finding "expenses ?action=add has no
handler" must land first (this proposal depends on that fix).

---

### P-4. Lifecycle-aware next-step strip on trip Overview

**What.** One slot under the Overview header (`(app)/trips/[slug]/+page.svelte` — today its only
adaptive behavior is the no-phases flat-day fallback, lines 194-219): a single dismissible strip
computing the trip's **next collective step** from state, advancing through the lifecycle —
(a) no phases/days shaped → "Shape the trip" → phases; (b) members < 2 and no placeholder →
"Get the group in" → members (solo trips: suppressed, scale invariant); (c) ideas exist but
votes are sparse → "Hear from everyone" → swipe deck of the busiest phase; (d) inside T-minus
7 days → **pre-departure sweep**: `N to book` (→ booking Smart List) + `flights/lodging without
documents` (→ those items) + `unassigned tasks` (→ lists). One action shown at a time, never a
checklist wall, never blocking.

**Why.** D2 names the *joiner's* first five minutes; the **owner's** first session and the
**group's last week before departure** have the same unowned-momentum problem. The planning→trip
seam (charter V3) currently has zero proactive surface: nothing ever says "you leave Saturday and
the riad isn't booked." Scenario 13 (pre-departure sweep) resolves today only if the novice guesses
"Lists" (taskpath: findable-but-guessy). This is D4's "doors open proactively" principle applied to
the planning side of the seam.

**Adjacency.** Fresh finding (novice/planning P2) wants a visible **add button** on Overview —
mechanical affordance; this is the orchestration layer above it, and it cites rather than replaces
that fix. WP-A-014/D2 stay joiner-side. Booking Smart List itself is shipped; this is the door to it.

---

### P-5. Swipe-deck completion → owner signal + ranked-results door

**What.** When a member drains a phase's deck (`swipe/[phaseId]/+page.svelte:83` — "All caught up",
currently offers only "Continue to {next phase}"), write one in-app notification to owner/co-owners:
*"{name} finished voting on {phase}"* — a new notification type alongside the existing three
(suggestion_added, comment_added, member_joined; verified only those exist). The notification —
and a small "{k} of {n} have voted" line on the phase card that hosts the swipe entry — deep-link
to that phase's **vote-sorted parking lot**, which already ranks by aggregate score.

**Why.** The harvest half of group input is write-only today: a traveler swipes 30 cards and the
act is invisible — nobody is told the preferences landed, and the owner never learns the group is
ready to decide. That's charter V2 downstream: the contribution happened but goes unheard, so
decisions still get made in the group text ("did everyone vote? what won?"  = V1). Completes the
capture→harvest→**decide** loop with the decide door. Async, in-app only — respects
V4_GROUP_INPUT's rejection of synchronous sessions and the no-push rule.

**Adjacency.** #30 (vote UI) shipped the buttons/stacks; SPEC_BACKLOG notification entries cover
dedup/realtime-badge, not new types. No finding touches vote-round visibility. D1-safe: the signal
lands in existing contextual surfaces (bell, phase card), no hub.

---

### P-6. Assigning a task to a placeholder → join-link nudge

**What.** In the Task assignee picker (lists/[listId]), choosing a **placeholder member** renders
an inline one-liner under the row: *"{name} isn't here yet — share the join link"* → copy action
reusing the Members page's existing per-role link (or deep-link to Members if none is live). Shown
at assignment time only; placeholder assignment itself stays fully allowed.

**Why.** Tasks accept any Trip Member as assignee, including placeholders — people who **cannot
see the assignment** (no account, no access). "Jake's on grocery duty" silently becomes "nobody is."
Charter V2 (a coordination act that lands on deaf ears) at the exact moment the owner is thinking
about Jake — the highest-conversion instant to pull a non-technical friend into the app, which is
the quality bar's whole premise. Connective tissue: tasks↔membership lifecycle (claim flow already
makes the hand-off seamless once Jake joins — assignments ride the claimed `trip_members` row).

**Adjacency.** TASKS_PRD §10 defers a `task_assigned` **notification** (dogfood-gated) — that
notifies real members; this addresses the member who can't be notified. Join links shipped (#118).
WP-A-014 is post-join; this is pre-join.

---

## TRIP

### T-1. Phase-exit sweep — "Leaving {phase} tomorrow, N ideas still parked"

**What.** On the **last day of a phase** (computable: today is the max date of the phase's days and
a later phase exists), Today renders one card below the tomorrow preview: *"Last night in Paris —
4 ideas you never got to."* Two actions: **Carry to {next phase}** — bottom sheet listing that
phase's remaining unplanned items with per-item keep/let-go, writing only the `phase` field
(unplanned items are day-less, so re-homing them touches no day and stays inside the D3 temporal
boundary); and **Review in planning** — the working door (mode pill semantics) for anything
heavier. Solo and single-phase trips: card never renders.

**Why.** The charter names two seams (planning→trip, trip→record) but multi-phase trips have a
third **inside** the trip: phase→phase. Parking-lot ideas are phase-scoped by definition
(CONTEXT.md [[Parking Lot]]), so when the group leaves Paris, Paris's un-promoted ideas silently
exit reachability-by-relevance — TRIP_REPLANNING's doors only ever surface the *current* phase's
ideas, and the closeout unplanned review (itself flagged missing by a fresh post-P2 finding)
arrives weeks too late to act. This is D4 ("doors open proactively at the states where the need
arises") applied to a state nobody listed: the phase boundary. V3 seam-drop, mid-trip.

**Adjacency.** TRIP_REPLANNING_PRD = today-scoped, same-phase promote/skip; explicitly out-of-scope
for future days — carry-by-phase-field mutation is the one legal inline move, and the PRD's "Just
skip" sheet pattern is reused. Closeout findings cover the end-of-trip review; this is the only
surface that can still *rescue* an idea into the same trip.

---

### T-2. Papers on the timeline — document chip on Trip-Mode item cards

**What.** Now/Today item cards for items that have ≥1 Document get a small artifact chip (count or
type glyph). Tap → opens that item's document directly (single doc: straight to lightbox/native-PDF
per the shipped S4 pattern; multiple: the item-detail Documents section). Served from the S5
offline cache on active trips, so the chip works on the jetway.

**Why.** The signature Trip-Mode moment — boarding pass at the gate, voucher at the tour desk — is
currently a three-hop hunt (card → item detail → Documents section → open) or a context switch to
the Documents tab and a scan of the grouped Ledger. The card-content spec places documents on
**detail only** (CARD_CONTENT_SPEC.md §"Documents → DocumentSection"); nothing marks *which*
timeline entries carry their papers. One-handed, one-tap artifact access from the glance is the
"one job" on its most critical path; its absence is exactly what re-opens the email folder (V1).

**Adjacency.** Fresh trip-P1s cover the **offline route** to documents and the cold-open 503 —
plumbing below this. S4 (#72) is preview *rendering*, S3 (#73) paste-in — neither adds a timeline
affordance. WP-A-016 is text codes on the Documents tab. All cited; none place documents on cards.

---

### T-3. Receipt on the expense — third Document parent scope

**What.** The expense form/row gains an optional **receipt** slot: attach-or-paste an image/PDF,
stored as a Document with parent scope **Expense** (extending the shipped `{Item | Trip}` choice —
scope still assigned by entry point, the PRD's own principle; no OCR, no new collection). Rendered
as a thumbnail chip on the expense row; Trip Documents aggregate gains a "Receipts" group.
Verified absent today: `expenses/+page.svelte` has zero document/file references.

**Why.** Mid-trip money capture is where Splitwise's gravity is strongest, and receipts are half of
why groups keep it (V1: every receipt photo that lands in Splitwise or the group text is the old
stack winning). Charter-wise receipts are execution artifacts — squarely Documents-domain
("reference artifact used during the trip"), nowhere near the Memory NOT-photo-album line. Settles
disputes at settle-up time (post-trip pillar) with the artifact attached to the money record
instead of twelve photos up the group chat.

**Adjacency.** V4_DOCUMENTS_PRD decided scope `{Item | Trip}` with **no Phase** — expenses were
never discussed there; this consciously extends that decision and should be grilled against
ADR-0005 (plain storage applies cleanly). Fresh finding "add expense ?action=add broken" is
plumbing-first. Not in any backlog/deferred list.

---

## POST-TRIP

### PT-1. Clone with memory — carry "unfinished business" into next year's trip

**What.** The clone form (today: `include_phases` + per-type checkboxes) gains two opt-ins:
**Bring ideas we never did** — source items with status `considered` or still `unplanned` land in
the new trip's parking lot as `unplanned`, day-less, phase-mapped; and **Bring unmet goals** —
trip_goals whose derived/manual status never reached `done`, copied with creator preserved when
that member exists in the new trip, else trip-owner-attributed. Verified today: clone copies
**nothing** of either — every cloned item is hard-set `status: 'planned'`
(`clone/+page.server.ts:153`) and goals aren't queried at all.

**Why.** This is the Remember→Plan hand-off, the only lifecycle seam with literally no pathway:
the four-pillar loop is open at the back. Closeout deliberately curates regret — `considered` means
"we wanted this and didn't do it" — then clone discards exactly that data and fabricates a plan
where everything is already committed (also semantically wrong for scenario 36). "Start next
year's trip from this one" should start from what last year *taught*, or the planning session
starts in the old stack ("what was that place we never got to? scroll the doc").

**Adjacency.** Fresh post-P2s cover clone **bugs** (flight type omitted, day-record collision,
export/import datetime) — mechanical fixes this rides on. WP-A-020/scenario 39 is the
**non-member** template dead end; this is the member-side seam. Archive stays plan-only
(SPEC_BACKLOG resolved) — untouched: clone reads the source trip directly.

---

### PT-2. Money epilogue — estimate-vs-actual recap feeding the D5 wrap-up grill

**What.** A read-only money recap composed from existing data: per category and per linked item,
`Σ cost_estimate_usd` (plan) vs `Σ expenses` (reality), plus per-member paid/owed totals — rendered
as the landing context of the **settle** step in the D5 wrap-up sequence. Explicitly routed as
**input to the charter-D5 grill→PRD**, not a standalone build — D5 owns settle→closeout→archive,
and this defines what "settle" should open *with*.

**Why.** The trip-day→record seam (V3) drops the money story today: expenses remain a flat list
forever, settle-up shows only who-owes-whom, and the one question every group asks at the end —
"what did it actually cost vs what we said?" — has no surface, so someone rebuilds it in a
spreadsheet (V1, the literal Sheet in the Doc/Sheet/Splitwise stack). Item Cost is *defined* as the
forward-looking estimate (CONTEXT.md) — nothing ever closes the loop against the authoritative
Expense record. Pairs with P-3: booked-moment expenses make this recap honest.

**Adjacency.** Fresh planning-P2 budget finding = plan-vs-budget **during planning**; WP-A-018 =
mid-trip glance; the export-missing-expenses finding = portability. None retrospect estimates vs
actuals. D5/WP-A-001 owns the sequence; this is content for that grill, flagged so Phase 3 carries
it in.

---

## Guardrail check (all proposals)

| Guardrail | Status |
|---|---|
| NOT-list / off-the-table | No realtime, push, AI, embedded maps, multi-currency, messaging, native. P-5 uses the existing in-app notification channel only. T-3 is Documents-domain artifacts, not a photo album. |
| D1 no-hub | Every surface is contextual (goal detail, upload success, booked toggle, overview strip, deck-drain, assignee picker, today card, expense row, clone form, settle step). No aggregation home proposed. |
| D3 temporal boundary | T-1's inline action mutates `phase` on day-less unplanned items only; anything day-touching goes through the working door. T-2 read-only. No future-day pickers anywhere. |
| Scale invariant | Solo trips: P-4 suppresses the invite step; P-5/P-6/T-1 carry/vote surfaces require members/phases to exist or never render; everything else solo-useful. |
| Documented-deferred respected | Goals-in-closeout, calendar/weather/maps/digest, tri-state pill, task notifications, memory touchpoints, archive extensions — all cited in the coverage map, none re-proposed. |

## Dependency notes for Phase 3

- P-3 and T-3 depend on the fresh `?action=add` handler fix landing first.
- T-2 rides on S4 (#72 preview) + S5 offline (shipped) and the offline-route P1 fixes.
- PT-1 rides on the clone bug fixes (flight type, day collision).
- PT-2 must be routed into the D5 grill, not filed as its own issue.
- P-2 + P-3 chain naturally (upload→booked→expense) but each stands alone.
