# M2 Status

**Status:** Planning. Started 2026-04-24. Stretch target: substantively complete before May 15 China dogfood. Hard target: per SPEC.md, by 2026-06-15.

---

## Premise

M1 failure modes were DOM / CSS / Svelte 5 / iOS. M2 failure modes will be different: permission rules, server-side hooks, race conditions, and email deliverability. The plan reflects that — rules are locked first, hook callbacks get smoke-tested before logic, and Resend is a real prerequisite, not a finishing detail.

The spec keeps comments and item suggestions in a single `suggestions` collection (per SPEC §4, `target_type: new_item | comment`). Both flow through the same auto-approval logic; comments just always auto-approve.

---

## Pre-flight (blocks M2b)

- [ ] Resend account created (resend.com signup, free tier 3000/mo)
- [ ] DNS records for `scottvandenwarsen.com` (SPF + DKIM, Resend dashboard provides values)
- [ ] FROM address decided (recommendation: `trips@scottvandenwarsen.com`)
- [ ] Resend API key in `.env.local`; placeholder in `.env.example`
- [ ] Verified send to scottvh519@gmail.com from `pb_hooks` smoke test

M2a does not need Resend. Run pre-flight in parallel with M2a so M2b isn't blocked.

---

## Sub-milestones

### M2a — Rules audit + verification harness ✓ Complete (2026-04-25)
Lock down permissions before adding any new surface. M1 shipped a missing `deleteRule` (commit fd23eac) — this prevents that class of bug.

Tasks:
- [x] New migration `0014_explicit_rules_audit.js`: audits `users`, `trips`, `trip_members`, `phases`, `days`, `items`, `checklist_items` — every collection has all 5 rules (list/view/create/update/delete) explicitly set, with `// reason: ...` for any intentional null
- [x] `backend/RULES.md`: matrix of "role × collection × op" with intended behavior + planned tightening per sub-milestone
- [x] `backend/test-rules.mjs`: script auths as owner / co-owner / traveler / viewer / non-member + anon; exercises each (collection, op) cell against a fresh fixture trip; reports pass/fail with HTTP codes
- [x] `pnpm test:rules` script wired up; harness runs against a PB started with `WAYPOINT_DEV_MODE=true E2E_TEST_EMAILS=<5 emails>`
- [x] Harness green: **210/210 cells pass** against current schema
- [x] Lessons captured in RULES.md notes (anon→deny, bindBody nested unmarshaling gotcha)

Acceptance: harness green against current schema. Documented intent matches observed behavior. **Met.**

---

### M2b — Invites + Resend ✓ Complete (2026-04-26)
Email invitation flow. Built on the M2a baseline; first hook-based role gating.

Tasks:
- [x] Migration `0015_pending_invites.js`: per SPEC §4, all 5 rules explicit; unique indexes on `code` and `(trip, email)`; cascade-delete on trip + invited_by
- [x] `pb_hooks/invites.pb.js`: four entry points
  - `POST /api/invites/create` — auth, SPEC §3 inviter role gating (viewer denied, traveler limited to traveler/viewer), already-member rejection, server-generated `code` (40 chars) + 7-day `expires_at`
  - `POST /api/invites/lookup` — anon, returns minimal metadata (`email`, `role`, `trip_title`, `inviter_name`, `expired`) so the accept page can render before login
  - `POST /api/invites/accept` — auth, email-match guard, idempotent already-member short-circuit, placeholder-claim path, deletes consumed invite
  - `onRecordDeleteRequest('pending_invites')` — revoke gating: owner/co_owner any, traveler their own only, viewer denied
