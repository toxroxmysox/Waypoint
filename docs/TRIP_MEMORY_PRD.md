# PRD — Trip Memory (experiential capture)

> Status: **Grilled, shelved on backlog.** v4+ (not promoted into a milestone). Architecture &
> domain rules grilled 2026-06-09.
> Scope: a new **Trip Memory** bounded context — per-member, per-day photo + thought capture for
> *remembering* a trip after it's over. Distinct from the plan ([[Item]]s) and from execution
> artifacts ([[Document]]s).
> Source backlog: `SPEC_BACKLOG.md` → Trip Memory (NEW domain), plus Trip Mode (Note Before Bed,
> Photo log) and Archive & Portability (archive extension).
> Glossary terms touched: [[Memory]], [[Note Before Bed]], [[Trip Memory]] (new context),
> [[Public Archive]] (clarified plan-only) in `CONTEXT.md`.
> Decision record: `docs/adr/0007-trip-memory-separate-capped-context.md`.
>
> **Not sliced into issues by design.** Issues are perishable (tracer-bullet slices drift against a
> moving codebase); the PRD is the durable artifact. Slice via the `to-issues` skill *when Trip
> Memory is promoted into a milestone* — same lifecycle Documents followed (PRD first, issues
> #69–74 at promotion). Before promoting, amend `SPEC.md` per the CLAUDE.md scope-change protocol.

---

## Problem Statement

Waypoint's premise includes *post-trip sharing*, but today "sharing" is the [[Public Archive]] — a
read-only, PII-stripped view of the **plan** (`done` items). There is no record of what the trip
actually *felt* like. You plan a trip, you execute it, and then the experience evaporates: the photos
land in a camera roll with 2,000 others, the moments go unrecorded. Several orphan backlog items all
gesture at the same hole — Trip Mode's "Photo log" and "Note Before Bed," and the Archive's "extend
what we share from plan to plan + memory." None had a home. **Trip Memory is that home.**

## Solution

A new **Trip Memory** context: each trip member captures, for each day, **one photo and one short
thought** — a deliberately curated highlight, not a journal dump. Memories are visible to all trip
members and reviewed together, day-by-day, during [[Closeout]]. They are **for the travelers, never
the public** — excluded from the Public Archive by design.

The entire personality of the feature is the **cap**: one photo + one thought, per member, per day.
That single constraint is what keeps Trip Memory from drifting into a photo manager (Apple Photos) or
a journaling app (Day One). We don't *enforce taste with UI* — we enforce it with the data model.

---

## Decided architecture & domain rules (firm — grilled 2026-06-09)

1. **A [[Memory]] is NOT a [[Document]].** Separate entity, separate collection, separate bounded
   context. They share only "image in PocketBase," which is an implementation detail. On role,
   lifecycle, organization, offline behavior, and scale they are opposites (see ADR-0007). No
   cross-promotion in v4 (no "make this memory a document").
2. **Scope by entry point, not content** (same rule Documents set, D1 — no OCR). A photo added via
   Note Before Bed / the day's memory composer is a Memory. A screenshot pasted into an Item's
   Documents section is a Document. The capture surface decides; identical pixels can go either way.
3. **Hard cap: one photo *and* one thought, per member, per day.** Enforced by a unique DB index on
   `(day, author)`. Editing **replaces**; two memories for the same member+day can never exist.
4. **Member-only. Never public.** All trip members (including viewers) can see all members' memories.
   The Public Archive stays **plan-only** — memories are excluded.
5. **PocketBase file storage, no count cap.** The per-member-per-day cap makes scale a non-issue
   (a 10-day trip with 5 travelers tops out at 50 photos). NAS/home-server backing is a later,
   reversible config change (PB's S3/storage backend), not an app rewrite — so storage gets no ADR.

## Data model

New `memories` collection:

| Field | Type | Notes |
|-------|------|-------|
| `trip` | relation → trips | required, `cascadeDelete: true` |
| `day` | relation → days | required, `cascadeDelete: true` |
| `author` | relation → trip_members | required |
| `photo` | file (single image) | **nullable**; `jpg`, `png`, `webp`, `heic` via PB `mimeTypes` |
| `thought` | text | **nullable**; **max 280 chars** (tweet-length — "one thought," not an essay) |
| `created` / `updated` | autodate | |

**Constraints:**
- **Unique index `(day, author)`** — the one-per-member-per-day cap, enforced at the database. The UI
  upserts: opening the composer edits the existing record if present, else creates one.
- **At least one of `{photo, thought}` required.** A record with neither does not exist — clearing
  both **deletes** the record (the cap means there's nothing to keep).
- **Photo:** single image, **20 MB cap** (matches Documents). Images only — **no PDF** (unlike
  Documents; a memory is never a document).
- **HEIC caveat (v4):** iPhone photos are HEIC, which most browsers won't render and PB won't
  transcode. Allow HEIC upload; a non-rendering photo falls back to a download link / generic
  thumbnail. **This bites harder for Memory than for Documents** — the photo *is* the point, and a
  memory card that won't display its image is a poor experience. Accepted for v4 to ship; see
  **HEIC transcoding (deferred)** below for the fix.

## Permissions

- **Create / edit own Memory:** owner, co_owner, traveler. **Viewers read-only** (see memories,
  can't author).
- **Edit:** **author only.** No one edits your memory — it's personal expression, not shared plan
  data. (Deliberately *stricter* than Documents, which allows an owner override on edit-adjacent ops.)
- **Delete:** **author only.** No owner/co_owner moderation override in v4 — memories are personal and
  low-risk (membership-gated, friends-only). Revisit only if real moderation demand appears.
- **View:** all trip members, including viewers. **Never public** — no token-archive exposure.

## Offline

- **None in v4 — the deliberate opposite of Documents.** Documents precache because they're
  execution-critical (boarding pass at the gate, offline). A Memory is never execution-critical; you
  don't pull it up under pressure. Capture happens online — the canonical moment is hotel wifi at
  night via Note Before Bed, and the photo already lives safely in the camera roll until you curate it.
- No precache, no offline write queue, no Cache-Storage tick. If a future "private archive of all
  trips" surface (see Out of scope) wants offline reminiscence, it earns its own offline story then.

## Surfaces & UX

**Capture (create/edit a Memory) — two moments, one composer:**
- **Note Before Bed** — the [[Trip Mode]] end-of-day prompt (day-wrapped state). Optional and
  dismissable, never nagging. Opens *your* memory composer for today: pick one photo, write one
  thought, done. This absorbs the backlog's "Note Before Bed" and "Photo log" items.
- **Live during the day** — the same composer, reachable from Trip Mode, for capturing in the moment.
- **Retroactively in Closeout** — as you review each day, add or edit your Memory for that day.

**Review (see memories) — two places, no third:**
- **Trip Mode (Today):** today's memories from all travelers shown as small cards on the day.
- **Closeout:** the reminiscence moment — day-by-day, all travelers' memories surface alongside the
  items being marked done/considered. Because the data persists, a **closed trip's Closeout view
  stays openable**, which gives "revisit the memories later" for free.

**Explicitly NOT built in v4:** a standalone Memories gallery / nav tab / dedicated route. That is the
front door to the deferred "app *is* the living record" product (see Out of scope). No new primary nav
slot, no trip-wide photo grid. Review = Today cards + Closeout.

**Input:** native file picker (the OS surfaces camera / photo library / files) + clipboard paste —
the same two affordances as Documents, no bespoke camera/scanner UI. One image per memory.

**Composer:** photo slot (empty → tap to add; filled → tap to replace/remove) + a single-line-growing
thought field with a 280-char counter. Saving upserts the `(day, author)` record; clearing both
fields deletes it.

**Empty states:** a day with no memories shows a gentle "No memories yet" with the capture affordance
(active trip) or nothing (closed trip, read-only). A member who skipped a day simply has no card there
— absence is fine, never a guilt prompt.

---

## HEIC transcoding (deferred — design captured, work shelved)

The single real UX wart in v4 is HEIC: an iPhone memory photo may not render in-browser. Documents
carries the **identical** caveat (`V4_DOCUMENTS_PRD.md` §Data model). This section specs the fix so it
can be pulled off the shelf as **one shared capability that retires the caveat for both domains** —
build once, Memory and Documents both benefit.

**Recommended approach: client-side, pre-upload transcoding (WASM).**

- **Where:** in the browser, *before* the file reaches PocketBase. Detect HEIC on file selection →
  transcode → upload the result. PB then only ever stores a renderable format, and `heic` can be
  *dropped* from the allowed `mimeTypes` (or kept as accepted-input-only with the stored file being
  the derivative).
- **Library:** `heic2any` or `heic-to` (both wrap **libheif** compiled to WASM). No backend change.
- **Output:** **WebP** (smaller, universally supported in current browsers) with JPEG as the
  fallback/simple option. Re-encode at sensible quality and optionally **downscale to a max dimension**
  (memory photos don't need full sensor resolution — also trims storage).
- **Replace, don't keep both:** store only the transcoded derivative; the original HEIC isn't needed
  (the source of truth is the user's camera roll). Saves storage on the Fly volume / NAS.

**Why not server-side:** PocketBase's JS hooks run in an isolated sandbox with no native image libs
and can't shell out; HEIC decode needs **libheif**. Doing it server-side means either a **custom Go PB
build** (libheif/`goheif` bindings — abandons the JS-hooks + standard-binary model) or an external
**sidecar service** (libheif/libvips on the Fly machine). Both add backend surface and a system
dependency. Client-side WASM keeps the backend untouched and fits the PWA / local-first ethos.

**Cost / trade-offs to weigh at pull-the-trigger time:**
- WASM bundle (~1–2 MB libheif) added to the client — lazy-load it only when an HEIC file is selected,
  so the common (PNG/JPEG) path pays nothing.
- Transcode latency/CPU on-device; large HEIC on older phones is the worst case. Show progress; it's a
  one-time cost at upload, not at view.
- Applies to both Memory and Documents — scope the shelved work as a **shared `lib/image/heic.ts`
  module** consumed by both upload paths, not a Memory-only feature.

**Shelving decision:** not critical for v4. When promoted, this becomes its own slice (or a small
shared-capability issue) ahead of — or alongside — the Memory upload work, and the HEIC caveat is
struck from *both* PRDs.

---

## Out of scope (v4)

- **Standalone Memories gallery / dedicated nav tab / trip-wide photo grid.** Review is Today + Closeout.
- **The "app *is* the living record of all trips" product** — a cross-trip *private* archive that
  organizes and surfaces memories across every trip (not just one trip's public archive at closeout).
  Explicitly deferred as "gets bigger than this"; revisit as its own grill later.
- **Memories in the Public Archive.** Plan-only stays plan-only; memories are member-only forever in v4.
- **More than one photo or one thought per member per day.** The cap is the feature. Loosening it later
  is easy; it is intentionally tight now.
- **Social layer on memories** — no likes, no comments, no reactions on another member's memory. (Same
  "earn the right to compete" restraint as the messaging decision — don't grow a feed.)
- **Votes on memories.** Votes are a planning-decision tool; reminiscence isn't a decision.
- **Offline capture/queue or precache** (see Offline).
- **PDF or non-image file types** (that's Documents).
- **HEIC transcoding** (designed above, shelved).
- **Day Wrapped Stats** counting memories — a separate Trip Mode backlog item; may later read memory
  presence, out of scope here.

## Open / deferred

- **HEIC transcoding** — designed above; shelved as a shared Memory+Documents capability.
- **Owner/co_owner moderation delete override** — out in v4 (author-only); revisit on real demand.
- **Cross-trip private memory archive ("living record")** — the deferred bigger product.
- **Storage backing migration to NAS/home-server** — reversible PB storage-backend config; do it when
  the home infra is ready. No app changes, no ADR.

## Decisions log

### Trip Memory grill (2026-06-09)

| # | Decision |
|---|----------|
| Q1 | **Memory ≠ Document** — separate entity, collection, and bounded context. Documents = used *during* the trip (execution); Memory = remembering it *after*. Scope by entry point, no OCR. |
| Q2 | **Hard cap: one photo + one thought, per member, per day**, enforced by a unique `(day, author)` index. Curated highlight, not a journal. The cap *is* the native-app boundary. |
| Q3 | **Member-only; excluded from the Public Archive.** Memories are for the travelers, not the world. Public Archive stays plan-only. |
| Q4 | **Capture + review surfaces only:** Note Before Bed (Trip Mode, end of day) + live composer for capture; Trip Mode Today + Closeout for review. **No standalone gallery** — that's the deferred "living record." |
| Q5 | **Storage = PocketBase file storage now**, NAS later (reversible config, no ADR). Cap kills the scale worry. |
| Q6 | **Model & rules ratified:** `thought` max 280 chars; empty (no photo, no thought) = delete; delete = **author-only** (no owner override); HEIC = allow + download fallback, no transcode in v4. |
| Q7 | **HEIC transcoding designed and shelved** as a shared Memory+Documents capability (client-side WASM, pre-upload). |
| Q8 | **Not sliced into issues** — kept as a firm PRD on the backlog; slice at milestone promotion (Documents precedent). |
