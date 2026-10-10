# #441 Book ↗ and Mark booked (plan)

Spec #418 stories 64, 65; CARD_SYSTEM D12; ADR-0014. Builds on the Hero (#428/#438) `children` slot and the ⋯ menu permissions (#437).

## Decisions

- **Who:** `can.canEdit` (owner, co-owner, creator). That is exactly the set `items.pb.js` accepts `booked` writes from, so the control never shows for a role the server refuses.
- **When:** `needsBooking(item)` (planned, requires booking, not booked). The gold chip stays; the two actions sit beside it in the Hero's status row.
- **Book ↗:** an `<a>` to `reservation_url` (new tab). Omitted when the item has no (http/https) link; Mark booked still shows.
- **Mark booked:** BottomSheet with a `<form method=POST action="?/markBooked" use:enhance>`: optional confirmation code, "Log what I paid next" checkbox. Form action, not fetch (CLAUDE.md).
- **Action `markBooked`:** sets `booked: true, booked_by: membership.id` via the user's pb (hook enforces role). A non-empty code creates a `kind: 'code'` Document (ADR-0016), same path the edit form uses. Booked and paid stay separate: the item write never touches expenses (ADR-0014).
- **Prefilled Add expense:** when ticked, the action redirects (303) to the existing `logPaymentHref` (`/expenses?action=add&amount=<estimate>&description&linked_item`). Payer = current member and the usual split are the form's own defaults. Nothing new on the expenses side.
- **Pure rules** in `item-page.ts`: `bookingControls`, `parseMarkBooked`, `markBookedDestination`. Vitest first.

## Steps

1. Tests red, implement the three pure functions.
2. `MarkBookedSheet.svelte`; item page wiring in the Hero `children` slot; `markBooked` action.
3. E2E `item-mark-booked.spec.ts`: owner marks booked with a code + ticked box, lands on prefilled Add expense; traveler non-creator sees no controls; unticked stays on the item page.
4. Amend `docs/CARD_CONTENT_SPEC.md` §3. Screenshots 375/768.
