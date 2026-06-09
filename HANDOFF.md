# HANDOFF — Avatars (#59)

Planning/grill session, 2026-06-09. Output = decisions + docs + issues. **No build.**

## The reframe

#59 is *not* "add avatars." The storage already exists: `users.avatar` (`FileField`, 5 MB, jpeg/png/webp)
has been on the schema since migration **0001**, and `Avatar.svelte` already supports an `img` prop with
an initials fallback. It was never wired up because **`users` is self-only readable** (0014) — a
co-traveler literally can't read another member's avatar through the API. The whole issue is breaking
that wall.

## Decisions locked

| # | Decision | Rationale |
|---|---|---|
| D1 | **Storage:** PB file on `users.avatar` (existing). External/Gravatar rejected. | Local-first; the field already exists. |
| D2 | **Avatar is user-level only — no per-trip override.** No avatar column on `trip_members`. | An avatar is identity; `display_name` stays the per-trip thing. Read path leaves an override door open. |
| D3 | **Placeholders render initials only.** On Claim, `member.user` is set → claimer's avatar appears automatically. | No upload-on-behalf, no consent question, no `trip_members` file field. |
| D4 | **Read path: loosen `users.viewRule` self-only → co-traveler** ("shares a trip"); `list` stays self-only; email stays hidden. Co-travelers `expand:user`, read name+avatar. **No proxy, no superuser, no denormalization.** | Co-membership is the trust boundary. PB hides password/tokenKey regardless; email gated separately. |
| D5 | **Upload surface: new global `/account` ("Profile")** route, entry from `/trips` home. Edits avatar + `user.name`. | OTP-only auth, no account page existed; user-level identity belongs outside any trip. |
| D6 | **Image pipeline:** recenter+zoom cropper → canvas center-crop → **512² webp** → upload. Server caps backstop. | Framing control + ~30 KB files; hand-rolled, no heavy dep. |
| D7 | **Fallback:** existing initials chip everywhere absent. | `Avatar.svelte` already does it. |
| D8 | **Email NOT newly exposed.** `emailVisibility` stays off — only name + avatar cross-readable. | Most conservative version that still ships the avatar. |

## Superseded mid-grill

Earlier picks of a **file proxy** / **PB-hook superuser endpoint** were discarded once the read-path
reframe (D4) landed: opening the `users` row to co-travelers makes the proxy unnecessary. The hook
endpoint survives only as the **fallback** if the nested rule won't evaluate (see risk below).

## Open technical risk (carried into #103)

The view rule is a **two-level nested back-relation**
(`trip_members_via_user.trip.trip_members_via_trip.user ?= @request.auth.id`) — deeper than anything in
the codebase today (all current rules use one level). PB 0.27 *should* handle it; **unproven.** #103
must prove it in `test-rules.mjs`. Fallback: `pb_hooks` superuser avatar endpoint. The *decision* holds
regardless of mechanism.

## Docs written (in this PR)

- `CONTEXT.md` — new **[[Avatar]]** glossary entry (user-level; co-traveler trust boundary; initials fallback).
- `docs/AVATARS_PRD.md` — full PRD (problem, decided rules, data model = no new collection/field, read path, `/account`, privacy, acceptance).
- `docs/adr/0006-users-readable-by-co-travelers.md` — ADR for reversing the documented `users` self-only stance.

## Issues filed (all `enhancement` + `afk` + `planned`, parent #59)

| # | Slice | Blocked by |
|---|---|---|
| **#103** | Co-traveler read rule on `users` (name+avatar) + harness + RULES.md | — |
| **#104** | `/account` profile page — self upload, crop, name edit | — |
| **#105** | Display wire-up tracer (helper + members list) | #103 |
| **#106** | Display fan-out (vote stacks, assignees, goals, comments) | #105 |

#103 and #104 can start immediately and in parallel. Graph: 1→3→4; 2 independent.

## Follow-ups (not filed — deliberate)

- Per-trip avatar override (deferred; D2).
- Exposing co-traveler email (decoupled from avatar; D8).
- `SPEC.md` amendment on milestone promotion (per CLAUDE.md scope protocol) — a planning step, not an AFK issue.

---

# HANDOFF — #104 `/account` Profile page (build)

Build session, 2026-06-09. Output = code + PR. **Done, verified, not merged.** Implements D5 + D6 above.

## Scope delivered

The global `/account` ("Profile") route — first user-level settings surface. Self-edits only, covered by the
existing `users.updateRule = self-only`. **No migration** (`users.avatar` exists since 0001; server caps are
the backstop behind the client pipeline). #104 is the **upload surface only** — the `users.viewRule` change
and the collaboration display wire-up are #103/#105/#106.

- **Avatar upload** → hand-rolled recenter (drag) + zoom over a circular-masked viewport → offscreen canvas
  center-crop → **512² webp** → `PATCH users` (self) via form action. No cropper dependency.
- **Avatar remove** (clears `users.avatar`).
- **Display name** edit (`users.name`).
- **Entry point**: avatar link in the `/trips` home header.

## Files

| File | What |
|---|---|
| `src/lib/account/avatar-crop.ts` | Pure crop geometry (`computeCropRect`/`coverScale`/`maxOffset`) + `cropToWebp` (canvas → 512² webp). |
| `src/lib/account/avatar-crop.test.ts` | Vitest for the geometry. |
| `src/lib/account/components/AvatarCropper.svelte` | Crop-sheet **content**: circular viewport, pointer drag, zoom slider, Save/Cancel. |
| `src/routes/(app)/account/+page.server.ts` | `load` (fresh user + avatar URL) + actions `updateName`/`updateAvatar`/`removeAvatar`. |
| `src/routes/(app)/account/+page.svelte` | Profile page: avatar card (skeleton while saving, in-context errors, toast), name form; owns the `BottomSheet`. |
| `src/routes/(app)/trips/+page.{server.ts,svelte}` | Header avatar → `/account`; load returns `profileName` + `avatarUrl`. |
| `tests/e2e/account-profile.spec.ts` | Playwright: reachability, name persist, upload→crop→render→remove, 375px. |

## Verification

- `pnpm check` — clean (747 files, 0 errors).
- `pnpm test:unit` — 271 pass (incl. crop geometry).
- `pnpm test:e2e` — 46 pass / 1 skipped (incl. 4 new `/account` tests). Real-browser run confirms the sheet
  opens on pick, closes on save, the avatar round-trips as a **512² webp**, and remove returns the initials fallback.
- Visual: verified at 375px.

## Notes for the reviewer

- **Progressive enhancement:** real form actions, no client `fetch`. With JS the picked file is cropped and the
  webp swapped into the payload via `use:enhance`; without JS a `<noscript>` form posts the raw file (PB mime/size caps gate it).
- **Decision:** `BottomSheet` lives in the **page** (two-layer `bind:open`), `AvatarCropper` is pure content
  emitting `onCropped`/`onCancel`. A first cut chained `bind:open` three deep; restructured for clarity.
- **`load` re-fetches the user** (`getOne`) rather than reading `locals.user`: on a POST, `authRefresh` runs before
  the action, so `locals.user` is pre-update when `load` re-runs in the same request.
- **Dev note:** this fresh worktree had no `.env.local`; copied from the main worktree so `$env/static/public`
  resolves `PUBLIC_PB_URL` (gitignored, not committed). No `.wolf/` dir exists here despite `CLAUDE.md` referencing one.
