---
status: accepted
amends: 0008-member-removal-semantics
---

# Purge a zero-reference member instead of tombstoning

## Context

ADR-0008 made member removal a soft-remove tombstone to protect authored records
(money above all). It also stated the row "hard-deletes only if nothing references it
after the chosen disposition" — but the implementation (`backend/pb_hooks/members.pb.js`)
never did that; every removal tombstones. So a typo'd placeholder with nothing attached
becomes a permanent [[Departed Member]] tombstone, cluttering the roster (surfaced by
#232 / #238). The tombstone exists only to keep authored records' identity intact; with
zero authored records there is nothing to preserve.

## Decision

A `trip_members` row with **zero referencing records is purged (hard-deleted)**, not
tombstoned. This makes ADR-0008's stated intent true in code.

- **Auto-purge at removal.** After the chosen disposition runs and votes are dropped,
  the remove hook checks the full reference set; if nothing references the member it
  **deletes** the row instead of stamping `removed_at`, and returns which happened
  (`deleted` | `tombstoned`).
- **Reference set (exhaustive, verified from `members.pb.js`).** Money:
  `expenses.paid_by/created_by`, `settlements.from_member/to_member/created_by`.
  Non-money: `suggestions.author/reviewed_by`, `trip_goals.created_by`,
  `documents.uploaded_by`, `items.created_by/paid_by/booked_by/assigned_to`,
  `tasks.assignee`. **Votes** (`votes.member`, `goal_votes.member`) are always dropped on
  removal, so a vote-only member is zero-ref → purged.
- **One-time backfill.** A migration purges existing zero-ref tombstones using the
  *same* reference check as the hook (single source of truth). It mutates real trips, so
  it is idempotent and verified on a snapshot before deploy.
- **UX — distinct dialog.** When the Remove dialog opens for a zero-ref member, the
  keep/reassign/cascade disposition picker is skipped in favour of a "Delete permanently
  — this can't be undone" confirm. Members with data keep the disposition picker. The
  zero-ref check runs lazily for that one member on dialog open; the hook re-checks
  server-side as the source of truth.
- **Authority unchanged.** Owner/co_owner only; self-leave stays tombstone-only (a leaver
  cannot purge themselves); frozen on a closed trip.

## Considered and rejected

- **Keep tombstoning always (status quo); add a separate "Delete permanently" button.**
  Honours the principle only by manual action and still shows the disposition picker for
  members with nothing to dispose. Auto-purge is the honest default; a separate button is
  redundant once removal itself purges. Rejected (folded into auto-purge).
- **Keep a tombstone for every member who was ever on the trip (a "was here" record).**
  Contradicts ADR-0008's framing that the tombstone exists for authored-record identity.
  A vote-only / no-data member has no identity to preserve. Rejected.

## Consequences

- Removal is sometimes irreversible — hence the distinct confirm copy.
- The Former-members disclosure (#232) only ever holds members who left data behind.
- Concurrency: if a reference appears between the dialog check and the delete, the hook
  tombstones instead and reports the real outcome; PB's required-FK 400 is the backstop.
- SPEC reconciliation (member/roster section) lands with #238's build slice, not here.

## Amendment — grill 2026-06-19 (#238 build readiness)

Re-grilled before dispatching the build slice. Auto-purge-at-removal and "no separate button"
re-confirmed (as decided above). Three refinements:

1. **The reference set MUST also cover `expenses.split_data` (JSON) — no FK protects it.** The set
   above is FK-only and is therefore incomplete. `split_data` embeds member ids — `{members:[ids]}`
   for an equal split and `{amounts:{memberId:n}}` (keyed by member id) for by_amount. A member who is
   *only* a split participant (someone else paid; they owe a share) is genuinely referenced yet
   invisible to every FK check. The purge check scans each trip expense's `split_data` for the member
   id; a hit → tombstone. Without this, a member owed money inside a split could be hard-deleted →
   orphaned id → broken `debt-simplify` balances. *(The inverse gap exists in ADR-0008's reassign
   disposition, which rewrites `paid_by`/`created_by` but not `split_data` — tracked as #259.)*
2. **Drift-proofing replaces trusting the hand-list.** The FK list is a single source-of-truth
   constant; a schema-introspection test enumerates every collection whose relation field targets
   `trip_members` and fails if one isn't in the constant — so a future member-relation migration goes
   RED in CI until the purge check is updated. (The hand-list already drifted: #238's original body
   omitted `expenses.created_by`, `settlements.created_by`, `items.paid_by`, `items.booked_by`,
   `tasks.assignee`, and all of `split_data`.)
3. **One-time backfill deferred OUT of the AFK build.** Purging *existing* zero-ref tombstones
   hard-deletes real production rows — a real-data mutation that cannot run unattended (PM hard-stop:
   dry-run + eyeball + sign-off). #238 ships forward behavior only (new removals auto-purge). The
   backfill is a separate HITL dry-run, deprioritised (one dogfood trip's tombstones; harmless).