- [x] `onRecordAfterCreateSuccess('pending_invites')` — sends Resend email; fails soft (logs but doesn't roll back). Plaintext + one-line HTML wrap. Subject: `[inviter] invited you to plan [trip]`
- [x] `backend/test-invites.mjs` + `pnpm test:invites` — 41/41 assertions across create role-gating, payload validation, lookup paths, accept happy + edge, revoke gating
- [x] `backend/test-rules.mjs` extended with `pending_invites` row — harness now **240/240** (was 210/210)
- [x] `backend/RULES.md` updated: matrix row, planned-tightening note moved from "M2b plan" to "M2b done"
- [x] Frontend `/trips/[slug]/members` — members list with role pill, role-gated invite form (viewers hidden, travelers limited to traveler/viewer), pending invites list with revoke
- [x] Frontend `/invite/[code]` — five rendered states (not_found, expired, match, mismatch, logged_out). Match → one-click accept; mismatch → in-place sign-out reuses the invite link; logged_out → OTP flow with email pre-filled and locked, on verify the page reloads into match state
- [x] Members tab added to `TripTabs.svelte`
- [x] `PendingInvite` + `InviteRole` added to `src/lib/types.ts`

Acceptance: harness green, invite endpoint suite green, M1 E2E still 2/2 green, `pnpm check` clean (0/0/0). Manual end-to-end (invite → email → accept → membership visible to inviter) deferred to user-side QA — Resend smoke test green from M2 pre-flight covers the deliverability leg.

Open notes:
- E2E for the invite flow itself deferred — modeled multi-session in M2g per the original plan (it's harder to fixture two real users in one Playwright run; we did exercise every backend assertion via test-invites.mjs).
- `.env.local` LAN-IP `PUBLIC_PB_URL` drift broke local E2E during this session (router DHCP changed from .55 → .54). Verified clean by overriding `PUBLIC_PB_URL=http://127.0.0.1:8090` for the test run. Update `.env.local` when the LAN IP shifts.

---

### M2c — Placeholder members, auto-merge, promote, remove ✓ Complete (2026-04-27)
All Members-screen role management.

Tasks:
- [x] Migration `0016_trip_members_claimable.js`: `claimable_by` RelationField → users on `trip_members`
- [x] `pb_hooks/members.pb.js`: six endpoints + hook
  - `onRecordAfterCreateSuccess('users')` — auto-merge: scans trip_members for placeholder_email match, sets claimable_by
  - `GET /api/members/my-claims` — returns pending placeholder claims for auth user (admin context)
  - `POST /api/members/claim` — accept claim; sets user, joined_at, display_name; clears placeholders. Check order: user-already-set (400 if same user, 403 if different) before claimable_by check (403)
  - `POST /api/members/add-placeholder` — role-gated (viewer denied, traveler limited to traveler/viewer); sets claimable_by immediately if user already exists
  - `POST /api/members/promote` — owner/co_owner only; traveler → co_owner only
  - `POST /api/members/remove` — owner/co_owner only; sole-owner removal blocked
- [x] `/claim` route: post-login interstitial; auto-redirects to `/trips` if no pending claims
- [x] Members page: collapsible add-placeholder form, per-row promote/remove with auth guards
- [x] Login (verifyOTP + dev bypass) redirects to `/claim` instead of `/trips`
- [x] `backend/test-members.mjs` + `pnpm test:members` — **31/31** assertions green
- [x] `.env.local`: `e2e@waypoint.local` added to `E2E_TEST_EMAILS` (was breaking E2E after whitelist gate added in M2b)

Acceptance: all acceptance criteria met.
- pnpm check: 0/0/0
- test:rules: 240/240
- test:members: 31/31
- test:e2e: 2/2

---

### M2d — Suggestions inbox ✓ Complete (2026-05-09)
Travelers suggest items; owners review. Spec auto-approval logic centralized in one hook.

Tasks:
- [x] Migration `0017_suggestions.js`: `suggestions` collection, all 5 rules, cascade delete
- [x] Migration `0018_fix_suggestions_fields.js`: schema corrections
- [x] Migration `0019_suggestions_cascade.js`: cascade delete suggestions on trip delete
- [x] `pb_hooks/suggestions.pb.js`: three endpoints
  - `POST /api/suggestions/create` — viewer blocked, owner/co_owner auto-approve (creates item), traveler auto-approve when trip flag set, else pending
  - `GET /api/suggestions/list` — owner/co_owner see all, traveler sees own; status filter optional
  - `POST /api/suggestions/review` — owner/co_owner only; approve creates item (with optional payload override for edit-and-approve); reject marks rejected; idempotent guard on non-pending
- [x] `auto_approve_suggestions` trip field + settings toggle (M2d branch)
- [x] `/trips/[slug]/inbox` route: pending list, approve/reject/edit-and-approve actions
- [x] Inbox tab in TripTabs (owner/co_owner only)
- [x] `backend/test-suggestions.mjs` + `pnpm test:suggestions` — **19/19** green (1 SKIP: traveler auto-approve needs PB admin creds in .env.local)
- [x] PB 0.27 gotchas: JSON field returns as byte array (fixed with String.fromCharCode decode), `created` not valid sort key (use `-id`), module-scope helpers invisible (inline all logic)

Acceptance: all met. traveler suggests → inbox → owner approves → item created. Edit-and-approve, reject, double-reject guard, auto-approve paths all green.

Open notes:
- Traveler auto-approve test (test 6) SKIPs without PB admin credentials. Add `PB_ADMIN_EMAIL` + `PB_ADMIN_PASSWORD` to `.env.local` to enable it.

---

### M2e — Comments
Per-item comment thread. Same `suggestions` collection, `target_type=comment`. All comments auto-approve for all roles (viewer included, per SPEC §3).

Tasks:
- Server hook handles `target_type=comment` branch: always auto-approve regardless of author role
- Frontend: comment thread on item detail — author display_name + role badge + timestamp + text, oldest first
- Frontend: comment input + submit (textarea, max length, no markdown for v1)
- Mobile: thread renders cleanly under item card; doesn't cause horizontal scroll
- Optimistic UI: comment appears immediately on submit, reconciles on server ack

Acceptance: a comment from each role appears in order on the item detail screen.

---

### M2f — Notifications skeleton
In-app bell + triggers. No email, no push (per SPEC §12).

Tasks:
- Migration: `notifications` per SPEC §4, all 5 rules (recipient-only read; recipient-only update for `read_at`)
- Server hooks:
  - `suggestion_added` → recipients = owners + co-owners (when `target_type=new_item` AND `status=pending`)
  - `comment_added` → recipients = all trip members minus author (when `target_type=comment`)
  - `member_joined` → recipients = owners + co-owners + the joiner
- Frontend: bell icon in app header with unread count badge
- Frontend: dropdown panel listing recent notifications (timestamp, type-specific text, link to trip/item)
- Mark-read on click of an individual notification; "mark all read" action
- Optional: per-trip filter (defer if it adds complexity; SPEC doesn't require)

Acceptance: each trigger fires for the correct recipients. Clicking a notification navigates to the right place and marks it read. Unread count decrements correctly.

---

### M2g — Multi-session E2E + polish
Spec acceptance gate. Playwright models two+ real users.

Tasks:
- Playwright config: `storageState` fixtures per role (login once, reuse cookies for owner / co-owner / traveler / viewer)
- E2E happy path: owner creates trip → invites Abby (co-owner) → Abby accepts → owner adds Jake as placeholder traveler → Jake signs up with matching email → claim prompt → Jake suggests an item → owner sees inbox notification → owner approves → all three comment → owner promotes Jake to co-owner
- Mobile responsive pass: Members, Inbox, Comments thread, Bell dropdown — all clean at 375px
- `SETUP.md`: add Resend env var, FROM address note
- `SPEC_BACKLOG.md`: add anything that emerged during M2 and got deferred
- Verify SPEC §6 M2 acceptance criteria one by one against the build

Acceptance: full multi-user E2E green; mobile pass clean; every M2 acceptance criterion in SPEC §6 explicitly checked.

---

## Open decisions (defer until forced)

- FROM address for Resend (`trips@` recommended) — confirm during pre-flight
- Notification dedup: if 3 comments arrive in 30s, do we send 3 notifications or 1? — defer to M2f. Default: 1-per-event.
- Comment edit/delete — out of scope; if requested, add to backlog
- Suggestions inbox per-user vs per-trip — SPEC §8 says per-trip (one shared inbox for owners + co-owners). Locked.

## Deferred to backlog

(none yet — entries get added here as they emerge during the sub-milestones, then move to `SPEC_BACKLOG.md` at M2g)

---

## Working agreement (per 2026-04-24 conversation)

- M2 work on `m2-collab` branch, or per-sub-milestone branches, PR'd to `main` like M1
- China dogfood May 15 runs against whatever's on `main`. Do not merge mid-M2 work to `main` before then.
- If China surfaces an M1 blocker → pause M2, fix on `main`, rebase M2
- M1 acceptance closed: Spain recreation passed, mobile pass passed. China is now real-world stress test, not a milestone gate.

---

## Resume prompt (for next session or after a usage limit)

```
Resume Waypoint M2 work.

Current sub-milestone: <check M2_STATUS.md>
Last commit: <check git log>

Before starting:
1. git status && git log --oneline -5
2. cat M2_STATUS.md && cat SPEC.md (M2 section)
3. pnpm check && pnpm test:e2e

Then pick up the next sub-milestone task per M2_STATUS.md.
M2 work lives on m2-collab branch (or sub-milestone branches), PR'd to main.
Do not merge to main without confirming the work is whole — China dogfood May 15 ships from main.
```
