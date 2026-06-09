# Handoff — Documents S3–S5

Branch: `claude/affectionate-albattani-ba4133` (off `main`)
Scope: finish the Documents domain — S3, S4, S5. Design firm per `docs/V4_DOCUMENTS_PRD.md` (not re-grilled). S0–S2 already shipped on main.

## What shipped

### S3 — Clipboard paste (#73) · commit `b2c10b4`
First-class, one-tap image paste on **both** surfaces.
- New `src/lib/documents/components/DocumentPaste.svelte` — a visible **Paste image** button reads the clipboard on tap (`navigator.clipboard.read()`); `Cmd/Ctrl+V` on the surface also works (`window` paste listener, gated by a `listen` prop so the add sheet only catches it while open). Staged image shows a preview + **optional caption** before sending.
- Submits through the existing `uploadDocument` form action via a hidden form + `DataTransfer` (SvelteKit form action, **no client fetch** — per CLAUDE.md). Reuses `checkFile` for the type/size pre-check.
- Wired into `DocumentSection.svelte` (item, scoped to the item) and `DocumentAddSheet.svelte` (aggregate, scoped to the sheet's selector).
- Both upload server actions now persist `caption` (the `caption` field already existed in migration `0032` — **no migration added**).

### S4 — Preview surfaces (#72) · commit `74233d9`
Extended the minimal S1 lightbox into a gallery.
- `DocumentLightbox.svelte` now takes `gallery: DocumentView[]` + bindable `index`. Page through images via **prev/next buttons, ArrowLeft/Right, and touch swipe** (50px threshold), with an `n/N` counter. Gallery = the renderable images of the originating **item section / aggregate group** ("swipe through an item's images").
- **Web Share** toolbar button: fetches the bytes → `File` → `navigator.share({ files })` (`canShare` checked at click). Rendered only when `navigator.share` exists → hidden on most desktop browsers (PRD D8).
- **Delete** moved into the toolbar (permission-gated, inline confirm).
- **Native PDF** viewing was already functional from S1/S2 (PDF/HEIC rows `window.open` the same-origin file endpoint → browser-native viewer, works offline from cached bytes); left intact.
- Added `src/lib/documents/offline-cache.ts` here because the toolbar's "Saved offline" chip reads it; the precache half lands in S5.

### S5 — Offline precache (#74) · commit `0458041`
- `service-worker.ts`: new `waypoint-docs-<version>` cache. Document file requests are **cache-first** (bytes immutable per record); a miss populates the cache (**cache-on-view** for planning mode). A `PRECACHE_DOCS` message precaches a list of file URLs (per-URL `fetch`+`put`, resilient via `allSettled`). Cache kept across `activate` cleanup.
- Aggregate `+page.svelte` fires `precacheDocuments(...)` for every document when `trip.status = active` (each href requested once; new uploads picked up as the list grows).
- **Truthful tick**: `DocumentRow` shows a moss download-glyph (`text-moss/85`) only when `caches.match(file_href)` hits — no assumed/"syncing" state (PRD D5). Same truth source feeds the lightbox "Saved offline" chip.
- The path predicate `isDocumentFilePath` lives in `offline-cache.ts` (shared by SW + client) and is **unit-tested** (`offline-cache.test.ts`).

## Verification
- `pnpm check` — **0 errors, 0 warnings**.
- `pnpm build` — clean; confirmed the SW output inlines `PRECACHE_DOCS` + the doc-file regex (the shared import bundles correctly).
- `pnpm test:unit` — **255 passed** (251 existing + 4 new for `isDocumentFilePath`).

### NOT done — needs a manual pass
Interactive verification was **skipped**: these surfaces are auth- + data-gated and require PocketBase, and at handoff time `:8090` (PB) and `:5173` (vite) were **already in use by the three concurrent live sessions** sharing the dev DB. Starting a second stack risked creating/deleting records under them, so I did not. Please verify manually at **375px**:
1. Copy a screenshot → **Paste image** on an item's Documents section and on the aggregate add sheet; confirm caption persists and the row appears.
2. Lightbox: open an image in a group with ≥2 images → swipe / arrows / prev-next; Share button visible on mobile, absent on desktop; Delete gated.
3. Offline: load the aggregate with an **active** trip online, go offline, confirm images/PDFs still open and the moss tick shows on cached rows.

## Guardrails honored
- Stayed entirely in `src/lib/documents/`, the documents routes, and `service-worker.ts`. Did **not** touch the goals route, `ItemForm`, phases, or e2e specs.
- No new migration (used existing `documents` collection + `caption`).
- One PR for S3–S5, commit per slice. **Not merged.**
