# ADR-0003: Checklists and Tasks are a standalone primitive, not an Item Type

**Status:** Accepted
**Date:** 2026-06-07
**Deciders:** Scott
**Context:** Issues #45 (checklist-as-item-type research), #41 (multi-day grill that surfaced it)

## Decision

Replace the `checklist` Item Type and its `checklist_items` collection with two new collections that sit *outside* the Item model:

- **`checklists`** — a named container with a **denormalized ancestor chain**: `trip` (required), `phase` (optional), `item` (optional). The attachment level is *derived*, never stored: `item` set → item-level; else `phase` set → phase-level; else trip-level. Mirrors how `items` already carry `trip`/`phase`/`day`.
- **`tasks`** — a checkable line belonging to one `checklist` (required, `cascadeDelete`): `title`, `checked` (bool), `assignee` (optional `trip_members` relation), `order`.

A Checklist carries **no scheduling fields** (no date, time, or location). Execution context ("the 3pm grocery run at the store") belongs to the **Item the Checklist hangs off** — not to the Checklist or Task. This is the whole point of getting checklists *out* of the timeline.

The `checklist` value stays in the `ItemType` union as an inert **tombstone** (migrations are append-only), but the item-type picker stops offering it.

This closes #45: a checklist was never a *plan entry on a day* — no anchor times, no votes, no multi-day span — so it doesn't belong in the Item aggregate.

## Why

- **#45 / #41 evidence.** During the multi-day grill, `checklist` was the odd type out of every span/time/display decision. It has none of the Item machinery (`end_date`, votes, anchor times, Day relation) and was forcing those features to special-case it.
- **Polymorphic parent without losing referential integrity.** PocketBase relations are single-collection-typed. Denormalizing the ancestor chain (`trip`/`phase`/`item`) gives PB-native `cascadeDelete` at every level and makes permission rules the same shape as everything else (`checklist.trip.members`). A generic `parent_type`+`parent_id` FK was rejected — it orphans on delete and violates the project's "PB rules first" rule.
- **Uniform primitive, one derived exception.** Packing and grocery lists are ordinary user Checklists distinguished only by name. The booking **Smart List** is the *one* derived case: its Tasks are **projected from Items** (planned + `requires_booking` + not `booked`), not stored rows. Checking a projected row writes through to the Item's `booked` flag. Projection — not stored-and-synced rows — was chosen to avoid a sync engine (no orphans on Item delete, no drift when an Item is booked elsewhere, membership always correct by construction). The cost, accepted: projected Tasks carry no own assignee or notes.

## Considered and rejected

- **Keep `checklist` as an Item Type, rename `checklist_items` → `tasks`.** Does not close #45 — it just renames the child collection while leaving a checklist masquerading as a timeline plan-entry.
- **Generic FK (`parent_type` + `parent_id`).** One field pair, but no cascade, no referential integrity; hand-rolled cleanup. Rejected against "PB rules first."
- **Three mutually-exclusive nullable relations with a stored `parent_type` discriminator.** PB-native cascade, but the "exactly one set" invariant is app-enforced and easy to violate, and the discriminator can drift from the relations. Denormalizing the full ancestor chain (and *deriving* the level) is strictly safer.
- **Stored-and-synced booking Tasks** (each a row holding a relation to its source Item). More flexible (own assignee/notes), but requires a sync engine: Item booked → auto-check, Item deleted → orphan, new unbooked Item → append. Every one is a bug site. Rejected for projection.
- **Tri-State Booking Pill in this work.** `booked` stays an **orthogonal binary** flag (not a Status step — not everything is bookable, and `done` is a closeout terminal independent of booking). The tri-state pill is deferred; a binary checkbox maps 1:1 to "mark booked."

## Consequences

- **No data migration.** Pre-broad-dogfood; existing `checklist` Items are treated as disposable. The migration just creates the two collections and drops `checklist` from the picker. The `requires_booking` flag is added to `items`, pre-filled `true` for `lodging`/`flight`/`transportation`, `false`/absent otherwise.
- **Collaboration carve-out.** Tasks sit *outside* the Suggestion/Auto-approve pipeline by design — they're operational scaffolding, not itinerary-shaping content. All participating members (traveler+) create/add/check/assign/delete freely; viewers are read-only. No Task notifications in v1.
- **Lifecycle.** Closeout reviews the parent Item normally but ignores its Checklist. The Public Archive excludes Checklists (operational + assignee PII). Export/Import preserves structure and `checked` but **strips `assignee`** (trip-scoped member IDs won't resolve on import). Clone copies Checklists + Tasks but resets `checked = false` and drops `assignee` — carrying packing/booking *templates* forward, blank. The booking Smart List is never copied; it regenerates from the new trip's Items.
- **Reversibility.** Re-coupling checklists to the Item model later is a migration — non-trivial but not catastrophic.
