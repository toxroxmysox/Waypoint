# HANDOFF — #103 co-traveler read rule on `users` (name + avatar)

Implementation session, 2026-06-09. Backend slice of Avatars (#59), per `docs/AVATARS_PRD.md`
+ `docs/adr/0006-users-readable-by-co-travelers.md`. **PR opened, not merged.**

## What shipped

Loosened **only** `users.viewRule` from self-only → co-traveler so a member can read another
member's `name` + `avatar` through `expand:user`. The rest of the `users` rules are untouched.

| File | Change |
|---|---|
| `backend/pb_migrations/0043_users_viewable_by_cotravelers.js` | **New** append-only migration. Sets `users.viewRule` to the co-traveler expression. Down restores `id = @request.auth.id` (0014's prior state). |
| `backend/test-rules.mjs` | `EXPECT.users.view` → `ALLOW_MEMBERS_DENY_NONMEMBER`; added `runUsersCrossReadCases` + `printUsersCrossReadReport` for field-level visibility. |
| `backend/RULES.md` | `users` view row → co-traveler; added `co_traveler` identity expr; added a #103/ADR-0006 section; superseded the "cross-member lookup goes through `trip_members`" note for name+avatar. |

Rule text:
```
users.viewRule:
  @request.auth.id != "" && trip_members_via_user.trip.trip_members_via_trip.user ?= @request.auth.id
```

## The headline result — the nested rule WORKS; no fallback needed

The expression is a **two-level nested back-relation**, deeper than anything else in the codebase
(every other rule stops at one level). The PRD/ADR flagged it as unproven in PB 0.27 and specified a
`pb_hooks` superuser-avatar endpoint as fallback. **It evaluates correctly in PB 0.27.2** — proven
in the harness, so the fallback was **not** implemented (the ADR decision holds; only the mechanism
question is now resolved in favour of the rule).

## Proof (TDD red → green)

Ran an isolated PB (0.27.2) from this worktree on `:8091`, fresh DB, against `test-rules.mjs`.

- **RED** (migrations 0001–0042, no 0043): `users.view` for co_owner/traveler/viewer = `deny/404`;
  cross-read `name`/`avatar` not visible — the new expectations failed, as expected.
- **GREEN** (with 0043): all #103 cells pass:
  - `users.view`: owner/co_owner/traveler/viewer → `allow/200`; non_member + anon → `deny/404`.
  - `users.list`: stays self-only (every role sees only its own row).
  - Cross-read payload (co_owner reading owner's row): `name` populated ✓, `avatar` key present ✓,
    `email` blanked ✓, `password` absent ✓, `tokenKey` absent ✓.
- **Reversibility**: `migrate down 1` → `id = @request.auth.id`; `migrate up` → co-traveler. Clean.

Reproduce:
```
cp /Users/Scott/Waypoint/backend/pocketbase backend/pocketbase   # PB 0.27.2, gitignored
WT=$PWD
WAYPOINT_DEV_MODE=true \
E2E_TEST_EMAILS="rules-owner@e2e.test,rules-coowner@e2e.test,rules-traveler@e2e.test,rules-viewer@e2e.test,rules-nonmember@e2e.test" \
  backend/pocketbase serve --dir /tmp/wt103-pbdata --http 127.0.0.1:8091 --hooksWatch=false \
  --hooksDir "$WT/backend/pb_hooks" --migrationsDir "$WT/backend/pb_migrations"
PUBLIC_PB_URL=http://127.0.0.1:8091 node backend/test-rules.mjs
```

## Verification status

- `pnpm test:rules`: **368/372 green.** All 12 #103 cells (5 matrix + 7 cross-read) pass.
- `pnpm check`: **green** (0 errors). My diff touches no Svelte/TS — required `.env` with
  `PUBLIC_PB_URL` for `svelte-kit sync` to type `$env/static/public` (env artifact of a fresh
  worktree, not a code issue).

## ⚠ Pre-existing, OUT-OF-SCOPE failure (not introduced here)

The 4 remaining red cells are `trip_members.delete` (owner/co_owner/traveler/viewer all
`deny/HTTP 400`). **Pre-existing on main** — reproduces on a fresh DB with the *unmodified* harness
(also seen in the RED run before 0043). Root cause: the delete phase targets `memberIds.owner`, but
the rules-fixture pins many **required, non-cascade** child relations to the owner member
(`items.created_by`, `votes.member`, `trip_goals.created_by`, `goal_votes.member`,
`documents.uploaded_by`) → PB refuses with *"record is not part of a required relation reference."*
The owner member is structurally undeletable in the fixture. Accumulated as collections were added
(#70, #77). A background task chip was spawned to fix the fixture/expectations + update RULES.md.

## Notes for the next agent

- This is the **backend slice only**. The remaining #59 work (the `/account` upload page,
  `memberAvatarUrl(member)` helper, and wiring `img=` into the `<Avatar>` call sites in the PRD
  table) is **not** in this PR.
- `backend/pocketbase` binary, `.env`, `pb_data` are all gitignored — not committed.
- Local-only test scaffolding leftovers: `/tmp/wt103-pbdata`, `/tmp/wt103-*.log`.
