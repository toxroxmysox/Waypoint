# PRD — Documents (artifacts) + Vault retirement

> Status: **Draft / not ready-for-agent.** v4. Output of the 2026-06-07 grill-with-docs session.
> Scope: a new Documents domain (file/image artifacts) that **replaces** the retired Vault module.
> Source backlog: `SPEC_BACKLOG.md` → Documents (NEW domain), Vault (module).
> Glossary terms touched: [[Document]], [[Trip Documents]], [[Vault]] (retired) in `CONTEXT.md`.
> Decision record: `docs/adr/0005-retire-vault-no-client-side-encryption.md`.
>
> Architecture/domain rules below are **firm** (grilled). UI/interaction specifics are sketched, not
> final — a design pass refines layout before ready-for-agent. Before promoting into a milestone, amend
> `SPEC.md` per the CLAUDE.md scope-change protocol.

---

## Problem Statement

The current stack leans on "the email folder of confirmations" — booking PDFs, train tickets, tour
vouchers, boarding passes live scattered across inboxes. When you're at the gate with no signal, the
plan is in Waypoint but the artifact you actually need to show is in an email you can't load. PocketBase
native file storage is entirely unused; there is no way to attach a file to anything.

Separately, the shipped **Vault** (client-side-encrypted text store) solves a problem the app doesn't
have yet: it protects sensitive text against the operator with a *trip-shared* password — no protection
from fellow members, and redundant with PB membership rules against everyone else. Dogfood feedback: a
new app hasn't earned the trust for users to store passports/passwords in it over LastPass. It occupies
a primary nav slot for a feature nobody trusts.

## Solution

Introduce **Documents**: plain (unencrypted) file/image artifacts uploaded to a trip, gated by the same
trip-membership rules as all trip data. Retire the Vault and repurpose its nav slot for the
[[Trip Documents]] aggregate view. Make execution artifacts **available offline** for the active trip.

A [[Document]] is an **artifact only** (PDF or image). Copy-pasteable text codes stay on the Item's
existing `confirmation_codes` field — Documents do not duplicate them.

---

## Decided architecture & domain rules (firm — grilled 2026-06-07)

1. **Parent scope = {Item | Trip}, no Phase.** A Document attaches to exactly one Item, or directly to
   the Trip. No "Paris-leg" document exists that isn't tied to a Paris item. (Mirrors the Checklist
   scope pattern minus the dead Phase branch.)
2. **One `documents` collection. No encryption, no `sensitive` flag.** Plain stored files, membership-
   gated. See ADR-0005.
3. **One file per record; an Item has many Documents** (reverse relation). Paste/upload creates one
   record each.
4. **Documents = artifacts only.** Text confirmation codes live on Item `confirmation_codes`, not here.
5. **Vault removed entirely** — collection + `crypto.ts` + `vault-password.ts` + `/api/vault/unlock` +
   vault route. Deliberate exception to the append-only migration rule (no production data). ADR-0005.

## Data model

New `documents` collection:

| Field | Type | Notes |
|-------|------|-------|
| `trip` | relation → trips | required, `cascadeDelete: true` |
| `item` | relation → items | **nullable**; set = item-scoped, null = trip-scoped; cascade delete |
| `file` | file | PB native file field, single file |
| `caption` | text | optional — label for pasted screenshots with no filename |
| `uploaded_by` | relation → trip_members | required |

**Constraints:**
- **Types:** PDF + images only (`jpg`, `png`, `webp`, `heic`) via PB `mimeTypes`. Not a general file
  store — reject docx/zip/etc.
- **HEIC caveat:** iPhone *photos* are HEIC, which most browsers won't render and PB won't transcode.
  Allow HEIC upload; preview falls back to a download link. No transcoding in v4. (Clipboard paste
  yields PNG — unaffected.)
- **Size:** 10 MB per file cap.
- **Count:** no hard cap in v4 (membership-gated, friends-only). Fly volume usage is a watch-item.

## Permissions

- **Upload:** owner, co_owner, traveler. **Viewers read-only** (view + download, no upload).
- **Delete:** `uploaded_by` member **or** owner/co_owner (owner override added vs. the old vault
  uploader-only rule).
- **No suggestion queue.** Traveler uploads land directly regardless of the trip's auto-approve setting.
  Documents are reference material, not plan proposals — gating a boarding pass behind owner review is
  friction for zero curation value. Junk is cheap to delete.

## Offline

- **Precache the active trip automatically.** When `trip.status = active`, the service worker precaches
  that trip's Document files (done while the user presumably still has signal). No manual "save for
  offline" pin.
- **Planning mode:** cache-on-view (runtime caching) — sufficient for non-execution browsing.
- **Implementation note (not solved here):** PB serves protected files with a short-lived file token;
  the SW must fetch with a valid token while online, but caches the *bytes*, so token expiry is
  irrelevant once cached.

## Views & UX

- **Nav:** Documents takes the retired Vault slot — Planning 5-tab (Itinerary, Money, Activity,
  **Documents**, More) and Trip Mode 4-tab (Now, Today, Add, **Documents**).
- **Trip Documents aggregate:** read-only union of all Documents, **grouped by Item Type** (Lodging,
  Flights, Transportation, Activities, Meals, Notes) + a **Trip-level** section for trip-scoped docs.
  Trip-level upload + paste affordance lives here.
- **Item detail:** a "Documents" section per item showing that item's artifacts + an upload/paste
  affordance. Primary birthplace of item-scoped docs and the offline-pull-up surface.
- **Input:** file-picker upload **and clipboard paste** (screenshot of a confirmation email).
- **Preview:** images → in-app lightbox; PDFs → browser native viewer (object URL / new tab, works
  offline from cached bytes). **No PDF.js in v4.**
- **Row content:** thumbnail (image) or file-type icon (PDF), caption/filename, `uploaded_by` avatar,
  view/download.

---

## Out of scope (v4)

- Any encryption / sensitive-file handling (ADR-0005).
- General file types beyond PDF + images.
- HEIC transcoding / server-side image processing.
- PDF.js in-app rendering.
- Per-file manual offline pinning.
- Multi-file bundle upload as a single record.
- Standalone text entries (superseded by Item `confirmation_codes`).

## Open / deferred

- **Storage budget on the Fly volume** — no count cap in v4; monitor and revisit if it grows.
- **Aggregate view design pass** — grouping is decided (by Item Type); visual layout/empty-states need
  a design prompt before ready-for-agent.
- **Documents in the Public Archive** — out of v4 scope; revisit with the Trip Memory grill (archive
  currently shares plan only).

## Decisions log (this grill)

| # | Decision |
|---|----------|
| Q1 | Parent scope = {Item \| Trip}, no Phase. |
| Q2 | One `documents` collection with a discriminator — later collapsed: no encryption at all. |
| Q3–Q5 | No encryption; Vault retired & renamed to Documents; artifacts only (text codes stay on items). |
| Q6 | New collection (not evolving `vault_entries`, which is deleted); PDF+images, 10 MB, no count cap; 1 file/record, many per item. |
| Q7 | Offline = automatic precache of active trip; cache-on-view for planning. |
| Q8 | Direct upload for non-viewers, no review queue; delete = uploader or owner/co_owner. |
| Q9 | Aggregate grouped by Item Type + Trip-level section; per-item Documents section; lightbox/native-PDF preview. |
