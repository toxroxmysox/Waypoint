# #435 Flight title and place line

Spec: #418, CARD_SYSTEM D2. Scott 2026-10-09 comment on #435 supersedes the AC title wording (see #463).

## Rules
- Default title (lookup writes it): `{number} to {city}` e.g. `UA 1234 to Denver`; no city -> airport code; no number -> `Flight to {city|code}`; neither -> `Flight`.
- Number stored in new `items.flight_number` (text, flights only). Formatted `UA 1234`.
- Place line (Card meta + Row sub-line route part): `MKE -> DEN`. Prefix `{number} · ` only when a number is stored AND the title does not already contain it (spaces/case ignored). So new flights drop it; legacy flights with a stored number keep it. No stored number: route only.
- Existing flights keep titles.

## Tasks
1. Pure module `src/lib/itinerary/flight-place.ts` (+ Vitest): `formatFlightNumber`, `flightTitle`, `flightPlaceLine`. Red-green.
2. Migration `0075_items_flight_number.js` (additive TextField; PB text fields default ''), items.pb.js lockedFields += flight_number.
3. Wire: Item type, ItemFormFields, form hidden input, new/edit actions (flight-only), FlightLookup (number + title + city), edit page initialData, portability export/import.
4. `cardMeta` + `rowContent` call `flightPlaceLine`.
5. Seed (dev-auth flights block): add new-style and legacy-with-number flights. Docs: CARD_CONTENT_SPEC section 4a/4.
6. Verify: check, unit, harness (items role gate), e2e clean, verify:visual 375/768.
