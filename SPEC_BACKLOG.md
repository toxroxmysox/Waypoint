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

---

## How to use this file
- Add entries here instead of silently piling them into SPEC.md.
- When promoting an item into a milestone, cut it from this file in the same commit that amends SPEC.md.
- If an entry sits here for two milestones without being pulled in, delete it -- if it mattered, it would have been pulled by now.
