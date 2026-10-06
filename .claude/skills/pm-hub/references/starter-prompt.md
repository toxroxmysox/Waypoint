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
- Intent sources: <spec path in docs/plans/<effort>/, decision log §refs, CONTEXT.md, ADRs>

PROCESS (svw; load each skill by name with the Skill tool)
- <bug: svw:diagnosing-bugs | slice: svw:writing-plans → save the plan at docs/plans/<effort>/<N>-<slug>.md, commit it, then svw:executing-plans | trivial: just do it>
- svw:test-driven-development on every behavior change. Red-green covers derivations, hooks/rules (harness cases) and any critical-path E2E the issue names. Pure layout is proven by `pnpm verify:visual` screenshots, never by markup/class assertions (CLAUDE.md Testing).
- Execution method and plan review are pre-answered: you execute inline; the PM reviews. Don't stop to ask Scott.
- Never dispatch subagents or reviewers. When you report, the PM runs svw's code + intent review and sends findings back to you for one fix pass.
- svw:verification-before-completion before you report done.

ENV (a fresh worktree has nothing)
- pnpm install
- Copy .env.local from the main checkout WITHOUT the mail keys: `grep -vE '^(RESEND_|SMTP_)' <main>/.env.local > .env.local` (gitignored — never commit it). The real file holds a live Resend key; harnesses source it and would send real email.
- Copy `backend/pocketbase` in from the main checkout — **the binary is gitignored, so NO worktree ever has it**, and without it every PB-backed check (e2e, `verify:visual`, the probe) dies with `pocketbase exited (1)` after a 45s timeout that looks like a port problem. Bit wave 3.
- Copy `.wolf/` in for cerebrum context: `cp -r <main-checkout>/.wolf .wolf` — without it you're blind to the Do-Not-Repeat scars (gitignored, absent from worktrees). Your `.wolf` edits are throwaway; the PM writes canonical `.wolf` at integration.
- Backend via ./backend/start.sh ONLY — never the bare pocketbase binary

GUARDRAILS
- Check .wolf/cerebrum.md Do-Not-Repeat before writing PB hooks/rules/migrations.
- Migration numbers: use <assigned range, e.g. 0047–0049>. Explicit-field collections need created/updated autodate fields.
- Your E2E slot: `export E2E_SLOT=<assigned, e.g. 1>` before ANY verification. It shifts your e2e PB (:8097+N), preview (:4173+N), harness PB and `verify:visual` stack (:5199+N) and their data dirs, so sessions on different slots verify concurrently (#384). Slot 0 is the main checkout's.
- Migration-dependent behavior: verify on a FRESH PB — `pnpm test:e2e:clean` / scripts/backend-harnesses.sh (your slot), NEVER :8090 (stale schema).
- After Svelte changes: pnpm check. New links/buttons: pnpm test:e2e:clean.
- Removing/RENAMING a user-facing label/affordance OR changing/redirecting a ROUTE? `grep -rn '<old text or route>' tests/` across **ALL** specs (not just the one you wrote) and fix every assertion — renames/removals/route-changes pass on your branch but go RED at merge (bit #209, #198, #244 `/today`→`/now` broke a sibling spec the agent didn't author).
- UI changes: verify mobile-first at 375px.

VERIFY (all green before reporting done)
- pnpm check → 0 errors
- pnpm test:unit
- Backend touched: `bash scripts/backend-harnesses.sh` (fresh PB per harness, on your slot) — a red cell on a fresh PB is a real regression
- UI touched: screenshots at 375px + desktop, attached to the PR

REPORT BACK
- Desktop session only: write handoff-issue<N>.md in the worktree root (gitignored) — what changed, decisions made, surprises, verification evidence.
- **Commit each issue separately** to the worktree branch (`<type>(#<N>): <summary>`) — these per-issue commits are how the PM recovers if you're interrupted mid-run. **Desktop/HITL only:** also open a PR marked DO NOT MERGE. **PM-spawned background agents: no PR** — leave the commits on the branch; the PM integrates them. **Exception: a ticket that names an integration branch** — push and open the PR against it (`svw:pr` body; `Refs #<N>`, not `Closes`, since merges to a non-default branch don't close issues).
- Final message: status, branch + PR URL, one-line test evidence, screenshot paths, then "Rulings I made" (every `Ruling:` from your ledger, each with its cost if wrong) and "Deferred minors". Both lists exhaustive.
- Don't touch main. Don't merge. Don't close the issue. Don't create issues.
```

## Slot guide

- **SCOPE stays thin.** The issue carries criteria; the contract pointer is the intent-fidelity anchor — always include section refs, not just the filename.
- **GUARDRAILS are filtered, not copied.** Include only the ones that apply (no migration range for pure-frontend work). Pull issue-specific scars from cerebrum into the brief — the session won't go looking.
- **Migration ranges:** when 2+ backend slices run concurrently, assign disjoint ranges and record the split in handoff-pm-hub.md.
- **Screenshots are non-negotiable for UI work** — they feed the wave report's visual proof, which is how Scott checks intent.
