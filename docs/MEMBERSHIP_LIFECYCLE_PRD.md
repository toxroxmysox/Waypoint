# PRD — Membership Lifecycle (entry + exit)

> Status: **Resolved — ready for slicing.** Grilled 2026-06-10 (HITL) against `CONTEXT.md`,
> `backend/RULES.md`, `docs/AVATARS_PRD.md`, the live invite/claim/remove code
> (`backend/pb_hooks/invites.pb.js`, `members.pb.js`, `src/routes/invite/[code]/`), and the
> `trip_members`-targeting relations across migrations 0006–0044.
> Covers two issues: [#118](https://github.com/toxroxmysox/Waypoint/issues/118) (entry — shared
> join link) and [#133](https://github.com/toxroxmysox/Waypoint/issues/133) (exit — member removal).
> Glossary terms touched: [[Join Link]] (new), [[Departed Member]] (new), [[Invite]], [[Claim]],
> [[Placeholder Member]], [[Trip Member]], [[Role]] in `CONTEXT.md`.
> Decision record: `docs/adr/0008-member-removal-semantics.md`.

---

## Grounding (verified in code, 2026-06-10)

- **Entry today is email-bound only.** `/api/invites/accept` hard-rejects unless
  `auth.email == invite.email`. There is no shared/reusable link. `pending_invites` =
  one code, one email, single-use, 7-day expiry.
- **Exit today is a raw delete.** `/api/members/remove` calls `e.app.delete(target)`,
  which 400s the moment the member has authored records, because these point
  **required + non-cascading** at `trip_members`: `suggestions.author`,
  `expenses.paid_by`/`created_by`, `settlements.from_member`/`to_member`/`created_by`,
  `trip_goals.created_by`, `documents.uploaded_by`. Already cascading (data vanishes):
  `votes.member`, `goal_votes.member`. Already nullified (optional):
  `items.created_by`/`paid_by`/`booked_by`/`assigned_to`, `suggestions.reviewed_by`,
  `tasks.assignee`.
- `trip_members` fields today: `trip, user, role, display_name, placeholder_name,
  placeholder_email, joined_at, claimable_by`. **No `removed_at`** (next migration 0045+).

---

## Resolutions — #118 entry grill (2026-06-10)

1. **Shared reusable [[Join Link]], coexisting with email [[Invite]]s.** A new
   trip-level join token (not email-bound), pasteable into a group text. Email-bound
   invites stay for targeted per-person invites and remain the *only* path that can
   mint a co_owner.
2. **Owner picks the link role, capped at traveler.** Default traveler, may downgrade
   to viewer. **co_owner is never mintable via a join link.**
3. **One link per role.** A trip can have a live **traveler** link *and* a live
   **viewer** link concurrently. Data model: a join-token keyed by `(trip, role)`,
   max two rows per trip — each with its own token, expiry, and revoked state.
4. **Revocable + rotatable + time-expiry.** Owner can revoke/regenerate at will (old
   token 404s); each link carries an owner-set expiry, default **30 days**, capped at
   trip end. *No use-cap.* (Considered and dropped — group size is unknown up front; a
   too-low cap silently locks out real invitees.)
5. **Live in `planning` + `active`, dead on `closed`.** Mid-trip joins are allowed; a
   closed/archived trip takes no new members (use the Public Archive token for read access).
6. **Pre-auth exposure = trip title + dates + join role only.** No roster, itinerary,
   money, or documents shown to an unauthenticated tapper. (A leaked link must not hand a
   stranger the member list or anyone's travel plans.)
7. **End-to-end flow:** tap link → pre-auth context card → email + OTP (reuses the
   existing inline OTP flow on `/invite`) → explicit "Join trip" confirm (no auto-join on
   tap) → land on `/trips/[slug]` in Planning Mode at the link's role.
8. **Placeholder interaction on join (full claim UX + clamp invariant):**
   - **Email-match** — a placeholder whose `placeholder_email` == the joiner's email is
     auto-claimed and **inherits its own role** (owner targeted that email; co_owner is
     intentional and exempt from the cap).
   - **Name-only** — offered in the browse-and-claim picker; claiming inherits the
     placeholder's **name/identity but the role is clamped to the link's role**.
   - **No match** — fresh member at the link role.
   - **Invariant:** *no join-link path yields a role above the link's cap, except an
     owner-targeted email match.* Impersonation of a name-only slot is accepted as
     detectable (member_joined notification + visible roster) and reversible (#133 removal).

---

## Resolutions — #133 exit grill (2026-06-10)

9. **Removal is a soft-remove tombstone** ([[Departed Member]]). The `trip_members` row
   is retained; the remove hook snapshots `users.name` → `display_name`, clears `user`
   (severs access, zero rule changes), sets `removed_at`. See ADR-0008.
10. **Money is never deleted.** Expenses & settlements keep-with-tombstone (default) or
    reassign to another member — never cascade. This is the load-bearing invariant.
11. **Non-money records: remover's three-way choice** — keep-with-tombstone / reassign /
    cascade-delete. Applies to suggestions, goals, documents, comments, item authorship,
    task assignments.
12. **Votes always drop.** `votes` + `goal_votes` keep their `cascadeDelete: true` — the
    one deliberate exception; stale preferences shouldn't steer live ordering. (Reassign
    skips votes: a preference can't be reassigned, and the unique `(item, member)` index
    would collide.)
13. **Self-leave is tombstone-only.** A leaver can't reassign or cascade. The full
    three-way choice belongs to owner/co_owner removal, which can also act on an existing
    tombstone later (removal is a durable, reviewable state).
14. **Removal allowed in `planning` + `active`, frozen on `closed`** — symmetric with the
    join window (Resolution 5).
15. **Tombstone avatar.** Departed members render with a distinct "departed" graphic, not
    the initials chip — a new `Avatar.svelte` variant. Their snapshotted name still shows
    on historical records ("Bob paid $40"); the avatar is replaced because `users` is now
    unlinked.

---

## Cross-issue consistency (entry ↔ exit)

- **A tombstone must never be claimable or re-addable as itself.** The #118 name-only
  claim picker queries `user = "" && placeholder_email = ""` — which **matches a
  Departed Member**. Every claim/roster/join query must add `&& removed_at = ""`
  (`/api/invites/lookup` placeholders, `/api/members/my-claims`, the members roster,
  add-placeholder duplicate checks). This is the single highest-risk integration point.
- **A re-invited departed person starts a fresh row.** Their tombstone history stays put;
  no auto-resurrection (their `placeholder_email` and `claimable_by` are cleared on removal).
- **A removed member can re-tap an open join link.** Inherent to open links; mitigated by
  revoke/rotate (Resolution 4). Owner can re-remove. Documented, not blocked.
- **Role clamp (Resolution 8) and tombstone (9) are independent** — no interaction.

---

## Suggested slicing

**#118 (entry)** — tracer-bullet vertical slices:
- 0045 migration: join-token model `(trip, role, token, expires_at, revoked)`.
- `POST /api/join/create|rotate|revoke` (owner/co_owner, role-capped at traveler).
- `POST /api/join/lookup` (anon, returns title + dates + role only).
- `POST /api/join/accept` — clamp invariant + email-match exemption; reuse claim machinery
  with the `removed_at = ""` guard.
- Front end: link-management UI on the members page; `/join/[token]` page reusing the
  `/invite` OTP + claim components.

**#133 (exit)** — slices:
- 0045+ migration: add `removed_at` to `trip_members`.
- Rewrite `/api/members/remove` → soft-remove + disposition (`keep` | `reassign` | `cascade`,
  money-gated; votes always drop; self-leave forced to `keep`).
- `Avatar.svelte` departed variant; roster "former members" section.
- Apply the `removed_at = ""` guard to every claim/join/roster query (shared with #118).
- Harness: childless delete-target fixture → `test-rules.mjs` 378/378.

**Shared dependency:** the `removed_at = ""` claim/join guard is touched by both — land
#133's `removed_at` field first, then #118 can build its claim path against it.
