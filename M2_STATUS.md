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

### M2a — Rules audit + verification harness
Lock down permissions before adding any new surface. M1 shipped a missing `deleteRule` (commit fd23eac) — this prevents that class of bug.

Tasks:
- New migration: audit `users`, `trips`, `trip_members`, `phases`, `days`, `items`, `checklist_items` — every collection has all 5 rules (list/view/create/update/delete) explicitly set, with `// reason: ...` for any intentional null
- `backend/RULES.md`: matrix of "role × collection × op" with intended behavior
- `backend/test-rules.mjs`: script auths as owner / co-owner / traveler / viewer / non-member; exercises each (collection, op) cell; reports pass/fail with HTTP codes
- Run harness, fix discrepancies, commit RULES.md as source of truth

Acceptance: harness green against current schema. Documented intent matches observed behavior.

---

### M2b — Invites + Resend
Email invitation flow. Blocked by pre-flight.

Tasks:
- Migration: `pending_invites` per SPEC §4, all 5 rules
- Server endpoint / hook: create invite (validates inviter role can invite at requested role per SPEC §3 — travelers can invite traveler/viewer only)
- pb_hooks: send email via Resend on invite create. Smoke-test the callback with `console.log` first (PB v0.27 isolation gotcha — see Claude.md)
- Email template: plaintext-first with one-line HTML wrap. Subject: "[name] invited you to plan [trip title]"
- Frontend: `Members` screen at `/trips/[slug]/members` — current members list with role pill, invite form (email + role select gated by inviter role), pending invites list with revoke
- Frontend: invite-accept route `/invite/[code]` — if logged out, sign-up flow with email pre-filled; if logged in and email matches, one-click join; if email mismatch, error with "log out and accept as the invited address"
- Hook on accept: create `trip_member`, delete `pending_invite`
- Edges: expired code, already-member, revoked invite — friendly error each

Acceptance: invite scottvh519+test@gmail.com → email arrives → accept → membership visible to inviter.

---

### M2c — Placeholder members, auto-merge, promote, remove
All Members-screen role management.

Tasks:
- Frontend: "Add placeholder" form on Members screen (display_name + optional placeholder_email + role)
- pb_hook on `users` create: scan `trip_members` for `placeholder_email = user.email`; if any match, mark them claimable for the new user
- Claim UI: post-login interstitial "Join [trip title] as [placeholder_name]? You can change your display name." Confirm → set `user`, clear placeholder fields, set `joined_at`
- Frontend: per-row "Promote to Co-Owner" action (visible only to owners/co-owners, only on travelers)
- Frontend: per-row "Remove" action (visible to owners/co-owners; disabled for self if sole owner)
- Hook validation enforces invariants: cannot demote sole owner, cannot remove sole owner, only owner/co-owner can change roles

Acceptance: add Jake placeholder → Jake signs up → claim prompt → membership merges. Promote Jake to co-owner. Remove Jake. Sole-owner self-removal blocked.

---

### M2d — Suggestions inbox
Travelers suggest items; owners review. Spec auto-approval logic centralized in one hook.

Tasks:
- Migration: `suggestions` per SPEC §4, all 5 rules (only owners/co-owners can update review status; authors can read their own; trip members can read approved)
- Server hook on suggestion create:
  - If author role ∈ {owner, co_owner} → auto-approve, create item from payload immediately
  - Else if author role = traveler AND trip.auto_approve_suggestions → auto-approve, create item
  - Else → leave pending
- Frontend: when role = traveler AND auto-approve off, item-add form POSTs to `suggestions` (target_type=new_item) instead of `items`
- Frontend: Inbox screen `/trips/[slug]/inbox` — pending list with diff/preview card per suggestion (renders the `payload` as a read-only item card)
- Frontend: action buttons — Approve / Edit & Approve / Reject. Edit & Approve opens the item-add form pre-filled from `payload`
- Trip settings: `auto_approve_suggestions` toggle
- Auto-approved suggestions kept with `status=approved` + audit marker

Acceptance: traveler with auto-approve off suggests an item → it lands in inbox → owner approves → real item appears. Auto-approve path also works. Reject removes from pending without creating an item.

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
