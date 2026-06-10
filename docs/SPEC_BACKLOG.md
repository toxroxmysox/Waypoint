# SPEC_BACKLOG

Deferred and future work, organized by domain. Each domain lists what's **shipped** today and what's **backlog** (not yet built). Backlog entries note what/why/target.

Before starting anything here, amend `SPEC.md` per the CLAUDE.md scope-change protocol. When promoting an entry into a milestone, cut it from this file in the same commit that amends `SPEC.md`. Entries are removed only when built or during an explicit backlog audit — never auto-pruned for sitting too long.

Domains mirror the bounded contexts in `CONTEXT.md` §"Bounded Contexts", plus three proposed new ones (Documents, Tasks, Trip Memory) and a cross-cutting Integrations group.

---

## Itinerary

*The core planning model: Trips, Phases, Days, Items, Parking Lot.*

**Shipped:**
- Trips, Phases (auto-bucket days by date overlap), Days (multi-phase), Items (7 types: lodging, transportation, flight, activity, meal, note, checklist)
- Anchor times, derived Time Slots, Sort Order (gap-based drag-reorder)
- Item status lifecycle (unplanned ↔ planned → done | considered)
- Parking lot (unplanned items, phase-scoped)
- Day view timeline (anchor-pinned + untimed flow, drag interactions)
- Multi-day items via `end_date` (#41 — hotel/rental spans, `MultiDayBanner`)
- Next/previous day navigation (`DayNav`, swipeable)
- Clone (date-offset shift)

**Backlog:**

### Trip Goal *(v4)*
- **What:** A trip-level aspiration too vague to be an item ("try paella," "do a wine tasting"). No phase, location, or time. Items can address a goal. The *capture* half of the group-input cluster.
- **Why deferred:** Not in v3 scope. Every item requires a phase; goals are phase-less by definition.
- **Target:** v4. **Notes:** CONTEXT.md glossary. Grill together with the Swipe-Quiz (Collaboration) — capture vs. harvest halves of the same flow.

### Tri-State Booking Pill
- **What:** Booking status cycles `not booked` → `partially booked` → `booked` (currently boolean).
- **Why deferred:** Boolean shipped first. Middle state matters for multi-leg transit and grouped lodging.
- **Target:** v4. **Notes:** Migration widens the column; UI has pill space. Feeds the booking to-do view (Tasks domain).

### Flight type vs. transportation-subtype ambiguity
- **What:** `flight` is a valid item type (migration 0027, full field config) but `ItemForm.svelte` omits it from the type-pill list; flight is also reachable as a `transportation` subtype (which wires `FlightLookup`). Two paths to the same thing.
- **Why deferred:** Both work; not blocking.
- **Target:** Resolve when touching ItemForm. Decision: pick one canonical path.

---

## Collaboration

*Multi-user coordination and group decision-making.*

**Shipped:**
- Trip Members, Roles (owner / co_owner / traveler / viewer)
- Invites (Resend email, code, 7-day expiry), Placeholder members + Claim
- Suggestions (review queue, auto-approve setting)
- Comments (item-scoped) — **this is the agreed ceiling for messaging; see scope note**
- Notifications (in-app only: suggestion_added, comment_added, member_joined)
- Vote model (`votes` collection, `VoteButtons.svelte`) — values: Love +2 / Like +1 / Flexible 0 / Dislike −2

**Scope decision — messaging stays minimal.** No trip-level discussion thread, no text decision log. Status transitions (unplanned → planned) *are* the decision record. Rationale: groups will keep using WhatsApp/iMessage; earn the right to compete before trying to replace. Revisit only on real dogfood demand.

**Backlog:**

### Item Voting UI ([#30](https://github.com/toxroxmysox/Waypoint/issues/30))
- **What:** Vote buttons on item detail, avatar stacks on cards (no numeric score), parking lot sorted by aggregate vote score.
- **Status:** Model + PB collection exist; frontend not built. Issue is planned/afk.
- **Target:** v4.

### Swipe-Quiz Voting Experience *(v4)*
- **What:** Tinder-style card stack that walks a traveler through planned + unplanned items one at a time, swiping Love/Like/Flexible/Dislike. The *harvest* half of group input.
- **Why deferred:** Only the vote model is specced. Swipe-deck interaction (card stack, session scope, order, multi-traveler reconciliation, gestures) is undesigned.
- **Target:** v4. Needs a grill; rides on #30. **Open question:** operates on a phase, a day, the whole trip, or just the parking lot?

### Collaboration polish (small, well-specified)
- **Invite resend** — "resend invite email" button (currently revoke + recreate). Target: v4.
- **Role downgrade** — promote endpoint only upgrades traveler → co_owner; downgrade missing. Target: v4.
- **Notification dedup / batching** — debounce comment storms into one digest notification. Target: dogfood-driven.
- **Notification realtime** — bell count is page-load only; new notifications don't update the badge live. Target: when offline/realtime work happens anyway.
- **Edit-and-approve inbox UI** — backend `/api/suggestions/review` accepts a `payload` override; UI exposes no edit form. Target: v4 polish.
- **Comment edit / delete** — comments immutable by design; only pull in on real friction.
- **Traveler auto-approve E2E test** — test 6 in `test-suggestions.mjs` SKIPped (needs PB admin creds in `.env.local`). Target: add creds, un-skip.

---

## Money

*Financial tracking. The most complete domain after Itinerary.*

**Shipped:**
- Expenses (who paid, split modes), Settlements, Budgets (per_day / total)
- Debt Simplification (greedy creditor/debtor matching)

**Backlog:**
- **Multi-currency — OFF THE TABLE** (CLAUDE.md). Single-currency by design. Recorded here so it isn't re-proposed.
- No other gaps identified. Domain considered feature-complete for now.

---

## Trip Mode

*The live-trip experience. Active only when trip status = active.*

**Shipped:**
- Now tab (3 states: mid-event, between-things/FREE TIME, day-wrapped)
- Today timeline (past dimmed, current highlighted, auto-scroll, tap-to-edit)
- Add button (add item to today / add expense)
- Mode switching (derived activation + symmetric pills), ongoing-state detection

**Backlog (v4 concepts — deferred from V3_PRD §5, none grilled):**
- **Inline contextual parking lot** — collapsed "ideas waiting" card between time-slot headers on the timeline.
- **Trip Mode Quick Actions** — Add expense / Quick note / Photo log buttons (Photo log → the [[Memory]] composer, see `docs/TRIP_MEMORY_PRD.md`; Quick note → Tasks/Memory).
- **Ideas from Free Time** — parking lot surfaced via a tap on the FREE TIME card.
- **Note Before Bed** — end-of-day prompt → the [[Memory]] composer (one photo + one thought). **Grilled & specced in `docs/TRIP_MEMORY_PRD.md`** (Trip Memory context); reviewed at Closeout.
- **Day Wrapped Stats** — items / distance / spent summary on the day-wrapped state.

---

## Archive & Portability

*Trip lifecycle beyond active use.*

**Shipped:**
- Public Archive (token-gated, PII-stripped, configurable publish delay)
- Export (JSON), Import, Clone, Closeout wizard

**Backlog:**
- **Archive stays plan-only — resolved (Trip Memory grill, 2026-06-09).** The earlier idea of "extend the archive to plan + memory" was **rejected**: [[Memory]] records are for the travelers, never the public (no tractable PII-strip for images). Memories are reviewed member-only at **Closeout**, not exposed in the [[Public Archive]]. See `docs/TRIP_MEMORY_PRD.md` / `docs/adr/0007-trip-memory-separate-capped-context.md`. The deferred cross-trip *private* "living record of all trips" is a separate future grill.

---

## Vault *(module — RETIRED v4)*

*Was client-side-encrypted storage for sensitive text (booking codes, passwords). **Removed in v4** — see ADR-0005. Encryption with a trip-shared password protected only against the operator/at-rest, not against fellow members, and a new app hasn't earned the trust to win a security contest against LastPass. The nav slot becomes [[Trip Documents]]; booking codes live on Item `confirmation_codes`.*

**Removal scope (v4):** drop `vault_entries` collection (deliberate exception to append-only migrations — no production data), remove `crypto.ts`, `vault-password.ts`, `/api/vault/unlock`, vault route. Tracked with the Documents work.

---

## Documents *(NEW domain — grilled 2026-06-07)*

*File/image artifacts — booking PDFs, tickets, tour vouchers, boarding passes. The "email folder of confirmations" the current stack relies on. Nothing exists today; PocketBase native file storage is unused.*

**Full design:** `docs/V4_DOCUMENTS_PRD.md`. Decision record: `docs/adr/0005-retire-vault-no-client-side-encryption.md`. Glossary: [[Document]], [[Trip Documents]] in `CONTEXT.md`.

**Shipped (2026-06-08):** S0 retire Vault (#69), S1 attach/view/delete on item (#70), S2 Trip Documents aggregate + trip-scoped upload (#71). Vault fully removed (migration 0031). `documents` collection (0032, + autodate fix 0041).

**Backlog (remaining v4 slices):** S3 clipboard paste (#73), S4 preview surfaces (#72), S5 offline precache (#74).

**Original design notes (kept for the remaining slices):**

### Documents domain
- **What:** Plain (unencrypted) artifacts (PDF/image), one `documents` collection. Parent scope {Item | Trip}, no Phase. One file per record, many per item. Membership-gated; no encryption, no sensitive flag (see ADR-0005). Added via file-picker upload **or clipboard paste** (screenshots). Types PDF+images, 10 MB cap, no count cap. Text codes stay on Item `confirmation_codes`.
- **Trip Documents aggregate view:** read-only union of all Documents, grouped by Item Type + a Trip-level section. Takes the **retired Vault's nav slot**. Per-item Documents section on item detail.
- **Offline:** automatic precache of the **active trip's** Documents (service-worker); cache-on-view for planning mode.
- **Permissions:** upload = non-viewer members (no review queue); delete = uploader or owner/co_owner; viewers read-only.

---

## Tasks *(NEW domain — generalizes checklists, packing, grocery, booking to-do)*

*One primitive: a checkable thing, optionally owned by a member, optionally with an execution context (a time or place). The three "lists" are views of this one model — do not ship them as three separate features.*

**Shipped (partial, as the legacy `checklist` item type):**
- `checklist` item type + `checklist_items` collection + `parent_item` self-relation. Currently shoehorned into the Item model (no anchor times, no location, no multi-day) — the odd type out.

**Backlog:**

### Task model + per-person assignments
- **What:** A Task: title, checked state, optional `owner` (member), optional execution context (time and/or place). Absorbs `checklist` (resolves [#45](https://github.com/toxroxmysox/Waypoint/issues/45) — checklist stops being a janky item type) and gives assignments for free ("who's booking the Airbnb, who's driving").
- **Target:** v4. **Notes:** This single model is the high-leverage move — three list features collapse into one domain.

### View: Packing list
- **What:** Manual entries, per-person assignable. Optionally weather-aware (see Integrations → Weather).
- **Target:** v4.

### View: Booking to-do
- **What:** Auto-filled from planned-but-unbooked items + manual add. Checking one off can flip the item's booking status (Tri-State Booking Pill, Itinerary).
- **Target:** v4.

### View: Grocery list (the edge case)
- **What:** A community list executed at a specific place/time (when someone goes to the store). I.e. a Task with a location/time trigger and shared (not per-person) ownership.
- **Target:** v4. **Notes:** Generalizes to "location/time-triggered checklist" — same primitive, just a place trigger.

---

## Trip Memory *(NEW context — grilled 2026-06-09, PRD shelved)*

*Captures what the trip actually felt like, not just the plan. Each member captures **one photo + one short thought, per day** — a curated highlight, not a journal. For the travelers, reviewed together at Closeout; never public.*

**Full design:** `docs/TRIP_MEMORY_PRD.md`. Decision record: `docs/adr/0007-trip-memory-separate-capped-context.md`. Glossary: [[Memory]], [[Note Before Bed]] in `CONTEXT.md`; new bounded context #6.

**Shipped:** Nothing.

**Status:** Grilled and fully specced; kept as a **firm PRD on the backlog, not sliced into issues** (issues are perishable — slice at milestone promotion, the Documents precedent). Not promoted into a milestone; `SPEC.md` untouched.

**Decisions (see PRD/ADR for full rationale):**
- **Memory ≠ Document** — separate entity/collection/context. Documents = used *during* the trip; Memory = remembering it *after*. Scope by entry point, no OCR.
- **Hard cap: one photo + one thought, per member, per day** (unique `(day, author)` index). The cap *is* the boundary that keeps this from becoming Apple Photos / Day One.
- **Member-only, excluded from the Public Archive** (archive stays plan-only — resolves the deferred "Documents/memory in archive" question too).
- **Capture:** Note Before Bed (Trip Mode, end of day) + live composer + retroactively in Closeout. **Review:** Trip Mode Today + Closeout. **No standalone gallery** (that's the deferred cross-trip "living record" product).
- **Storage:** PB file storage now, NAS later (reversible config, no ADR; cap kills the scale worry).

**Remaining (shelved, not issues yet):**
- **HEIC transcoding** — designed in the PRD as a *shared* Memory+Documents capability (client-side WASM, pre-upload); retires the HEIC caveat for both domains. Pull off the shelf at promotion.

---

## Integrations *(cross-cutting)*

**Shipped:**
- Google Places (New) — autocomplete + details, session tokens
- AeroDataBox — flight lookup
- Resend — invite/transactional email
- Umami — self-hosted analytics

**Backlog:**

### Calendar feed (subscribe, not export)
- **What:** A stable `webcal://` subscribed feed per trip; each event keyed by item id as its `UID`. Subscribe once → auto-syncs forever; edits/deletes propagate with zero further taps. Works for Google Calendar + iCloud.
- **Why a feed, not `.ics` export:** A one-time export creates the duplicate/delete problem. A subscribed feed meets all constraints (no dupes, no manual delete, one tap). A download-`.ics` button can exist as a fallback.
- **Target:** v4.

### Weather (Open-Meteo)
- **What:** Free, open-source, no API key (fits open-source-first). Planning-side: feeds the packing list. Execution-side: forecast on the Now tab.
- **Target:** v4. Widget, not a domain.

### Maps deep-links ("Open in Maps")
- **What:** Deep-link out to the device's map app (`maps://` / `https://maps.google.com/?q=`) from an item's stored Places coords. NOT an embedded map (embeds are off the table) — a link out.
- **Target:** v4. Execution glue.

### Email digest (not push)
- **What:** Weekly "here's what changed on your trip" email via Resend. The realistic engagement lever for non-technical friends who won't open the PWA unprompted (push notifications are off the table).
- **Target:** v4.

---

## Misc / Polish

- **App Icon Artwork Refresh** — regenerate `icon-192.png` / `icon-512.png` + apple-touch-icon in the paper/ink/moss palette. Related: open bug [#38](https://github.com/toxroxmysox/Waypoint/issues/38) (iOS wrong icon). Maskable variant keeps safe area.

---

## Off the table (recorded so they aren't re-proposed)

Per CLAUDE.md: multi-currency, push notifications, embedded maps, real-time co-editing, native apps, AI-generated itineraries. Plus (this session): trip-level messaging/discussion beyond item comments.
