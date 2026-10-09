# #438 — item page: Hero header and body (Planning Mode)

Refs #438, parent #418, D12/D13 in `docs/CARD_SYSTEM.md`. Builds on #428 (Hero), #437 (bar + menu), #416 (`itemPermissions`).

## Decisions
- Pure derivations in `src/lib/itinerary/item-page.ts` (Vitest first): `itemTypeLine` (`Meal · Dinner`, "other" subtype dropped), `itemTimeText` (date-led text grammar; multi-day `Thu Oct 1–Sat Oct 3 · 2 nights`), `detailsRows` (estimate; payment row = `Paid $X` or `Log payment`, independent of the estimate; booking link; cancellation; phase), `addLine` (which of `+ Document` / `+ Checklist` show), `newestFirst` (comments).
- Hero (extend, Now untouched): `docs` rows under the codes (44px links, quiet ink), `done` (`✓ Done`), `needsBooking` (gold `To book` chip; #441 turns it into a button via `children`). Planning Mode = not live: no `status` passed, no accent.
- Page: Hero replaces the header card + `ItemForm mode=view` cards (Schedule/Location/Booking/Cost/Assigned to). The view mode of ItemForm goes (edit/create keep "Going" copy).
- Body: description, one Details card, Goals; Documents/Checklist full sections only when non-empty (or opened), else a one-line `+ Document · + Checklist`; Comments with composer first.
- Desktop (`md-desktop`): two columns. Left: Hero, votes (kept, #442 reworks), description, Details, Goals. Right: Documents, Checklist, Comments.
- Copy: "Assigned to" -> "Going" everywhere.
- Slots for later tickets: Hero `children` (after Going: #441 booking actions), `[data-testid=hero-going]` (#440), the votes block (#442), Details card (#439 folds it).

## Tasks
1. Red: `item-page.test.ts`; implement.
2. Hero props; page rebuild; ItemForm cleanup; copy.
3. Specs: role-gating / checklist / closeout selectors (`+ Checklist`, `+ Document`); new item-page e2e.
4. CARD_CONTENT_SPEC section 3 only.
5. Verify: check, unit, `E2E_SLOT=2 test:e2e:clean`, 375/768/1280 shots (rich + sparse).
