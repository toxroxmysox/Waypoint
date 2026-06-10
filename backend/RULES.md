# PocketBase Permissions — Rules of Record

Source of truth for who can do what against the API. Generated and verified by `backend/test-rules.mjs`. Update this file when rules change; the harness will fail if the documented intent diverges from observed behavior.

Last reviewed: 2026-06-09 (#103 / ADR-0006 — `users.viewRule` loosened from self-only to co-traveler so members read each other's name + avatar; `listRule` stays self-only, `emailVisibility` off). Prior: #70 — documents collection added to the harness.

---

## Vocabulary

- **member** = a user with any `trip_members` row for the trip in question
- **non-member** = an authenticated user with no `trip_members` row
- **anon** = no auth token
- **admin context** = PocketBase server hook running as superuser; bypasses all rules

PocketBase rule semantics:

- `null` → admin context only; no API access at any level
- `""` (empty string) → no rule; anyone (including anon) passes
- expression → evaluated per-record; `@request.auth.id != ""` requires authentication

When a list/view rule denies a record, PB returns `404` (not `403`) so existence isn't leaked. Create/update/delete denials return `403`.

---

## Current rules (M1 baseline, post-0014)

Role-agnostic. Any member of a trip can do anything to that trip's data; non-members are shut out. Role-based gating (per SPEC §3) is layered on top in later sub-milestones via server hooks and additional rules — see "Planned tightening" below.

| Collection | list | view | create | update | delete |
|---|---|---|---|---|---|
| `users` | self only | **co-traveler** (name+avatar) | null (OTP hook) | self only | null (no API) |
| `trips` | member | member | authed | member | member |
| `trip_members` | member of trip | member of trip | null (hooks/admin) | member of trip | member of trip |
| `phases` | member of trip | member of trip | member of trip | member of trip | member of trip |
| `days` | member of trip | member of trip | null (hooks) | member of trip | null (hooks) |
| `items` | member of trip | member of trip | member of trip | member of trip | member of trip |
| `checklist_items` | member of item.trip | member of item.trip | member of item.trip | member of item.trip | member of item.trip |
| `pending_invites` | member of trip | member of trip | null (endpoint) | null (immutable) | member of trip + hook (SPEC §3) |

**Reasoning for each `null`:**

- `users.create` — user records are created by the OTP hook (`auth.pb.js`) or the dev bypass, both running in admin context. Direct API signup would skip OTP verification.
- `users.delete` — out of scope for M1/M2. Account deletion is a future SPEC item (M6+); leave shut until designed.
- `trip_members.create` — creator-owner row is added by the trips after-create hook; placeholders + invite acceptance are hook-driven (M2b/M2c). No legitimate path goes through direct client POST.
- `days.create` — generated automatically by trips after-create / after-update hooks based on the trip's date range. Users never create days directly.
- `days.delete` — same: pruning happens inside the trips after-update hook when the date range shrinks.
- `pending_invites.create` — invite creation goes through `POST /api/invites/create`, which validates the inviter's role per SPEC §3 (travelers can only invite traveler/viewer; viewers cannot invite at all) and generates `code` + `expires_at` server-side. Direct API POST would let any member set arbitrary codes / lifetimes / inviter ids.
- `pending_invites.update` — invites are immutable. To change a role or extend expiry, revoke and re-invite. Keeps the audit trail honest.

**Identity expressions used in 0014 (+ 0043):**

```
self_only        = id = @request.auth.id
authed           = @request.auth.id != ""
member           = @request.auth.id != "" && trip_members_via_trip.user ?= @request.auth.id
member_via_trip  = @request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id
member_via_item  = @request.auth.id != "" && item.trip.trip_members_via_trip.user ?= @request.auth.id
co_traveler      = @request.auth.id != "" && trip_members_via_user.trip.trip_members_via_trip.user ?= @request.auth.id   (0043, users.viewRule)
```

The `?=` operator in PB is "any of the multi-relation values matches". Required because `trip_members_via_trip` is a back-relation (multiple rows per trip).

`co_traveler` (0043) is a **two-level nested back-relation** — deeper than any other rule here. From the target `users` row: `trip_members_via_user` is its memberships; `.trip.trip_members_via_trip.user ?= @request.auth.id` asks whether any of those trips also has a membership for the caller → the caller shares a trip with the target. PB 0.27 evaluates it correctly (proven in `test-rules.mjs` #103 cross-read cases); the ADR-0006 `pb_hooks` superuser-avatar fallback was **not** needed.

---

## Target rules per SPEC §3

The current baseline lets any member do anything. SPEC §3 carves out role-specific behavior that gets enforced over the course of M2:

| Action | Owner | Co-Owner | Traveler | Viewer |
|---|:---:|:---:|:---:|:---:|
| trips.update (metadata) | ✓ | ✓ | — | — |
| trips.delete | ✓ | — | — | — |
| trip_members.create (invite) | ✓ all roles | ✓ all roles | ✓ traveler/viewer only | — |
| trip_members.update (promote / change role) | ✓ | ✓ (not the sole owner) | — | — |
| trip_members.delete (remove member) | ✓ | ✓ (not the sole owner) | self only | self only |
| items.create direct | ✓ | ✓ | — (suggests instead) | — |
| items.update / delete | ✓ | ✓ | — | — |
| suggestions.create (target_type=new_item) | ✓ auto-approve | ✓ auto-approve | ✓ queued unless trip.auto_approve_suggestions | — |
| suggestions.update (approve/reject) | ✓ | ✓ | — | — |
| suggestions.create (target_type=comment) | ✓ | ✓ | ✓ | ✓ |
| checklist_items.update (check/uncheck) | ✓ | ✓ | ✓ | — |

Implementation strategy: anything expressible as a PB rule expression goes into the rule. Anything that requires reading `trip_members.role` or cross-record logic (e.g. "cannot remove the sole owner") goes into a server hook in `pb_hooks/` and the rule stays at "member-of-trip". The hook rejects with `BadRequestError` / `ForbiddenError` and the harness asserts the resulting status.

---

## Planned tightening per sub-milestone

- **M2a** — Reassert all rules explicitly with reasons. Add harness. No behavior change. ✓ done.
- **M2b (this milestone)** — Add `pending_invites` collection with its own 5 rules. `/api/invites/create` validates inviter role per SPEC §3 (travelers can only invite traveler/viewer; viewers cannot invite). `/api/invites/accept` creates the `trip_members` row and deletes the invite. Revoke (DELETE) is gated by an `onRecordDeleteRequest` hook: owner/co_owner can revoke any invite; traveler can revoke only invites they sent themselves; viewer cannot revoke. **First hook-based role gating** in the codebase — pattern established here gets reused for M2c+. ← we are here
- **M2c** — Tighten `trip_members.update` and `trip_members.delete` to owner/co-owner only via hook + tighten the rules to allow self-row updates (display_name) for any member. Sole-owner invariants enforced in hook.
- **M2d** — Add `suggestions` collection. Tighten `items.create` to owner/co-owner only (travelers route through suggestions). Hook on suggestion-create handles auto-approval per role.
- **M2e** — Suggestion rule branch for `target_type=comment` always auto-approves regardless of role.
- **M2f** — Add `notifications` collection with recipient-only rules. Hooks on suggestion/comment/member events fan out to recipients.

The harness expectations table at the bottom of `test-rules.mjs` is updated alongside each tightening migration. A green run is the gate for declaring a sub-milestone done.

`backend/test-invites.mjs` (`pnpm test:invites`) covers the invite endpoints (create role-gating, payload validation, lookup, accept happy + edge paths, revoke gating). Run alongside `pnpm test:rules` from M2b on.

---

## Votes (#30)

The `votes` collection (created 0024, `value` + `updateRule` added 0029) is exercised by the harness as of #30:

| Collection | list | view | create | update | delete |
|---|---|---|---|---|---|
| `votes` | member | member | member | own vote only | own vote only |

- **create** — `MEMBER_VIA_TRIP`. A `votes.pb.js` `onRecordCreateRequest` hook additionally enforces vote-as-yourself (`member.user === auth` and `member.trip === record.trip`). The harness votes as each role's own membership on a second fixture item so the unique `(item, member)` index isn't tripped.
- **update / delete** — `MEMBER_VIA_TRIP && member.user = @request.auth.id`. A member can only change or remove **their own** vote. The fixture vote belongs to the owner, so co_owner/traveler/viewer get `404` (the rule filters the record out of their view, so it reads as not-found). Changing a vote is an update (the unique index makes a re-vote an update, not an insert).

## Trip Goals (#75)

The `trip_goals` collection (created 0040) is exercised by the harness as of #75. Goals are trip-scoped, phase-less aspirations; create/edit are open to owner·co_owner·traveler with **no suggestion queue** (viewers are read-only), and delete is `creator OR owner/co_owner`.

| Collection | list | view | create | update | delete |
|---|---|---|---|---|---|
| `trip_goals` | member | member | non-viewer member (rule) | non-viewer member (hook) | creator or owner/co_owner (hook) |

- **create** — `MEMBER_VIA_TRIP && created_by.user = @request.auth.id && created_by.role != "viewer"`. Fully rule-expressible because `created_by` is a *single* relation: `created_by.role` correlates the author's role unambiguously (no multi-relation `?=` aliasing), and `created_by.user = auth` forces self-authorship. Viewers and non-members deny.
- **update (edit)** — rule is `MEMBER_VIA_TRIP`; `trip_goals.pb.js` `onRecordUpdateRequest` rejects viewers (`403`). The acting editor isn't necessarily the author, so their own role can't be correlated in one rule expression — hence the hook (same reasoning as the invites delete-hook).
- **delete** — rule is `MEMBER_VIA_TRIP`; `trip_goals.pb.js` `onRecordDeleteRequest` allows only the creator (`record.created_by === acting member id`) or an owner/co_owner. The fixture goal is authored by the **traveler**, so traveler passes as creator, owner/co_owner pass by role, and viewer/non-member deny. The **`AND zero goal_votes`** tightening on the creator branch lands in #77 with the `goal_votes` collection.

## Documents (#70)

The `documents` collection (created 0032) is exercised by the harness as of #70:

| Collection | list | view | create | update | delete |
|---|---|---|---|---|---|
| `documents` | member | member | member except viewer | — (none) | uploader or owner/co_owner |

- **create** — `MEMBER_VIA_TRIP`. A `documents.pb.js` `onRecordCreateRequest` hook blocks **viewers** and pins `uploaded_by` to the caller's membership (mirrors `expenses.created_by`). The `file` field requires a single PDF/image ≤ 20 MB (`mimeTypes` + `maxSize`); the harness uploads a valid 1x1 PNG via multipart so each role's result reflects the permission gate, not a payload-validation 400.
- **update** — `updateRule = null`. Documents are immutable artifacts in v4 (no edit UI); every role is denied.
- **delete** — `MEMBER_VIA_TRIP` by rule; the `documents.pb.js` `onRecordDeleteRequest` hook narrows it to the **uploader OR owner/co_owner**. The fixture document is uploaded by the owner, so owner + co_owner pass while traveler/viewer are denied. (Owner override vs. the old vault uploader-only rule — ADR-0005 / PRD §Permissions.)
- **files are `protected: true`** — downloads require a short-lived file token. The app mints tokens server-side and proxies bytes through `/trips/[slug]/documents/[docId]/file`, so tokens never reach the client and the future service worker can precache same-origin bytes.

## Users — co-traveler read (#103 / ADR-0006)

Migration `0043_users_viewable_by_cotravelers.js` loosens **only** `users.viewRule` from self-only to **co-traveler**, so the avatar wire-up (#59) can read a member's `name` + `avatar` through `expand:user`. Everything else 0014 set on `users` is unchanged.

| Collection | list | view | create | update | delete |
|---|---|---|---|---|---|
| `users` | self only | co-traveler (share a trip) | null (OTP hook) | self only | null (no API) |

- **view** — `co_traveler` (see identity expressions above). The harness's `view` matrix targets the **owner's** `users` row: owner/co_owner/traveler/viewer (all members of the fixture trip) view it → allow; non_member + anon → 404. The two-level nested back-relation is proven to evaluate in PB 0.27 — the ADR-0006 `pb_hooks` superuser-avatar fallback was not needed.
- **list** — stays **self-only** (`id = @request.auth.id`). No user enumeration: every role's `list` returns only their own row.
- **field-level visibility** — asserted by `runUsersCrossReadCases` in `test-rules.mjs`: a co-traveler's payload exposes `name` (populated) and `avatar` (key present, cross-readable) but **not** `email` (blanked — `emailVisibility` off), `password`, or `tokenKey` (PB always strips auth secrets). Email is **not** newly exposed by this change.
- **create / update / delete** — unchanged: create/delete admin-only (OTP hook / no API), update self-only (`/account` self-edit).

## Notes & gotchas

- **`view` denials look like 404s**, not 403s. The harness encodes both as "denied" but reports the exact code so we can spot when PB upgrades and changes behavior.
- **`list` denials don't 404 — they return 200 with an empty page.** The harness asserts the fixture record id is absent from the result set rather than checking a status code.
- **Anon doesn't get 401.** Unauthenticated requests against rule-protected endpoints fall through the same rule check as everyone else; since every rule starts with `@request.auth.id != ""`, anon always lands in the "deny" bucket (200 empty list / 404 view / 403 or 400 write). The harness expects `deny` for anon across the board.
- **Anon write may surface as 400 instead of 403.** When a rule denies a create payload that also fails server-side validation (e.g. trips.create with no `created_by`), PB returns the validation error, not the rule error. Both classify as `deny`.
- **Auth-collection `view` quirk**: PB's auth collection view rule is also gated by superuser-or-self for the auth fields (password hash, tokenKey). ~~With `viewRule = id = @request.auth.id` we get a clean self-only view. Cross-member lookup (e.g. avatar of a co-traveler) goes through `trip_members.display_name` instead, not through reading other users' rows.~~ **Superseded by #103 / ADR-0006:** `users.viewRule` is now `co_traveler`, so a member reads a co-traveler's `users` row directly (for the avatar wire-up). `password`/`tokenKey` are still always stripped, and `email` stays hidden because `emailVisibility` is off — only `name` + `avatar` (+ `verified`) cross-read. `display_name` on `trip_members` remains the per-trip nickname; the cross-user **identity** (name + avatar) is read from `users` via `expand:user`.
- **Back-relation requires the field to exist on the foreign side.** `trip_members.user` (relation to users) gives us `users.trip_members_via_user`. If a relation field is renamed or removed the back-relation name changes — update rule expressions in lockstep.
- **Multi-relation membership uses `?=`.** Single-relation would use `=`. The `trip_members_via_trip` back-relation is a list, hence `?=`.
- **`bindBody` doesn't unmarshal nested JSON.** A `DynamicModel` with nested object fields silently reads as empty in PB 0.27. For nested request bodies, read `e.requestInfo().body['key']` directly. The `/api/dev/rules-fixture` endpoint hit this; documented inline.
