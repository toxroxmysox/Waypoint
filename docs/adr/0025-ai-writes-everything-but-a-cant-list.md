# ADR-0025: A connected AI can change anything the user can, except a short can't-list, through generic record ops

**Status:** Accepted (Scott, 2026-10-11)
**Date:** 2026-10-11
**Deciders:** Scott
**Amends:** ADR-0024 §2 (one AI Access switch), §3 (what the AI may write), §4 (confirmation is in chat)
**Context:** #503 (MCP connector v3.2 writes); grill record `docs/plans/2026-10-11-mcp-writes/grill.md`. ADR-0024 framed writes as transcription of a narrow set of decisions. Scott wants the AI to be an extension of himself: able to do almost everything he can in the app, bounded by a few clear prohibitions rather than an allowlist of actions. #411 moved the trip's invariants (phase tiling, date cascades, cross-trip references, item validity, hidden tokens) into PocketBase hooks, so PB is now the single gate for what a user may write.

## Decision

### 1. Everything the user can do, minus a can't-list
The AI acts as the user with their [[Role]] and may make any change the app lets that user make. It may **not**:
- touch members or invitations (no people data: names, emails, invites)
- change AI settings (it cannot widen its own access)
- write emails, tokens (soft, join, share) or `created_by`/owner fields — `created_by` is **readable** as a name so the AI knows who made what
- delete anything it did not itself create (reverting its own add is the only delete)
- upload files or photos (deferred, not refused on principle)

The ADR-0024 transcription rule stands and extends to votes: the AI **records** a decision or vote the user states; it never chooses or initiates one.

### 2. Generic record ops, gated by PocketBase
Writes are `create` / `update` ops on any collection not on the can't-list, run with the user's own short-lived PB token, so PB rules and the #411 hooks decide exactly as they do for the app. The server adds only: the can't-list (collection + field blocklist) and the app's Suggestion routing (a traveler's item add goes through suggestions, auto-approved or queued per Auto-approve; item edits stay owner/co_owner-only, as in the app). A `describe` tool tells the AI what is writable in plain terms.

### 3. Propose → confirm → commit
`propose_changes` (ops + the user's words stating the decision) returns a preview and a proposal id; `commit_changes(proposal_id)` commits exactly that proposal, all-or-nothing. Proposals live 15 minutes and are refused at commit if any field they touch has changed since the preview. Confirmation is the user's yes in chat **or** a Confirm button on the preview card. The server does not try to prove a human turn happened; the tool contract asks the AI to wait, and Revert is the backstop.

### 4. The preview shows the real outcome, including cascades
One card format: changed fields old → new, the user's words, and the outcome ("Saved" / "Sent to the owners as a suggestion" / "Added as an idea"). Trip-date and phase changes list every cascade (days removed, items re-homed) computed with the app's own tiling logic, optionally as a small calendar. Times show as `9:40 am`; AI ↔ server use ISO dates and 24h times.

### 5. AI changes are the user's, privately audited
No "via Claude" attribution anywhere: the change is the user's. Each committed proposal is recorded as an [[AI Change]] visible only to its author, revertible from chat or a collapsible Recent AI changes section in account settings.

### 6. Two trip switches and a server switch
[[AI Access]] splits into **AI can read** and **AI can make changes** (needs read), both owner/co_owner, both default on. A server env flag turns writes off everywhere; when off, the write tools are not listed.

## Considered and rejected
- **Typed op per action** (`add_item`, `mark_booked`, …; the grill prep's recommendation). Rejected: 30+ ops to keep in step with the app, every new feature needs a new op, and it encodes the "ticky-tacky" allowlist Scott doesn't want.
- **v3.2 = core ops, structural (phases, dates, scenarios, closeout) later.** Rejected once ops went generic: the hooks enforce structure, and cascade previews make it legible.
- **Attribution to other members.** Rejected: the user is making the change; the AI only makes it faster.
- **Per-trip toggle as the only kill switch.** Rejected: it only reaches trips the operator owns; a broken write path needs one server-wide off.
- **Server check that a human turn happened** (min delay, permission-prompt hint). Rejected: hacky or unverifiable; revert covers the miss.

## Consequences
- New app features become AI-writable without connector work, as long as PB rules and hooks enforce them. A rule enforced only in SvelteKit is an AI hole — #411's lesson now applies to every future feature.
- Closeout has no wizard over the connector; it is item status edits.
- Revert of a cascading change is best-effort and says what it couldn't restore.
