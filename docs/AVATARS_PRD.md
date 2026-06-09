# PRD — User Avatars (profile pictures for collaboration)

> Status: **Ready-for-agent.** Architecture grilled 2026-06-08 against `CONTEXT.md`, `backend/RULES.md`,
> migrations 0001/0003/0014, and every current `<Avatar>` call site.
> Scope: surface a user-level profile picture across the collaboration features. The storage already
> exists (`users.avatar`, since migration 0001) — this is a wire-up + access-rule + upload-surface PRD,
> not a from-scratch feature.
> Source issue: [#59](https://github.com/toxroxmysox/Waypoint/issues/59) (feature, hitl).
> Glossary terms touched: [[Avatar]] (new), [[Trip Member]], [[Placeholder Member]], [[Claim]] in `CONTEXT.md`.
> Decision record: `docs/adr/0006-users-readable-by-co-travelers.md`.
> Before promoting into a milestone, amend `SPEC.md` per the CLAUDE.md scope-change protocol.

---

## Problem Statement

Waypoint's collaboration surfaces — vote stacks, the members list, task assignees, goal authors,
comments, notifications — identify members by a one-letter initials chip. Every group-decision feature
reads as anonymous: a wall of "J", "S", "M" circles. The product is explicitly **user-focused and
collaborative**, and faces are how people recognise each other at a glance.

The schema has been ready since M1: migration [0001_users_auth.js](../backend/pb_migrations/0001_users_auth.js)
added an `avatar` `FileField` to `users` (5 MB; jpeg/png/webp), and [`Avatar.svelte`](../src/lib/ui/Avatar.svelte)
already accepts an `img` prop with `object-cover` framing and an initials fallback. **None of it is wired
up.** Every call site passes only `initial=`. The reason it was never wired: `users` is **self-only**
readable ([0014](../backend/pb_migrations/0014_explicit_rules_audit.js)), so a co-traveler literally cannot
read another member's avatar through the API. [RULES.md:144](../backend/RULES.md) records the original
work-around intent — "cross-member lookup goes through `trip_members.display_name`, not other users'
rows" — which has no avatar equivalent.

There is also **no user-level editing surface** anywhere in the app. Auth is OTP-only (no password, no
account page); every settings screen is trip-scoped. A user has nowhere to set their own avatar or name.

## Solution

Treat **co-membership of a shared trip as the trust boundary.** If you are on a trip with someone, you
already have their face and name — so let a co-traveler read another member's `users` row for **name +
avatar only** (never email, never auth secrets). That single rule change deletes the need for any proxy,
superuser client, or denormalization: the client just `expand:user`s the `trip_members` row and reads the
avatar. Add one global **`/account`** page where a user uploads/crops their avatar and edits their name.
Then pass `img=` into the existing `<Avatar>` at every collaboration call site. Placeholders keep the
initials fallback and inherit the real avatar automatically on [[Claim]].

---

## Decided architecture & domain rules (firm — grilled 2026-06-08)

1. **Avatar is user-level, stored once on `users.avatar`.** Persists across every trip. Reaffirms the
   existing 0001 `FileField`. External avatars (Gravatar/URL) are rejected — local-first, privacy.
2. **No per-trip override.** Unlike `display_name` (a per-trip nickname), an avatar is identity. There is
   no avatar column on `trip_members`. The read path is the only place a future override could be added,
   so deferring costs nothing.
3. **Co-travelers can read each other's `users` row — name + avatar only.** `users.viewRule` loosens from
   self-only to "the caller shares a trip with this user." `listRule` stays self-only (no user
   enumeration). `emailVisibility` stays **off** — email is *not* exposed through this path. PB hides
   `password`/`tokenKey` on auth collections regardless of rule. See ADR-0006.
4. **No proxy, no superuser, no denormalization.** Because the row is now readable, the caller's own
   authed `locals.pb` can `expand:user` and read the avatar. The documents-style file proxy is **not**
   needed for avatars.
5. **Placeholders render initials only.** No avatar upload for offline members (no `trip_members` file
   field, no upload-on-behalf UI, no consent question). On [[Claim]], `member.user` is set and the
   claimer's real avatar appears with zero extra code.
6. **Upload lives on a new global `/account` route.** Outside any trip ("user-focused, persists across
   trips"). Edits avatar + `user.name`. Self-edit only — covered by the existing `users.updateRule =
   self-only`. Entry point from the `/trips` home.
7. **Client-side image pipeline before upload.** Recenter (drag) + zoom over a circular-masked viewport →
   draw the framed region to an offscreen canvas at **512×512** → encode **webp** → upload (~tens of KB).
   The server's 5 MB + mime caps stay as a backstop. `object-cover` handles final circular framing.
8. **Fallback is the existing initials chip.** `Avatar.svelte` already renders it; absent/placeholder
   avatars are unchanged.

## Data model

**No new collection. No new field.** This is the notable property of #59 — the data already exists.

- `users.avatar` — `FileField`, `maxSelect:1`, `maxSize:5_242_880`, `mimeTypes:[image/jpeg, image/png,
  image/webp]`. From [0001](../backend/pb_migrations/0001_users_auth.js). Unchanged.
- `users.name` — `TextField`, max 100. From 0001. Now editable via `/account`.

The only backend change is **rule text** on the `users` collection (a new migration; rules are not data,
but PB stores rule strings per collection — append a migration, never edit 0014).

### The view rule

```
users.viewRule (new):
  @request.auth.id != "" && trip_members_via_user.trip.trip_members_via_trip.user ?= @request.auth.id
```

Reads: *the caller is authenticated AND the target user has some membership whose trip also has a
membership for the caller* → caller shares a trip with the target.

- `trip_members_via_user` — back-relation from `users` (because `trip_members.user → users`). The target
  user's memberships.
- `.trip.trip_members_via_trip.user ?= @request.auth.id` — for those trips, does any member's user equal
  the caller.

**⚠ Technical risk — this is a *two-level* nested back-relation.** Every existing rule in the codebase
uses only one level (`trip.trip_members_via_trip.user ?= …`). PB 0.27 *should* evaluate two, but it is
**unproven here**. The backend slice must prove it green in `backend/test-rules.mjs` (a co-traveler can
view a co-traveler's row; a non-member 404s; `list` still self-only; email absent from the payload).
**Fallback if PB chokes:** a `pb_hooks` endpoint `GET /api/trips/:tripId/members/:memberId/avatar` that
runs as superuser, asserts caller membership, and streams `member.user.avatar` bytes (the same shape as
the documents file proxy, minus the need for app-side superuser creds). Pick the rule if it works; fall
back to the hook only if it doesn't.

## Read path (client)

Anywhere members are loaded for display, `expand: 'user'` on the `trip_members` query, then build the
avatar URL from the expanded user via `pb.files.getURL(member.expand.user, member.expand.user.avatar)`.
A small helper (`memberAvatarUrl(member)`) centralises this and returns `''` (→ initials fallback) when
the user is absent (placeholder) or has no avatar.

## Surfaces to wire `img=` into

All already render `<Avatar>` with `initial=` only:

| Surface | File |
|---|---|
| Vote stacks | [`VoteStacks.svelte`](../src/lib/collaboration/components/VoteStacks.svelte) |
| Members list | [`members/+page.svelte`](<../src/routes/(app)/trips/[slug]/members/+page.svelte>) |
| Assignee picker | [`AssignMemberSheet.svelte`](../src/lib/itinerary/components/AssignMemberSheet.svelte) |
| Task assignee | [`TaskRow.svelte`](../src/lib/itinerary/components/TaskRow.svelte) |
| Checklist index stack | [`ListIndexRow.svelte`](../src/lib/itinerary/components/ListIndexRow.svelte) |
| Goal author | [`goals/+page.svelte`](<../src/routes/(app)/trips/[slug]/goals/+page.svelte>) |
| Comments / notifications | author chips in the collaboration components |

## `/account` page

- Route: `/account` under `(app)`, titled **Profile**. Reached from the `/trips` home (header avatar /
  menu). Not trip-scoped.
- Avatar editor: file pick → recenter+zoom cropper → 512² webp → `PATCH users` (self). Replace + remove.
- Name field: edits `user.name` (used as the cross-trip display fallback).
- Skeleton UI while loading; in-context validation; toast on save (per CLAUDE.md frontend patterns).

## Privacy & permissions

- Visibility is **membership-gated** by the new view rule — exactly the same trust model as every other
  collection. Viewers are members, so they see avatars and have their own.
- **Email is not newly exposed.** `emailVisibility` stays off; the members list already blanks
  co-traveler emails today. Only name + avatar become cross-readable.
- Editing is self-only (existing `users.updateRule`). No one edits another user's avatar.

## Out of scope

- Per-trip avatar override (deferred; the read path leaves the door open).
- Uploading avatars for placeholder/offline members.
- Exposing co-traveler email.
- An interactive cropper *library* / heavy dep — the recenter+zoom is hand-rolled.
- Account deletion, other account settings (the `/account` page is the future home, not this issue's job).

## Acceptance

1. A user can upload, recenter+zoom-crop, and save an avatar at `/account`; it round-trips as a ≤512² webp.
2. A co-traveler sees that avatar in vote stacks, the members list, and assignee chips.
3. A non-member cannot read the user's row (404); `users.list` stays self-only; email is absent from the
   co-traveler payload — all asserted in `test-rules.mjs`.
4. A placeholder shows initials; after the real user claims it, their avatar appears with no further action.
5. Absent avatars fall back to the initials chip everywhere.
