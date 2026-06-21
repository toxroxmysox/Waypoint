# ADR-0016: Confirmation codes move into the Documents capability

**Status:** Accepted (2026-06-21)
**Context source:** capability-map grilling walk (`docs/CAPABILITY_MAP.md`).

## Context

Confirmation codes (booking refs, PINs) have lived as a JSON array on `items.confirmation_codes`, and the Documents module was deliberately **artifacts-only**. The `CONTEXT.md` glossary states it explicitly: *"copy-pasteable text codes live on the Item's `confirmation_codes` field, **not** here"* (the V4 Documents grill decision). The `V4_DOCUMENTS_PRD.md` and `CARD_CONTENT_SPEC.md` carry the same placement.

During the capability walk, two things pushed the other way:
1. A code and a file usually arrive **together** (a booking emails you a PDF *and* a confirmation number).
2. The item card already shows a "Documents" window; users look there for "the proof of this booking," whether that proof is a file or a code.

## Decision

The **Documents** capability **natively owns confirmation codes** as a second data object — a text *code* (`label` + `value`) — alongside file artifacts. Both scope to an Item or the Trip and surface in the **same Documents window** on the item card and in the Trip Documents aggregate. This reverses the prior "artifacts-only / codes-on-item" decision.

## Consequences

- **+** One window per item for both proof types; one mental model ("Documents = the proof").
- **+** Codes inherit Documents' grouping, offline precache, and membership gating.
- **−** Data migration: `items.confirmation_codes` (JSON on items) → a Documents-owned code object scoped to item/trip. Append-only per the PB migration rule; the legacy field is left **inert**, not deleted.
- **−** Documents is no longer "artifacts only."
- **Docs to reconcile:** `CONTEXT.md` glossary (Document entry), `V4_DOCUMENTS_PRD.md`, `CARD_CONTENT_SPEC.md`.

## Alternatives considered

- **Keep codes on the Item** (status quo) — rejected: splits "the proof of this booking" across two surfaces (codes on the item form, files in Documents) when they almost always travel together.
