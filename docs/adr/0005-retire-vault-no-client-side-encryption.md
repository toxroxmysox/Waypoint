# ADR-0005: Retire the Vault — no client-side encryption; ship plain Documents instead

**Status:** Accepted
**Date:** 2026-06-07
**Deciders:** Scott
**Context:** `docs/V4_DOCUMENTS_PRD.md` (Documents domain); `SPEC_BACKLOG.md` → Documents / Vault; supersedes the encryption fork recorded in the original Documents backlog entry.

## Decision

The shipped **Vault** — client-side AES-GCM encryption (PBKDF2, trip-scoped password) for sensitive
text — is **removed entirely**, code and collection. Its nav slot is repurposed for the new
[[Trip Documents]] surface. The v4 Documents domain stores artifacts (PDF/image) as **plain files**,
gated only by the same trip-membership rules that protect all other trip data. There is no `sensitive`
flag and no encrypted-file variant.

## Why

Client-side encryption with a **trip-shared** password protects against exactly one thing: at-rest
confidentiality against the operator or a DB/file-storage breach. It does **not** protect a document
from other trip members (they hold the password), and it adds **nothing** against non-members, who are
already blocked by PB list/view rules — a plain file gets the identical membership gating.

That narrow marginal protection doesn't justify the cost (lossy-if-password-forgotten, the password
gate, decrypt-on-view, and a net-new binary-encryption path the text-only Vault never had). The
decisive point came from dogfood feedback: a new app hasn't **earned the trust** for users to put a
passport or password into it over a tried-and-true tool (LastPass/1Password) — so the encrypted store
loses a security-trust contest it was built to win. The execution-critical artifacts people *will*
store — train tickets, hotel/tour confirmations, boarding passes — need availability (offline at the
gate), not secrecy. Plain, membership-gated, service-worker-cached files serve that directly.

Copy-pasteable text codes already have a home: the Item `confirmation_codes` field. The Vault's text
entries were redundant with it.

## Considered and rejected

- **Keep encryption, gate passport-class files behind a `sensitive` flag** (the original backlog fork).
  Rejected: routing a multi-MB binary into the text-only `vault_entries` was never mechanically
  possible as written, and the trust argument kills the feature regardless of mechanism.
- **De-encrypt the Vault but keep it as a separate plain text-entry tab.** Rejected: an unencrypted
  "vault" of booking codes is redundant with Item `confirmation_codes` and wastes a primary nav slot.

## Consequences

- **Deliberate exception to the "migrations never delete, only append" rule.** A migration drops
  `vault_entries`, and `crypto.ts`, `vault-password.ts`, `/api/vault/unlock`, and the vault route are
  removed. Justified because there is no production data — only dogfood entries, none worth keeping.
  This is the one sanctioned deletion; the append-only rule still holds everywhere else.
- "Earn the right to need it" — if real demand for operator-blind storage appears later, it returns as
  a deliberate, trust-backed feature, not a default nobody asked for. The shared-password model would
  need rethinking first regardless.
- The glossary `[[Vault]]` term is marked retired and points to `[[Trip Documents]]`.
