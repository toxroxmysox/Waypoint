# ADR-0007: Trip Memory is a separate, deliberately-capped context — not Documents

**Status:** Accepted
**Date:** 2026-06-09
**Deciders:** Scott
**Context:** `docs/TRIP_MEMORY_PRD.md` (Trip Memory domain); `SPEC_BACKLOG.md` → Trip Memory / Trip
Mode / Archive & Portability. Follows the just-shipped Documents domain (`docs/V4_DOCUMENTS_PRD.md`,
ADR-0005), which raised the question this ADR answers.

## Decision

The v4-shipped **Documents** domain stores images/PDFs in PocketBase. A **Trip Memory** photo is also
an image in PocketBase. They are nonetheless **separate entities, in separate collections, in separate
bounded contexts** — a [[Memory]] is not a [[Document]] and not a flavor of one.

Further, Trip Memory is governed by a **hard cap built into its data model**: **one photo and one
thought, per trip member, per day** (a unique `(day, author)` index). The cap is not a UI nicety — it
is the architectural boundary that defines what Trip Memory *is*.

Two coupled calls, one ADR because they share a single rationale (apply "earn the right to compete
before replacing" to experiential capture):

1. **Separation:** `memories` is its own collection in its own context, never merged with `documents`.
2. **The cap:** one photo + one thought per member per day, DB-enforced; editing replaces.

## Why

**Both are images in PocketBase — so why two collections?** Because "image in PB" is the *only* thing
they share, and it's an implementation detail. On every axis that carries domain meaning they are
opposites:

| Axis | **Document** | **Memory** |
|------|--------------|------------|
| Role | Reference — retrieved to *show* (boarding pass at a gate) | Experiential — revisited to *remember* |
| Lifecycle | Created pre/during, consumed **during** (execution) | Created during, consumed **after** (reminiscence) |
| Offline | Precached for the active trip — needed offline, under pressure | None — never execution-critical |
| Organization | Grouped by **Item Type** (boarding passes, vouchers) | Grouped by **Day** (the experiential timeline) |
| Audience | Trip members (execution) | Trip members (reminiscence) — **never** public |
| Scale | A handful | Capped: ≤ one per member per day |
| File types | PDF + images | Images only |

Merging them forces a discriminator and then immediately *re-splits* on offline behavior, grouping,
permissions, file-type rules, and public-archive exposure — i.e. the "shared" collection is shared in
name only. Concretely, conflation produces wrong behavior: vacation photos would precache for offline
(wasteful) and surface in the Trip Documents aggregate **mixed in with boarding passes, grouped by
item type** — visibly wrong. The Documents grill already rejected the same DRY temptation internally
(ADR-0005 lineage / Documents Q2: "one collection with a discriminator — later collapsed").

**Why the cap is architectural, not cosmetic.** Without it, Trip Memory has no natural stopping point
before it becomes a photo manager (Apple Photos) or a journaling app (Day One) — full-roll import,
albums, filters, tags, moods, multi-note-per-day feeds. Waypoint hasn't earned the right to compete
with those, exactly as it hasn't earned the right to replace WhatsApp for messaging (the messaging
scope decision). The cap makes that boundary **physically unreachable**: you *cannot* become Apple
Photos when the model holds one photo per member per day. The product's restraint is enforced by the
schema, not by discipline. Waypoint's unique, defensible value isn't storage or editing — it's
**context**: the curated highlight bound to the shared itinerary and reviewed together at closeout,
which a generic photo/journal app cannot offer.

**Member-only, never public** follows from the same "for the travelers" framing and also eliminates
the hardest privacy problem by construction: memory photos contain faces, kids, locations — there is
no clean PII-strip for an image, so the safe answer is to never expose memories in the token-gated
Public Archive at all. The Public Archive stays plan-only.

## Considered and rejected

- **One `images`/`media` collection with a `kind` discriminator (Memory | Document).** Rejected: DRY at
  the storage layer that the domain immediately undoes — divergent offline, grouping, permissions,
  file-type, and public-exposure rules. Coding convenience overriding domain clarity.
- **Memory as a flavor/subtype of Document** (e.g. a `documents.category = "memory"`). Rejected: it
  would inherit Documents' offline precache, Item-Type grouping, and aggregate-view surfacing — all
  wrong for reminiscence — and would tempt cross-promotion that blurs both contexts.
- **No cap (freeform photos + multi-note journaling).** Rejected: removes the only thing keeping Trip
  Memory from drifting into a photo/journal app it can't win. The cap is the feature.
- **Memories in the Public Archive** (the original Archive-extension framing "share plan + memory").
  Rejected: memories are for the travelers; no tractable PII-strip for images; member-only is safer and
  simpler.

## Consequences

- **New bounded context** in `CONTEXT.md` (Trip Memory, #6) with its own `memories` collection. The
  glossary gains [[Memory]] and [[Note Before Bed]]; [[Public Archive]] is clarified as plain-only.
- **The cap is load-bearing and easy to relax, hard to reverse-engineer back in.** Loosening "one per
  day" later is a constraint change; a future "living record" product can build *on* memories without
  re-deciding what a memory is. Tightening an uncapped store later would be the painful direction —
  which is why the tight default is the right hard-to-reverse call now.
- **Two upload paths share one latent concern: HEIC.** Both Documents and Memory accept HEIC and can't
  render it in some browsers. The fix (client-side WASM transcoding) is designed once as a shared
  capability serving both (`TRIP_MEMORY_PRD.md` → HEIC transcoding), deferred.
- **Storage gets no ADR.** PocketBase file storage now, NAS/home-server later, is a reversible storage-
  backend config; the per-day cap removes the scale trade-off that would have made it ADR-worthy.
- **"Earn the right" reaffirmed.** As with the retired Vault (ADR-0005) and minimal messaging, Trip
  Memory ships the smallest honest thing; the richer cross-trip reminiscence product returns later as a
  deliberate, demand-backed feature — not a default nobody asked for.
