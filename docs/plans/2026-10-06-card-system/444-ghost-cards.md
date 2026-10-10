# #444 Ghost Cards and Suggestions: the pending idea card

Spec stories 76-79. Branch `feat/444-ghost-cards`. Route: plan.

## Decisions

- **One card.** `GhostCard.svelte` becomes the pending idea card: `Card` shell with a dashed border, title, `ideaSub` sub-line, a gold `Pending` chip (`Pill variant="pending"`), `VotePills` (replaces the forked optimistic vote logic), "Suggested by X", and a tray. No role badge anywhere.
- **Two hosts, one component.** Phase Detail passes `review="ghost"` (tray: Approve / Reject). Inbox passes `review="inbox"` (tray: Approve / Edit / Reject). Edit is a link to `/items/new?suggestion=<id>`.
- **Vote/review form actions.** The component takes `actionBase` so the same markup posts to the phase page (`?/voteGhost`, `?/approveGhost`, `?/rejectGhost`) or the Inbox (`?/voteGhost`, `?/unvoteGhost`, `?/approve`, `?/reject`).
- **Edit view actions: Reject / Save / Approve.** `items/new?suggestion=` shows three buttons in the SaveBar area. Save posts `?/saveSuggestion` -> `POST /api/suggestions/update`, stays on the edit view with a toast. Approve is the existing `approve` path. Reject needs the one-line note: a required note field on the edit view posts `?/rejectSuggestion` -> review reject.
- **Backend.** `POST /api/suggestions/update {suggestion_id, payload}`: owner/co_owner only, pending only, replaces payload, no status change, no notification. The hook route is the guard (the collection's updateRule is null, so direct PB writes are superuser only). Harness §15.
- **Carried #402 finding.** Edit & Approve dropped the author's `not_going` (the form has no Going control, so the edited payload omits it). Fixed in the hook: an edit that omits `not_going` falls back to the stored one, for both approve and Save. Harness proves it red then green.
- **Inbox Approved/Rejected tabs** keep their summary cards (they are history, not pending).

## Tests

- Harness `suggestions` §15 (done, red then green).
- E2E: extend `contribution-inbox` (Pending chip, Approve / Edit / Reject tray, no role badge, vote pills), `contribution-approve` (Edit -> Save stays pending -> Approve; edit view shows Reject / Save / Approve), `contribution-reject` (reject from the edit view needs a note).
- `pnpm verify:visual` at 375 / 768 for the phase page and the Inbox.
- Docs: `docs/CARD_CONTENT_SPEC.md` pending-idea-card section.
