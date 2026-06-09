# ADR-0006: `users` rows are readable by co-travelers (name + avatar), reversing self-only

**Status:** Accepted
**Date:** 2026-06-08
**Deciders:** Scott
**Context:** `docs/AVATARS_PRD.md` (Avatars); issue #59; reverses the self-only stance recorded in
`backend/RULES.md` (the "cross-member lookup goes through `trip_members`, not other users' rows" note)
and the `users.viewRule = SELF_ONLY` set in migration `0014_explicit_rules_audit.js`.

## Decision

The `users` collection **view rule** is loosened from self-only to **co-traveler**: an authenticated
user may view another user's row **iff they share at least one trip**. Concretely:

```
users.viewRule:
  @request.auth.id != "" && trip_members_via_user.trip.trip_members_via_trip.user ?= @request.auth.id
```

`listRule` stays **self-only** (no user enumeration). `emailVisibility` stays **off**. Auth secrets
(`password`, `tokenKey`) remain hidden by PB regardless of rule. Net effect: co-travelers can read each
other's **`name` and `avatar` only**.

This makes a user-level [[Avatar]] visible to the people who need it (co-travelers) **without** a file
proxy, a server-side superuser client, or denormalizing the avatar onto `trip_members`.

## Why

The original self-only rule treated the `users` row as private by default and routed all cross-member
display through `trip_members.display_name`. That worked for names but has **no avatar equivalent** — the
avatar file lives on `users`, and self-only means no co-traveler can ever read it. Wiring up the avatar
forces a choice about how cross-user identity is read.

The decisive reframe: **co-membership of a trip is already a trust boundary.** If you are travelling with
someone, you have their face and name in real life; the app hiding them behind initials is friction, not
privacy. The data this exposes is minimal and low-sensitivity (name + avatar), and PB's auth-collection
field handling means the genuinely sensitive fields cannot leak through a loosened view rule: `password`
and `tokenKey` are always hidden, and `email` stays gated behind the per-record `emailVisibility` flag,
which we leave off. So the "open up `users`" move is far narrower than it sounds.

The alternatives all cost more and deliver the same or less:

- **Server-proxy the bytes** (mirroring the documents file proxy) — the documents proxy works only
  because `documents` is *member-readable*; `users` is not, so an avatar proxy needs a cross-user read
  capability that doesn't exist. That means either a **SvelteKit superuser client** (new superuser
  credentials in the app server — new secret, blast radius outside PB) or a **`pb_hooks` superuser
  endpoint**. Both add a moving part this rule change removes entirely.
- **Denormalize the avatar (or its filename) onto `trip_members`** — makes the avatar per-trip instead of
  user-level (against the "persists across trips" requirement), duplicates the file/string N times, and
  needs a fan-out sync hook on every avatar change. The unprotected-file variant also drops to
  security-by-obscurity, contradicting membership gating.

## Considered and rejected

- **Keep self-only; proxy avatars via a superuser path.** Rejected: adds a superuser credential or a
  bespoke hook endpoint to read data that is fine to expose to co-travelers anyway. More surface for less.
- **Also expose email to co-travelers** (`emailVisibility = true`). Rejected for now: the app surfaces
  co-traveler email to no one today; opening it is a separate, larger exposure with no concrete use yet.
  Decoupled from the avatar — can be revisited independently.
- **Per-trip avatar override on `trip_members`** (mirroring `display_name`). Rejected: an avatar is
  identity, not social context; a column + second upload surface for a want nobody has expressed. The
  read path leaves the door open to add it later without migration pain.

## Consequences

- `backend/RULES.md` must be updated in lockstep with the migration: the `users` view row changes from
  self-only to co-traveler, and the line "cross-member lookup goes through `trip_members`, not other
  users' rows" is superseded for name + avatar.
- **Load-bearing once shipped.** Client loaders will `expand:user` and depend on the row being readable;
  reverting to self-only would break every avatar surface. Hence ADR (hard to reverse).
- The rule is a **two-level nested back-relation**, deeper than anything currently in the codebase. It
  must be proven in `backend/test-rules.mjs`. If PB 0.27 cannot evaluate it correctly/performantly, the
  fallback is a `pb_hooks` superuser endpoint that streams the avatar bytes under a membership check —
  the implementation changes but **this decision (co-travelers may see name + avatar) does not.**
