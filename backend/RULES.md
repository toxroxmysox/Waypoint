# PocketBase Permissions — Rules of Record

Source of truth for who can do what against the API. Generated and verified by `backend/test-rules.mjs`. Update this file when rules change; the harness will fail if the documented intent diverges from observed behavior.

Last reviewed: 2026-04-26 (M2b — pending_invites added; first hook-based role gating).

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
| `users` | self only | self only | null (OTP hook) | self only | null (no API) |
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

**Identity expressions used in 0014:**

```
self_only        = id = @request.auth.id
authed           = @request.auth.id != ""
member           = @request.auth.id != "" && trip_members_via_trip.user ?= @request.auth.id
member_via_trip  = @request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id
member_via_item  = @request.auth.id != "" && item.trip.trip_members_via_trip.user ?= @request.auth.id
```

The `?=` operator in PB is "any of the multi-relation values matches". Required because `trip_members_via_trip` is a back-relation (multiple rows per trip).

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

## Notes & gotchas

- **`view` denials look like 404s**, not 403s. The harness encodes both as "denied" but reports the exact code so we can spot when PB upgrades and changes behavior.
- **`list` denials don't 404 — they return 200 with an empty page.** The harness asserts the fixture record id is absent from the result set rather than checking a status code.
- **Anon doesn't get 401.** Unauthenticated requests against rule-protected endpoints fall through the same rule check as everyone else; since every rule starts with `@request.auth.id != ""`, anon always lands in the "deny" bucket (200 empty list / 404 view / 403 or 400 write). The harness expects `deny` for anon across the board.
- **Anon write may surface as 400 instead of 403.** When a rule denies a create payload that also fails server-side validation (e.g. trips.create with no `created_by`), PB returns the validation error, not the rule error. Both classify as `deny`.
- **Auth-collection `view` quirk**: PB's auth collection view rule is also gated by superuser-or-self for the auth fields (password hash, tokenKey). With `viewRule = id = @request.auth.id` we get a clean self-only view. Cross-member lookup (e.g. avatar of a co-traveler) goes through `trip_members.display_name` instead, not through reading other users' rows.
- **Back-relation requires the field to exist on the foreign side.** `trip_members.user` (relation to users) gives us `users.trip_members_via_user`. If a relation field is renamed or removed the back-relation name changes — update rule expressions in lockstep.
- **Multi-relation membership uses `?=`.** Single-relation would use `=`. The `trip_members_via_trip` back-relation is a list, hence `?=`.
- **`bindBody` doesn't unmarshal nested JSON.** A `DynamicModel` with nested object fields silently reads as empty in PB 0.27. For nested request bodies, read `e.requestInfo().body['key']` directly. The `/api/dev/rules-fixture` endpoint hit this; documented inline.
