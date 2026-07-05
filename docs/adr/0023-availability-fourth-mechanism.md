# ADR-0023: Availability is a capped 4th group-input mechanism — not a Vote

**Status:** Accepted
**Date:** 2026-07-05
**Deciders:** Scott
**Context:** Issue #271 (Ideation → When + availability, S13 grill). Grilled 2026-07-05 with
`grill-with-docs` against `docs/CAPABILITY_MAP.md` §1, `docs/SPEC_BACKLOG.md`, ADR-0004/0009
(vote-likes kept split), ADR-0008 (member-removal tombstones), ADR-0022 (forming lifecycle), and the
Candidate Scenarios design (`docs/superpowers/specs/2026-07-03-scenario-building-design.md`, #337).
Unblocked by forming (#270), now shipped.

## Decision

Availability is the **fourth group-input mechanism** — alongside the Vote, pros/cons, and the
availability-*less* scenario weighing — and it is **not a Vote**. Each member paints, on a calendar
for a **forming** trip, when they are free. The tool **surfaces** consensus; it never ranks.

1. **Not a Vote.** A new `availability` collection, never a reskin of `votes` / `goal_votes` /
   `suggestion_votes` (ADR-0004/0009 keep vote-likes split, and this one diverges harder: a "maybe"
   has no Vote analog and aggregation is consensus-surfacing, not score-sort).
2. **Two paint values: `available` | `maybe`.** No "unavailable", **no red**; a blank day = no
   response. (This *narrows* the CAPABILITY_MAP's documented "yes/maybe/no" — see Consequences.)
3. **Per-(trip, member, day) cells.** One row per painted day with its value; blank persists nothing.
   Aggregation is a pure per-day group — no interval math.
4. **No ranking — surface, don't score.** A day is **green** only when *every trip member* marked
   `available`; any `maybe` or blank → **yellow**. The organiser reads the marks and picks; the
   system never orders windows. Green legitimately un-greens as new members join (green means
   "everyone currently in the group is confirmed").
5. **Derived canvas extent.** The paintable range is computed — today through the min/max of painted
   ranges ± 2 weeks — never a stored "canvas" record.
6. **Trip-scoped, growable.** The canvas lives on the trip. "When am I free" is UX framing; a
   later user-level personal-availability asset (cross-trip, like the avatar) is an additive
   migration, not a rebuild.
7. **Two-tier participation (the "poll is the invite" new-user model).** Respondents are
   `trip_members`; tombstones (`removed_at`, ADR-0008) apply. Two tiers of entry:
   - **Tier 1 — poll respondent (no OTP).** Tap the share link → the calendar renders immediately →
     **paint your days, then give a name only** → a **name-only Placeholder Member** is created and
     your availability cells are saved. No email, no code — the availability poll is the low-friction
     surface. A soft cookie identity (`soft_token`) keys re-entry so the same person re-paints the
     *same* placeholder instead of spawning duplicates; a "that's me" re-entry picker (the existing
     name-only placeholder list from `lookup`) is the fallback.
   - **Tier 2 — full member (OTP).** To leave the poll and enter **the rest of the trip** (ideas,
     scenarios, itinerary — everything beyond availability), verify email via OTP. That **claims the
     placeholder into a real member** (`user` set on the same row — the existing email-match / claim
     machinery), so no availability cells are orphaned.
   This is a deliberate, scoped acceptance of a **new anonymous write path** (a `/api/poll/paint`
   sibling to `accept`) — the one place we trade the unique-`(trip,user)`-index dedup guarantee for
   zero-friction poll entry, bounded to the availability surface and mitigated by the cookie + re-entry
   picker. Green counts name-only respondents (they *are* the poll's point); duplicate-across-devices
   is an accepted residual, softened by the cookie, and an organiser can merge/eject via the existing
   tombstone. (Amends the CAPABILITY_MAP's "flat participants / no tombstone" line — see Consequences.)
8. **First-class direct promotion.** Pick a window → "set these dates" → the forming→dated cascade
   (the same one forming set-dates and scenario promotion fire). A trip can find dates via the poll
   with **no scenario at all**; when scenarios exist, availability also colours each scenario's
   window but is **never a competing date-setter** — the scenario's own window is the date.
9. **Forming-only input; frozen at promotion.** Availability is a forming-phase tool. It freezes
   read-only once dates are set and feeds the scenario **decision record** ("why these dates"). No
   re-poll on a dated trip in v1 (date changes stay the existing date-edit path).

## Considered and rejected

- **Fold into `votes` / `goal_votes`.** Rejected — the map's sharpest modeling call. "maybe" is a
  first-class third value with no Vote analog; aggregation is range/consensus, not weighted score.
  Folding it produces When2Meet-in-a-side-tab. Protected against future "just reuse Vote" pressure.
- **Keep the documented yes/maybe/no with a red "unavailable".** Rejected — no red, per product
  intent (invite-friendly, never discouraging). A blank already prevents a day from going green, so
  an explicit block is redundant in v1.
- **Rank / score candidate windows.** Rejected — surface the marks; a human picks. Matches the
  "not score-sort" hard line.
- **Separate flat-participant model** (initiator + respondents, no roles/tombstones, per the map).
  Rejected — a second membership system that must reconcile with `trip_members` at promotion. The
  existing Placeholder Member + join-token primitives already deliver low-friction participation;
  "flat participants" is UX, not a data model.
- **User-level personal calendar now.** Deferred — trip-scoped v1, growable later.
- **Per-member JSON blob / per-member interval rows.** Rejected for per-(member,day) cells: trivial
  aggregation, no interval-overlap ambiguity, negligible row counts on a bounded canvas.
- **Availability sets dates only through a scenario.** Rejected — forces a scenario on a simple
  "when can we all do Chicago" trip. Direct promotion is first-class.

## Consequences

- **CAPABILITY_MAP §1 amended:** (a) Ideation roles reuse standard trip roles + tombstones — "flat
  participants" reframed as UX, not a data model; (b) the availability value model is `available` |
  `maybe` (no "no"); (c) "rank group windows" → "surface consensus; the organiser picks".
- **SPEC_BACKLOG "When + availability"** updated to match (no red; no ranking).
- **CONTEXT.md** gains an `[[Availability]]` glossary term (member × day → available|maybe, forming
  only, consensus-coloured, promotes to dates).
- **The "poll is the invite" new-user path** was walked by three parallel agents (2026-07-05):
  current-flow, lightest-possible, and the identity/abuse seam. Resolution = the two-tier model in
  Decision 7 (paint→name→placeholder, OTP to enter the rest of the trip). **Build invariants that
  MUST hold** (from the identity walk) or dedup/claim/purge break:
  1. Availability cells reference **`trip_members.id`**, never `user.id` or a cookie — claim mutates
     the same member row in place, so cells never need re-keying.
  2. The cell → `trip_members` relation is **`cascadeDelete: true`**, so a zero-ref respondent's
     hard-purge takes their cells and can't throw a required-FK 400.
  3. The availability collection is added to the **member-purge reference scan**
     (`MEMBER_RELATION_FIELDS`, `members.pb.js`) — the `test:rules` drift test goes **RED** until it
     is (a forcing function, not optional).
  4. Every availability read filters **`removed_at = ""`**, so a tombstoned member's cells drop out of
     the green computation automatically.
  A `soft_token` field on `trip_members` backs cookie re-entry for Tier-1 respondents.
- **Green un-greens as members join** — accepted and correct; the denominator is the live active
  member set (`removed_at = ""`).
- **Migration path to user-level availability** stays open (trip-scoped now is a strict subset).
- **Sequencing:** builds after #337 (Candidate Scenarios) integrates — scenarios ship with the empty
  group-row as planned, then #271 adds the collection + poll surface + back-fills that row.
