# ADR-0027: An offline Outbox (IndexedDB) for three writes, replayed as the same form actions

**Status:** Accepted (Scott, 2026-11-15)
**Date:** 2026-11-15
**Deciders:** Scott
**Amends:** ADR-0010 (offline = SW-cached SSR, read-only)
**Context:** #586; grill record `docs/plans/2026-11-15-offline-outbox/grill.md`. Lie-fi detection (#533) and the snapshot-time banner (#534) shipped.

## Decision

Offline **reads** stay as ADR-0010 defines them. Offline **writes** gain a narrow [[Outbox]]: an IndexedDB store on the device that holds three kinds of [[Saved Change]]: a new Expense, a Memory (thought and photo), and a Task tick. Every other mutation keeps the "You're offline" toast.

1. **Replay is the same SvelteKit form action.** A Saved Change stores the form submission (fields plus the photo file) and re-POSTs it to the action it came from. Server validation, PB rules and hooks apply unchanged. There are no new write endpoints.
2. **Every replay is idempotent.** An Expense carries a client-generated record id, and "id already exists" on replay counts as synced. A Memory is already an upsert on (day, author). A Task tick sends the target state, not a flip. Repeated changes to the same Memory or Task collapse into the latest.
3. **Last write wins; there is no merge.** A rejected replay becomes Failed, with its reason, Retry and Discard. Nothing is dropped automatically.
4. **Replay runs only while the app is open** (iOS has no Background Sync): on launch, on `online`, when the app returns to the foreground, and when the SW reports the network is healthy. Changes go one at a time, oldest first.
5. **Lie-fi.** A queueable submit that hasn't answered within about 8 s is aborted and saved to the Outbox. Rule 2 makes it safe if the original request landed.
6. **Auth.** An expired session pauses the Outbox ("Sign in to sync"). It resumes only for the same account. Signing out with Saved Changes warns that they will be deleted.

## Why

- **Expenses and memories are what send a traveller back to Notes.** Being read-only on a plane stopped being enough once logging spend and memories during the trip became the habit.
- **Replaying the form action keeps one write path.** The "forms are SvelteKit actions" rule holds, and the server stays the only place that validates and authorizes.
- **The three writes barely conflict.** An Expense is a create. A Memory has a single author. A tick is a single boolean. Last write wins without a merge UI.

## Considered and rejected

- **Supersede ADR-0010 with an IndexedDB-first data layer.** Rejected for the reasons 0010 gives, which still stand. 0010 anticipated this narrower write need.
- **JSON write endpoints per type.** Rejected: they create a second write path that duplicates action validation.
- **Queueing Item edits and going / not going.** Rejected: Item edits conflict with other members, cascade (re-sorting, planning) and become Suggestions for travelers. Going isn't a no-signal moment.
- **A local draft with a manual "send later".** Cheaper, but it relies on you remembering to send. Rejected.
- **Showing queued expenses and memories inline on cached pages.** Rejected: it means client-side rendering over SSR snapshots on every surface that lists them. Ticks show inline (a local flip). Expenses and memories show only in the Saved changes tray.

## Consequences

- `toggleTask` gains an explicit-state input. The flip path stays for non-queued callers until they move over.
- Balances and expense lists exclude Saved Changes until they sync, and the tray is where you see them.
- Sign-out clears the Outbox along with the caches (ADR-0010's device-scoped posture), after a warning.
- Adding a fourth queueable write means checking it against rules 2 and 3. A write that can't be made idempotent, or that conflicts, doesn't qualify.
