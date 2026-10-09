# #440 "Are you going?" (plan)

Spec #418, CARD_SYSTEM D6/D10/D12, ADR-0011. Backend + endpoint are #402; Hero is #428/#438.

## Decisions

- **Fetch to `POST /api/items/{id}/assign-self`, not a form action.** The endpoint is the one writer of the caller's own answer (self-only server-side, same-state no-op). `AssigneeStacks` already used an optimistic fetch against it; the Going answer is a two-tap toggle that must flip instantly in the Hero, so the page mirrors the answer locally (`applyGoing`), then `invalidateAll()`. A form action would round-trip the loader per tap and add nothing the endpoint lacks.
- **Pure rules in `goingView` (item-page.ts) + `goingPeople` (hero.ts) + `applyGoing` (assignment.ts).** Vitest first.
- **Hero stays presentational.** It gets a `goingControl` snippet; the item page mounts `GoingAnswer`. Hero lists people (going, then struck not-going) from `item.assigned_to` / `item.not_going` wherever it is used (Now too).
- **"+ Me" retired.** `AssigneeStacks` becomes display-only (the `strip` variant, neutral + struck bubbles); the legacy variant and the self-assign button in `AssigneeViewSheet` go. `IdeaCard` moves to `strip`.
- **Gate:** controls need a non-viewer role, a membership id, and more than one active member (ADR-0011 solo-trip rule).
- "Change" reveals Going / Not going; no "clear answer" control (not in the criteria; the endpoint still supports `no_answer`).

## Steps

1. Tests red: `goingPeople`, `goingView`, `applyGoing`. Implement.
2. `GoingAnswer.svelte`; Hero going row; item page wiring.
3. `AssigneeStacks`/`AssigneeViewSheet` display-only; `IdeaCard` strip + `not_going`.
4. E2E `item-going.spec.ts`: Going -> change to Not going -> day page shows struck bubble, no "+ Me"; viewer has no controls.
5. Amend `docs/CARD_CONTENT_SPEC.md`. Screenshots 375/768.
