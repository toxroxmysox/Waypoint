# ADR-0016: Confirmation codes become first-class Documents (code objects)

**Status:** Accepted
**Date:** 2026-06-28
**Deciders:** Scott
**Context:** Confirmation codes live today as a `json` field `items.confirmation_codes` (`backend/pb_migrations/0006_items.js:39`), shape `{ label, value }[]` (`src/lib/itinerary/types.ts:45`). They are **read across 28 files** (incl. export / portability / clone / import / trip-mode), surfaced in the Documents window via `itemsWithCodes()` (`src/lib/documents/grouping.ts:83`). The Documents capability (S1, #70) introduced a `documents` collection (`0032_documents.js`) that is **file-centric** — `file` is `required: true`. A code is conceptually a trip-private artifact attached to an item, identical in scope to a Document; keeping it as a sidecar JSON blob on items duplicates the artifact concept and blocks codes from the Documents window's grouping/permissions. This ADR was cited as "accepted, unbuilt" across CONTEXT.md, BUILD_PLAN.md, CAPABILITY_MAP.md, and SPEC_BACKLOG.md before being written; it is formalized here to back issue #268.

## Decision

### A code is a Document of `kind: code`
The `documents` collection becomes the single home for both file artifacts and confirmation codes, discriminated by a new `kind` field (`file` | `code`). A code Document carries `code_label` + `code_value` instead of a `file`; it keeps the same `trip` / `item` scoping, member permissions, and lifecycle as a file Document.

### Schema is extended, never re-shaped (append-only)
- Add `kind` — select, values `['file','code']`, **default `file`** so every existing row stays valid without a data rewrite.
- **Relax `file` to `required: false`** (a code row has no file).
- Add `code_label` (text, optional) + `code_value` (text).
- All changes land in a single append-only migration (`0057`). The legacy `items.confirmation_codes` field is **never deleted** (PB rule: migrations only append).

### file-XOR-code is enforced in the hook, not the schema
PB's schema can't express "exactly one of file / code." The existing `documents.pb.js` hook gains a create/update guard: `kind: file` requires a `file`; `kind: code` requires a non-empty `code_value`. (PB-rules-first holds for access control; this is structural validation = hook territory.)

### Backfill, one code Document per legacy entry
The migration backfills: for every item with a non-empty `confirmation_codes`, create one `kind: code` Document per `{ label, value }` entry (`trip`, `item`, `code_label`, `code_value`). `documents.uploaded_by` is a **required** `trip_members` relation that codes never had → fall back to the item's `booked_by` member, else the trip-creator member. `uploaded_by` is stored for schema integrity but is **not surfaced in the UI for code rows** (see below).

### Codes render as a distinct chip, with no attribution
In the Documents window a code is **not** a file card — it renders as a distinct `label: value` copyable chip. Code rows **do not show an "added by" attribution** (it would be a fiction for backfilled codes and noise for new ones); `uploaded_by` remains in the data only.

## Considered and rejected
- **Separate `codes` collection.** Rejected: a code is the same artifact concept as a Document (trip/item-scoped, member-permissioned, shown in the Documents window). A parallel collection duplicates rules, hooks, grouping, and portability plumbing for no gain.
- **Keep `items.confirmation_codes` as the source of truth, mirror into Documents for display.** Rejected: two writable homes for one fact invites drift; the point is to make Documents canonical. Legacy field goes inert (read-stop), not dual-written.
- **Reuse `caption` as the code label.** Rejected: `caption` carries file-description semantics; overloading it muddies both. Explicit `code_label` / `code_value` keep the discriminated shapes clean.
- **Surface `uploaded_by` on code rows.** Rejected by Scott: backfilled attribution is a fiction; hide it for codes.

## Consequences
- One append-only migration `0057` (schema + backfill). `documents.pb.js` gains a kind-XOR validation guard.
- The 28 `confirmation_codes` read sites repoint to code Documents capability-by-capability (export / portability / clone / import included). `itemsWithCodes()` flips from reading `items.confirmation_codes` to `documents` rows of `kind: code`.
- `items.confirmation_codes` is left **inert** — still written by nothing new, never deleted; old data remains for rollback safety.
- Touches export/portability → round-trip must hold; **`pnpm test:e2e` is a gate** on the read-repoint slice.
- Sliced into 3 PRs per #268: (1) migration + code object + backfill; (2) repoint readers; (3) leave legacy inert. Slices 2–3 depend on 1.
- CONTEXT.md's **Documents** term already names this ([[Documents]] = trip-private artifacts **and** confirmation codes).
