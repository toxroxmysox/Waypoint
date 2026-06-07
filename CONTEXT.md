# Waypoint -- Domain Context

Waypoint is a collaborative trip planning PWA. One trip owner creates a trip, invites members, and the group builds an itinerary together. After the trip, it can be closed out, archived publicly, and exported.

## Glossary

Terms are authoritative. Use these in code, issues, and conversation. Synonyms in parentheses are explicitly avoided.

| Term | Definition | Avoid |
|------|-----------|-------|
| **Trip** | Top-level aggregate. Has a slug, dates, status (planning/active/closed), and members. | journey, vacation, itinerary |
| **Phase** | A named time span within a trip (e.g. "Paris leg"). A trip has 0..n phases. Phases group days and items by location or theme. No individual colors — phase indicators use the current mode's accent color. | leg, segment, section, phase color, phase palette |
| **Day** | A calendar date within a trip. Belongs to 1..n phases (multi-relation). Planned and done items are assigned to a day; unplanned and considered items may or may not have one. | date (ambiguous with datetime) |
| **Item** | A plan entry within a phase: lodging, transportation, flight, activity, meal, note, or checklist. Has a type, optional anchor times, and a status (unplanned → planned → done/considered). An unplanned item belongs to a phase and is available for any day in that phase. A planned item is assigned to a specific day. May span multiple days via end date. | event, plan, entry, booking |
| **Item Type** | The category of an item. lodging (overnight stay), transportation (movement between places — can bridge phases), flight (air travel, has AeroDataBox integration), activity (things to do), meal (dining), note (free text). *(The former `checklist` type is superseded by the standalone Checklist primitive — see below. Closes #45.)* | category |
| **Checklist** | A named container of Tasks with a **parent scope**: attaches to exactly one of an Item, a Phase, or a Trip. A Trip may own several (e.g. "Things to Book", "Packing List"). Not an Item — has no votes, anchor times, or Day relation. Replaces the former `checklist` Item Type and its `checklist_items` collection. | checklist item type, sub-items |
| **Task** | A single checkable line within a Checklist. Fields: title, checked (bool), optional **assignee** (one Trip Member). Not an Item. | checklist item, todo, sub-item |
| **Smart List** | A Checklist whose Tasks are **projected from Items**, not hand-entered. The booking Smart List shows every planned Item that requires booking but isn't booked; checking a row sets the Item's `booked` flag. Read-and-check-off only — projected Tasks carry no own assignee or notes. | auto-list, generated checklist |
| **Booking Readiness** | An orthogonal binary `booked` flag on bookable Items — *not* a Status step. An Item "requires booking" via a per-Item flag, pre-filled true for lodging/flight/transportation. The Tri-State Booking Pill is a separate, deferred concept. | booked status |
| **Anchor Time** | An optional start time and/or end time on an item (e.g. "09:15", "15:30"). Items without anchor times are untimed. | start time, scheduled time |
| **Time Slot** | A soft display grouping derived from anchor times: Morning (before noon), Afternoon (noon–5pm), Evening (after 5pm). Never stored — always computed. Items without anchor times appear in an "Anytime" group. Replaces the former rigid Slot enum. | time block, period, slot (as stored enum) |
| **Sort Order** | An integer on an item used for drag-to-reorder positioning of untimed items within a day view, relative to anchored items and time slot headers. Implementation detail, not a user-facing concept. | rank, priority, order |
| **Multi-day Item** | An item with an end date that differs from its day's date. Spans multiple days (e.g. a hotel stay). Displayed at the top of each spanned day. | spanning item |
| **Ongoing** | The temporal state of an item during Trip Mode when the current time falls between its start and end. A multi-day item becomes ongoing when its start date/time is reached. A single-day item with anchor times can also be ongoing. Not a type — a derived state. | in progress, active (ambiguous with trip status) |
| **Parking Lot** | The list of unplanned items within a phase. Not a separate data structure — a filtered view of items where status = unplanned. Visible on day views as phase-scoped suggestion cards. Colloquially "ideas." | backlog, wishlist, ideas list |
| **Trip Goal** | *(v4 — not yet built.)* A trip-level aspiration that isn't specific enough to be an item: "try paella," "do a wine tasting." Phase-less, location-less, time-less. A trip-scoped collection, sibling to phases (own sub-tab under Itinerary), captured with its creator. Zero or more items may be *linked* to a goal (a cross-cutting reference, not ownership — the item still lives in its phase). **Status** mirrors Item Status and is **derived** from the highest-maturity linked item, ordered `done > planned > unplanned > considered` (so a goal is `considered` only when every linked item is); a goal with no linked items takes a **manual** status instead. Reviewed in the closeout wizard. The *capture* half of the group-input cluster (see [[Swipe-Quiz]] for the *harvest* half). | wish, bucket list item, achievement |
| **Trip Member** | A user (or placeholder) associated with a trip. Has a role. | participant, collaborator |
| **Role** | Permission level: owner, co_owner, traveler, viewer. Governs what actions a member can take. | permission, access level |
| **Placeholder Member** | A trip member without a user account. Has a display_name and optional email. Claimable when the real user signs up. | ghost member, stub |
| **Suggestion** | A proposed item or comment submitted by a traveler. Goes through review (pending/approved/rejected) unless auto-approved. | proposal, request |
| **Auto-approve** | Trip-level setting, on by default. When on, traveler contributions become unplanned items immediately. When off, contributions enter the suggestion review queue and the UI shows the traveler that their input will be reviewed by the trip owner. | |
| **Expense** | A money record tied to a trip: who paid, how much, how it splits. | cost, charge, payment |
| **Settlement** | A payment between two members to settle debts. | reimbursement |
| **Budget** | Per-category spending limits for a trip. Mode is per_day or total. | |
| **Debt Simplification** | Algorithm that reduces N pairwise debts to a minimal set of transfers (greedy creditor/debtor matching). | |
| **Vote** | A member's preference on a votable target. One vote per member per target. Four options: Love (+2), Like (+1), Flexible (0), Dislike (-2). Score is never shown numerically — only the relative order and who voted what (avatar stacks). Two independent targets, each its own collection: **items** (`votes`) sort the parking lot; **goals** (`goal_votes`) sort the Goals/capture view. Votes never roll up across the goal↔item link — a goal's score is its goal-votes only, an item's its item-votes only (you can Love a goal yet Dislike a linked item). The shared scoring/stack logic lives in `voting.ts`; only the collection differs. | rating, star, like |
| **Swipe-Quiz** | *(v4 — not yet built.)* A card-stack minigame for *harvesting* member preferences: walks one member through trip items, one card at a time, casting a [[Vote]] per card. The deck holds only items that member **hasn't voted on yet** (planned **and** unplanned); a voted card drops off, so the stack drains to empty. Scope is **user-chosen** — a single phase or the whole trip — and finishing one phase offers to continue to the next. Writes the same `votes` records as the per-item vote buttons (one vote per member per item); re-voting happens on item detail, not in the deck. The *harvest* half of the group-input cluster; the *capture* half is the [[Trip Goal]] minigame. | swipe deck, tinder, quiz |
| **Vault** | Encrypted storage for sensitive trip data (booking codes, passwords). AES-GCM with PBKDF2 key derivation. Lossy if password forgotten. | |
| **Item Status** | Required field on every item. Lifecycle: unplanned (on the trip as an option, phase required, day optional) → planned (committed, phase and day required, may need booking) → done (closeout: we did it, day required) or considered (closeout: we didn't do it, day optional — covers both skipped-planned and never-planned items). Colloquially, unplanned items are "ideas." | state |
| **Closeout** | End-of-trip review wizard. Walks through planned items day-by-day — mark each done or considered. At the end of each phase, reviews unplanned items: keep for archive (marked considered) or remove, with an option to bulk auto-consider. New items can be added during closeout for things that happened spontaneously. | wrap-up, post-trip |
| **Public Archive** | Read-only, token-gated view of a closed trip. PII stripped. Published after configurable delay. Surfaces `done` items. *(Planned, owned by the Trip Memory grill — not v4 Trip Goal:* a "what we set out to do" summary of [[Trip Goal]]s, titles + derived status only, no creators or votes.) | shared link |
| **Notification** | In-app alert (no email/push). Types: suggestion_added, comment_added, member_joined. | |
| **Invite** | A pending invitation to join a trip. Has a code, role, and 7-day expiry. Sent via Resend email. | |
| **Claim** | The act of a new user taking ownership of a placeholder member record that matches their email. | merge |
| **Planning Mode** | The default UI mode for building an itinerary: day view, drag-reorder, phase management, full item editing. Available in all trip statuses. 5-tab navigation (Itinerary, Money, Activity, Vault, More). | edit mode |
| **Trip Mode** | The live-trip UI mode: what's happening now, today timeline, quick actions. Available only when trip status is active. Default mode for active trips. User can switch to Planning Mode and back. 4-tab navigation (Now, Today, Add, Vault) with clay accent. | active mode, live view |
| **Design Tokens** | Semantic CSS custom properties in layout.css: colors (ink, paper, moss, clay, gold, sky, error), fonts (Fraunces display, Inter body, JetBrains Mono mono), shadows, z-index, breakpoints. Full reference: `docs/design-system.md`. | |

## Bounded Contexts

Waypoint is a single-context app (no microservices). Internally, the domain splits into these functional areas:

1. **Itinerary** -- Trips, Phases, Days, Items, Checklist Items, Parking Lot. The core planning model.
2. **Collaboration** -- Trip Members, Roles, Invites, Placeholder Claims, Suggestions, Comments, Notifications, Votes. Multi-user coordination and group decision-making.
3. **Money** -- Expenses, Settlements, Budgets, Debt Simplification. Financial tracking.
4. **Trip Mode** -- The live-trip experience: NowCard, today timeline, mode switching, ongoing state detection. Active only when a trip's status is "active."
5. **Archive & Portability** -- Public Archive, Export, Import, Clone, Closeout. Trip lifecycle beyond active use.
6. **Shell** -- Auth (OTP), PWA (service worker, A2HS, offline), AppShell (responsive layout, Planning Mode nav, Trip Mode nav), Design Tokens, Navigation (view transitions, DayNav). Infrastructure that wraps the domain.

**Not a bounded context but a standalone module:** Vault (AES-GCM encryption, trip-scoped password). A technical capability used by the domain, not a domain boundary itself.

## Collection Ownership

| Collection | Functional Area |
|-----------|----------------|
| users | Shell |
| trips | Itinerary |
| trip_members | Collaboration |
| phases | Itinerary |
| days | Itinerary |
| items | Itinerary |
| checklist_items | Itinerary |
| pending_invites | Collaboration |
| suggestions | Collaboration |
| notifications | Collaboration |
| expenses | Money |
| settlements | Money |
| trip_budgets | Money |
| votes | Collaboration |
| vault_entries | Vault (module) |
