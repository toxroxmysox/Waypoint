# Starter-prompt template

One brief per issue. Two delivery modes, same core:

- **Agent dispatch (AFK small/medium):** the filled template becomes the Agent prompt. Use worktree isolation. Results return in-session — skip the handoff file AND the GitHub PR; the agent **commits each issue separately** to its worktree branch (per-issue commits are the recovery unit — they survive host-sleep / agent-death mid-run), and the PM integrates from those commits.
- **Desktop session (HITL / feature-sized):** hand Scott the filled template as one pasteable block. Nothing else — no preamble he has to trim.

## The template

```
You are implementing Waypoint issue #<N>: <title>.

SCOPE
- <2–4 lines. Acceptance criteria live on the issue and are binding — don't restate, point.>
- Binding contract: <docs/<CONTRACT>.md §refs — these override your judgment | "none">
- Out of scope: <the adjacent thing this issue is NOT>

ENV (a fresh worktree has nothing)
- pnpm install
- Copy .env.local from the main checkout (gitignored — never commit it)
- Copy `.wolf/` in for cerebrum context: `cp -r <main-checkout>/.wolf .wolf` — without it you're blind to the Do-Not-Repeat scars (gitignored, absent from worktrees). Your `.wolf` edits are throwaway; the PM writes canonical `.wolf` at integration.
- Backend via ./backend/start.sh ONLY — never the bare pocketbase binary

GUARDRAILS
- Check .wolf/cerebrum.md Do-Not-Repeat before writing PB hooks/rules/migrations.
- Migration numbers: use <assigned range, e.g. 0047–0049>. Explicit-field collections need created/updated autodate fields.
- Migration-dependent behavior: verify on a FRESH PB — scripts/e2e-clean-pb.sh (:8097), NEVER :8090 (stale schema). :8097 is shared and stompable — make sure no other session is mid-E2E.
- After Svelte changes: pnpm check. New links/buttons: pnpm test:e2e:clean.
- Removing or RENAMING a user-facing label/affordance? `grep -rn '<old text>' tests/` and fix any assertion — renames/removals pass on your branch but go RED at merge (bit #209, #198).
- UI changes: verify mobile-first at 375px.

VERIFY (all green before reporting done)
- pnpm check → 0 errors
- pnpm test:unit
- Backend touched: PUBLIC_PB_URL=http://127.0.0.1:8097 pnpm test:rules — a red cell on a fresh PB is a real regression
- UI touched: screenshots at 375px + desktop, attached to the PR

REPORT BACK
- Desktop session only: write handoff-issue<N>.md in the worktree root (gitignored) — what changed, decisions made, surprises, verification evidence.
- **Commit each issue separately** to the worktree branch (`<type>(#<N>): <summary>`) — these per-issue commits are how the PM recovers if you're interrupted mid-run. **Desktop/HITL only:** also open a PR marked DO NOT MERGE. **PM-spawned background agents: no PR** — leave the commits on the branch; the PM integrates them.
- Don't touch main. Don't merge. Don't close the issue.
```

## Slot guide

- **SCOPE stays thin.** The issue carries criteria; the contract pointer is the intent-fidelity anchor — always include section refs, not just the filename.
- **GUARDRAILS are filtered, not copied.** Include only the ones that apply (no migration range for pure-frontend work). Pull issue-specific scars from cerebrum into the brief — the session won't go looking.
- **Migration ranges:** when 2+ backend slices run concurrently, assign disjoint ranges and record the split in handoff-pm-hub.md.
- **Screenshots are non-negotiable for UI work** — they feed the wave report's visual proof, which is how Scott checks intent.
