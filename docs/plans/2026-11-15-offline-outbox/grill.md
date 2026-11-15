# Offline outbox: grill record

Source: https://github.com/toxroxmysox/Waypoint/issues/586 · Date: 2026-11-15

ADR: [ADR-0027](../../adr/0027-offline-outbox-for-three-writes.md), which amends ADR-0010. Glossary: **Outbox** and **Saved Change** in `CONTEXT.md`. Builds on lie-fi detection (#533, the SW `NETWORK_STATE` signal) and the snapshot-time banner (#534).

## Problem Statement

Offline is read-only. Any mutation made with no signal (or on lie-fi) is blocked with "You're offline, reconnect to make changes". On a live trip, logging an expense or a memory on a plane, a mountain or a ferry is exactly when you have no signal, so the traveller types it into Notes and has to remember to re-enter it later.

## Intent & Success Criteria

You can log an expense, write or update a day's memory (thought and photo), and tick a task with no signal. The app tells you it's saved on this phone, and it syncs without you doing anything once signal returns. Nothing is ever dropped silently.

- Offline, saving a new expense, a memory, or a task tick succeeds locally. The offline banner shows "· N saved changes", and a task tick shows as checked immediately.
- Back online with the app open, every Saved Change syncs once. No duplicate expense appears, even when the original request landed during lie-fi.
- A submit that hangs on lie-fi for about 8 s becomes a Saved Change instead of a stuck form.
- A change the server rejects stays visible as Failed, with its reason and Retry / Discard. It is never removed without the member choosing to.
- Every other mutation still shows the offline toast.
- Scott has swept the banner, tray (Saved / Syncing / Failed) and sign-out warning at 375 and 457.

## User Stories

1. As a traveler with no signal, I want to log an expense, so that I don't park it in Notes.
2. As a traveler with no signal, I want to save my day's memory thought and photo, so that I capture it in the moment.
3. As a traveler with no signal, I want to tick a task on a list, so that the list matches reality (packing at the gate).
4. As a traveler, I want a ticked task to look checked right away while offline, so that the list is usable.
5. As a traveler, I want the offline banner to show how many saved changes are waiting, so that I know they're kept.
6. As a traveler, I want to tap that count and see a simple tray of my saved changes, each as a one-line summary ("€14 Taxi · you paid · split 4", "Day 3 memory · photo + thought", "Packing · Passport ✓"), so that I can confirm what's there.
7. As a traveler, I want saved changes to sync on their own when I'm back online with the app open, so that I don't have to do anything.
8. As a traveler, I want to see "Syncing N saved changes…" and then "N saved changes synced", so that I know they landed.
9. As a traveler on lie-fi, I want a save that hangs to become a saved change after a few seconds, so that I'm not stuck staring at a spinner.
10. As a traveler, I want a sync that lands twice (lie-fi) to produce one expense, so that the money isn't double-counted.
11. As a traveler, I want a change the server rejects to stay in the tray as Failed with the reason, and Retry and Discard, so that nothing disappears without my say.
12. As a traveler whose session expired, I want to be told "Sign in to sync N saved changes" and have them sync after I sign in, so that an expired session doesn't lose them.
13. As a member signing out with saved changes, I want a warning that signing out deletes them, so that I don't lose them by accident.
14. As a traveler who edits the same day's memory twice offline, or taps the same task several times, I want only the latest to sync, so that the server ends in the state I left it.
15. As a traveler offline, I want edits other than these three to keep showing the offline toast, so that I'm never told something is saved when it isn't.

## Decisions

- **Scope: three writes.** A new Expense, a Memory (thought and photo, in full), and a Task tick on any surface that ticks one. Item edits and going / not going are out (ADR-0027, "Considered and rejected").
- **ADR-0027 amends ADR-0010.** Reads remain SW-cached SSR. The Outbox is a separate, narrow IndexedDB store.
- **Replay = the same SvelteKit form action.** Store the form submission (fields plus the photo file) and re-POST it. There are no new write endpoints, and server validation and PB rules apply unchanged.
- **Queueable forms opt in.** Every other POST keeps the existing write-guard toast.
- **Idempotency.** An Expense gets a client-generated record id, and "already exists" on replay counts as synced. A Memory upserts on (day, author). A Task tick sends the target `checked` state, and the tick action gains an explicit-state input (the flip stays for callers that aren't queued).
- **Coalescing.** Saved Changes to the same Memory (day) or the same Task collapse into the latest. Expenses never collapse.
- **Conflicts: last write wins at replay, no merge UI.** A rejection (validation, deleted list or task, changed role) makes the change Failed.
- **Replay triggers:** app launch, `online`, the app returning to the foreground, and the SW reporting the network healthy (`NETWORK_STATE degraded:false`). Changes replay one at a time, oldest first. Nothing runs while the app is closed.
- **Lie-fi:** a queueable submit with no response after about 8 s is aborted and saved.
- **Display: ticks inline, everything else in the tray.** A queued tick shows checked on the page. Queued expenses and memories appear only in the tray, and balances and lists exclude them until they sync.
- **Tray: simple.** A bottom sheet opened from the banner count, titled "Saved changes", subtitled that they're on this phone and sync when you're back online. One-line summary per change, with its state (Saved / Syncing / Failed). Failed rows show the reason plus Retry / Discard. Nothing more (no editing a saved change, no reordering).
- **Copy uses "saved" and "sync", never "send" or "queue".** Banner: "· N saved changes". Online with changes still saved: "Syncing N saved changes…", then a toast "N saved changes synced". Expired session: "Sign in to sync N saved changes". Sign-out: "N saved changes haven't synced. Signing out deletes them."
- **Auth.** An expired session pauses the Outbox, and it resumes after the same account signs in. Each Saved Change records which account made it, and changes from another account never replay.
- **Sign-out** clears the Outbox along with the caches, after the warning.
- **Photos** are stored after the existing EXIF strip, with no extra compression. The server limit (20 MB) applies at replay.

## Testing Decisions

- **Vitest at the Outbox module seam** (pure state, with an in-memory store standing in for IndexedDB): FIFO order; coalescing per Memory day and per Task; Expenses don't coalesce; state transitions Saved → Syncing → synced or Failed; "already exists" counts as synced; a different account's changes are held; nothing leaves the store except a sync or a Discard. Prior art: `src/lib/offline/sw-runtime.test.ts`, `snapshot-time.test.ts`.
- **Vitest on the tick action's explicit-state path:** sending `checked: true` twice leaves it checked.
- **Playwright, extending `tests/e2e/offline-read.spec.ts`:** go offline, add an expense, tick a task, save a memory thought, and check the banner count and the inline tick. Go online, then check each record exists exactly once on the server and the count clears. Lie-fi case: hold the POST past the timeout and then let it land; exactly one expense exists afterwards. Failed case: delete the task server-side while offline; the tick shows Failed with Retry / Discard. Non-queueable form while offline: the toast still appears.
- Visual: `pnpm verify:visual` can't reach offline states, so the sweep uses Playwright screenshots from the offline spec at 375 and 457.

## Out of Scope

- Item edits of any kind, going / not going, expense edits, settlements, adding or deleting tasks, comments, votes.
- Background sync while the app is closed (iOS has no API for it).
- Showing queued expenses or memories inline on pages, or counting them in balances before they sync.
- A merge or conflict UI.
- Editing or reordering a Saved Change in the tray.
- Multi-device reconciliation beyond last write wins.

## Assumptions & Open Questions

- Assumed: re-POSTing a stored submission to a SvelteKit action from client code (with the action header and the auth cookie) behaves the same as the original enhanced submit, including redirect-to-login when the session has expired. The plan should verify this first.
- Assumed: PB accepts a client-supplied 15-char id on `expenses` create under the current rules and hooks, and reports a distinguishable error when the id exists. The plan should verify this.
- Assumed: IndexedDB in an iOS Home Screen PWA keeps a handful of photos (a few MB each) across launches without eviction.
