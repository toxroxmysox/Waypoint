# SPEC_BACKLOG

Deferred work captured during M1. Each entry notes what it is, why it was deferred, and the target milestone. Before starting anything here, amend `SPEC.md` per the CLAUDE.md scope-change protocol.

---

## Next / Previous Day Navigation
- **What:** On the day detail screen, arrows (or swipe) to jump to the adjacent day in the same trip without bouncing back to the phase list.
- **Why deferred:** Not in M1 acceptance. Pure polish; current phase -> day list flow is usable.
- **Target:** M6 Polish.
- **Notes:** Wrap-around behavior undecided. Probably clamp at trip boundaries rather than wrap.

## Multi-Day Lodging Items
- **What:** A single lodging item that spans a date range instead of repeating one item per night, with per-day rendering on each day's detail view.
- **Why deferred:** SPEC.md models items as belonging to a single day. Changing that touches the data model, day-detail rendering, and the item form. Too invasive for M1.
- **Target:** Needs a spec amendment. Likely M4 Execution (when lodging is actively in use) or pulled forward if the May dogfood trip makes the current model painful.
- **Notes:** Options to weigh:
  1. New `lodging_stays` collection with `check_in` / `check_out` and surface on every day in range.
  2. Keep items single-day; add `links_to` field so a "Night 2 of Hotel X" item back-references the root item.
  3. Store `start_date` / `end_date` on items of type `lodging` and fan out in the UI.

## Tri-State Booking Pill
- **What:** Booking status cycles `not booked` -> `partially booked` -> `booked` (currently a boolean).
- **Why deferred:** M1 ships a boolean. Multi-leg transit and grouped lodging are where the middle state actually matters, and those land in M3/M4.
- **Target:** M3 Money (booking lives next to cost).
- **Notes:** Migration will widen the column. UI already has space for a pill-shaped control.

## App Icon Artwork Refresh
- **What:** Regenerate `static/icons/icon-192.png` and `icon-512.png` (and the `apple-touch-icon` they back) in the new paper/ink/moss palette so the home-screen icon matches the in-app design system.
- **Why deferred:** M1.5a updated the meta `theme-color` and manifest colors but left the existing PNGs in place — new artwork is a design task, not a code change.
- **Target:** M6 Polish (or sooner if Scott wants the home-screen install to look right before the China dogfood).
- **Notes:** Maskable variant should keep safe area; consider a moss-on-paper monogram or a simple waypoint glyph. Update both sizes plus any future favicon.

---

## From M2 — Collaboration

### Invite resend action
- **What:** "Resend invite email" button on the pending invites list. Currently the inviter must revoke and re-create to trigger a new email.
- **Why deferred:** Uncommon path; revoke + re-create works.
- **Target:** M4 Polish.

### Role downgrade (co-owner → traveler)
- **What:** The promote endpoint only upgrades traveler → co-owner. Downgrade is missing.
- **Why deferred:** Not needed for initial dogfood trips where Scott is the only owner.
- **Target:** M4.

### Notification dedup / batching
- **What:** Multiple comments in quick succession generate one notification per comment. Add a debounce window (e.g. 5 minutes) so a comment storm becomes one digest notification.
- **Why deferred:** Not a problem at small trip scale.
- **Target:** M3 or M4 based on dogfood feedback.

### Notification realtime update
- **What:** The bell unread count reflects page-load state only. New notifications arriving while the page is open don't update the badge until a full reload.
- **Why deferred:** Polling or SSE adds complexity; single-user trips rarely need it.
- **Target:** M4 Execution (when offline/realtime work happens anyway).

### Traveler auto-approve full E2E test (test-suggestions.mjs test 6)
- **What:** Test 6 in `backend/test-suggestions.mjs` is SKIPped because it requires PB admin credentials to set `auto_approve_suggestions = true` mid-test. The logic is exercised manually but not in CI.
- **Why deferred:** Needs `PB_ADMIN_EMAIL` + `PB_ADMIN_PASSWORD` in `.env.local`.
- **Target:** M3 pre-flight — add creds to env, un-skip test.

### Edit-and-approve UI in inbox
- **What:** The backend `/api/suggestions/review` endpoint accepts a `payload` override for edit-and-approve, but the inbox UI just passes the original traveler payload. No edit form is exposed.
- **Why deferred:** Backend is ready; frontend work is polish.
- **Target:** M4 Polish.

### Comment edit / delete
- **What:** Comments are immutable once posted.
- **Why deferred:** Per SPEC intent. Most collaborative tools don't allow retroactive comment edits to preserve audit trail.
- **Target:** Only pull in if dogfood reveals real friction.

---

## How to use this file
- Add entries here instead of silently piling them into SPEC.md.
- When promoting an item into a milestone, cut it from this file in the same commit that amends SPEC.md.
- If an entry sits here for two milestones without being pulled in, delete it -- if it mattered, it would have been pulled by now.
