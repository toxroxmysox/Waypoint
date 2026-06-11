---
status: accepted
---

# Member removal is a soft-remove tombstone, not a delete

## Context

Removing a `trip_members` row 400s (`required relation reference`) once the member
has authored anything: `suggestions.author`, `expenses.paid_by`/`created_by`,
`settlements.from_member`/`to_member`/`created_by`, `trip_goals.created_by`, and
`documents.uploaded_by` all point **required + non-cascading** at `trip_members`
(#133). The hard constraint is money: an [[Expense]]'s `paid_by` and a
[[Settlement]]'s `from_member`/`to_member` are immutable financial facts — the rest
of the group's debts depend on them. They can be neither nullified (required) nor
cascade-deleted (that silently erases what others owe) nor falsified by reassigning
to a different payer without intent.

## Decision

**Removal is a soft-remove.** The `trip_members` row is *retained as a tombstone*
(a [[Departed Member]]) so authored records keep their identity. Concretely the
remove hook: snapshots `users.name` → `display_name`, **clears `user`** (which
severs access instantly — no membership rule matches their auth id, so *zero* of
the ~12 collection rules change), and sets a new `removed_at` field. The departed
member renders with a distinct **tombstone avatar**. The row hard-deletes only if
nothing references it after the chosen disposition.

Disposition of the departed member's authored records, chosen by the remover:

- **Money (expenses, settlements)** — *never deleted.* Keep-with-tombstone (default)
  or reassign to another member. This is the invariant the whole design protects.
- **Non-money (suggestions, goals, documents, comments, item authorship, task
  assignments)** — remover's choice of keep-with-tombstone / reassign / cascade-delete.
- **Votes (`votes`, `goal_votes`)** — *always dropped* (kept their existing
  `cascadeDelete: true`). A departed member's live preference shouldn't steer the
  parking-lot order; the one deliberate exception to "keep their contributions."

**Self-leave is tombstone-only** — a leaver can't reassign their debts onto others
or cascade away expenses others split. The full three-way choice belongs to
owner/co_owner removal, which can also act on an *existing* tombstone later (removal
is a durable, reviewable state, not a one-shot). Allowed in `planning` + `active`;
a `closed` trip's roster is frozen.

## Considered and rejected

- **Keep `user`, add `&& removed_at = ""` to every membership rule.** PB's `?=`
  multi-relation operator can't correlate "the row where `user == me` *and*
  `removed_at` is empty" (the limitation RULES.md already documents for
  `trip_goals.created_by.role`). Fragile across 12 collections, with a real risk a
  removed member silently retains access. Rejected.
- **Cascade-delete everything authored.** Simplest (flip `cascadeDelete` on) but
  violates "money can't just vanish" — deleting a shared expense erases the split
  the rest of the group owed. Rejected for money; offered as an opt-in only for
  non-money content.
- **Reassign all children to one shared "Former member" placeholder.** Two departed
  payers both collapse to "Former member" — money history loses individual identity.
  Rejected in favour of per-member tombstones.

## Consequences

- New `removed_at` field on `trip_members` (append-only migration 0045+). `Avatar.svelte`
  gains a "departed" tombstone variant. `/api/members/remove` is rewritten from a raw
  `e.app.delete` into the soft-remove + disposition hook.
- A departed member loses their avatar on historical records (avatar lives on the now-unlinked
  `users` row) — by design, replaced by the tombstone graphic.
- Every **claim / join surface must exclude `removed_at != ""`** — see the cross-issue
  note in `MEMBERSHIP_LIFECYCLE_PRD.md`. The #118 name-only claim picker query
  (`user = "" && placeholder_email = ""`) currently *matches* a tombstone; it must add
  `&& removed_at = ""` or a removed member becomes re-claimable.
- A re-invited departed member starts a *fresh* row; their tombstone's history stays put.
  Owners can reassign old records to the new membership if they want continuity.
- Harness: `test-rules.mjs` `trip_members.delete` fixture switches to a childless
  delete-target so the 4 perennial red cells go green (378/378).
