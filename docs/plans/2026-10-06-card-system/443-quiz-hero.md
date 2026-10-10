# #443 Swipe-Quiz face is a Hero (closes #405)

Intent: spec stories 74, 75; CARD_SYSTEM D11. Face = Hero (icon + Fraunces title, place · cost, date/time or `Unplanned`, description), then `Added by <name>` on its own line; deck footer = divider + centred `Others' votes hidden until you vote`. No Details tap, no Planned/Idea pill. Planned items stay.

Tasks
1. `+page.server.ts`: `initialByUser` (initial) -> `nameByUser` (display name); `dayLabel` -> `dayDate` (day id -> calendar date) so the face can use `formatTimeText(item, {date})`. Only this page uses either.
2. `Hero.svelte` (additive): `placeExtra` prop (the `· $40` cost) shown on the place line; `bare` prop drops the Hero's own border/shadow/padding so it sits inside the deck card without a card-in-card.
3. Swipe page face: Hero with `placeLink={false}`, `showGoing={false}`, `timeText` or `Unplanned`, children = description + Added by. Drop `detail` snippet (removes the Details tap in SwipeDeck; its footer renders it only when `detail` is passed).
4. `SwipeDeck.svelte` footer: solid divider, centred, `Others' votes hidden until you vote` (peek state keeps the stacks, centred). Shared with goals capture: same wording applies there.
5. `docs/CARD_CONTENT_SPEC.md`: add Swipe-Quiz section.
6. Verify: check, unit, grep tests, verify:visual of the swipe route, e2e clean.
