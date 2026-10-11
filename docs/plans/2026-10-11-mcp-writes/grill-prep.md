# MCP connector v3.2 (writes): grill prep

Not a grill record. The open questions for Scott's grill of [toxroxmysox/Waypoint#503](https://github.com/toxroxmysox/Waypoint/issues/503), each with a recommended answer, so the grill can confirm or overturn instead of starting cold. Already settled in ADR-0024 §3–4 and not re-asked: the AI acts as the user with their Role; records only decisions the user states; chat-confirmed preview → commit; audit log + Revert; kill switch; no delete tools.

Prerequisite in flight: [toxroxmysox/Waypoint#411](https://github.com/toxroxmysox/Waypoint/issues/411), plan `docs/plans/2026-10-11-pb-hardening/plan.md`. Gate: v3.1 dogfooded first (grill.md: "Writes start after reads are dogfooded").

## Questions

1. **Op vocabulary vs #413's importer.** *Recommend:* one server-side `propose_changes` / `commit_changes` pair whose payload is a list of typed ops (`add_item`, `edit_item`, `mark_booked`, `add_code`, `add_expense`, `add_idea`, `add_goal`, `add_task`, `check_task`, `add_day_note`), and #413's partial import compiles a file into the same op list. One validator, one preview, one commit path. Alternative: one tool per op (simpler for Claude to call, more surface).
2. **Preview → commit binding.** *Recommend:* `propose_changes` stores the op list server-side for 15 minutes and returns a `proposal_id` + the card preview; `commit_changes({ proposal_id })` commits exactly that, no new args. Stops Claude committing something other than what the user saw.
3. **Traveler editing someone else's item.** ADR-0024 §1 says it becomes a Suggestion. *Recommend:* the preview card says "Sent to the owners as a suggestion" so the yes is informed; commit creates the suggestion through `/api/suggestions/create`.
4. **Where Recent AI changes → Revert lives.** *Recommend:* trip Activity/bell area for the trip ("Recent AI changes", last 30 days), plus a row per Connection in Account → Connected apps. Revert = inverse ops from the audit row; only the author of the change or an owner can revert; a revert of an item someone has since edited asks first.
5. **Audit log shape.** *Recommend:* new `ai_changes` collection: `trip`, `member`, `connection`, `ops` (json, before/after per field), `created`, `reverted_at`. Read by trip members (it's their trip's history), no email fields.
6. **Kill switch.** *Recommend:* env `MCP_WRITES=off` (server-wide, Scott flips it on basecamp) and the existing per-trip AI Access stays read+write together. Not a per-trip "read-only AI" toggle unless dogfooding asks for one.
7. **What "explicitly stated" means in the tool contract.** *Recommend:* every write op carries `quote`, the user's words that state the decision; stored in the audit row; the preview shows it. Makes "never infers" checkable after the fact.
8. **Money writes.** Expenses with splits are the riskiest op (wrong split = wrong balances). *Recommend:* in v3.2 only `split_mode: equal` among named members; custom splits stay in the app.
9. **Dates and times from chat.** *Recommend:* ops take trip-local `YYYY-MM-DD` + `HH:MM`; the server resolves day ids and refuses dates outside the trip with a note.
10. **Out of scope for v3.2.** *Recommend:* deletes, phase edits (tiling), member/invite changes, AI Access changes, votes, memories, documents with files.

## Evidence to bring from dogfooding v3.1

- Which questions Scott and Abby actually asked; which answers were wrong or slow.
- Whether "Always allow" stuck on iPhone, and how cards rendered.
- Any write-shaped request that came up naturally ("mark the train booked") — that list is the v3.2 op vocabulary.
