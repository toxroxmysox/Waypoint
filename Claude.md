# OpenWolf

@.wolf/OPENWOLF.md

This project uses OpenWolf for context management. Read and follow .wolf/OPENWOLF.md every session. Check .wolf/cerebrum.md before generating code. Check .wolf/anatomy.md before reading files.

# Waypoint — Project Instructions

Be as concise as possible. Sacrifice grammar for concision.

---

## Scope discipline

Work that spans sessions or needs a plan should trace to a GitHub Issue.
Small, self-contained fixes (single-session, no plan needed) — just do them.

"Let's just..." on anything non-trivial is a scope-creep trigger. Interrogate:
- Is this a quick fix or a rabbit hole?
- If it needs a plan, create an issue first.

---

## Workflow

Issue-driven development. Label reference: `docs/agents/triage-labels.md`

Ceremony by type:
- **bug**: fix → PR → review
- **enhancement**: plan optional → PR → review
- **feature**: grill → plan → subagent execution → PR → review
- **research**: output = decision or ADR, no PR expected
- **refactor**: plan → PR → review

Issues labeled `afk` can run unsupervised. `hitl` needs human checkpoints.

Session scope: one issue or one PR. If a task needs both planning and execution, split into separate sessions.

---

## Tech stack

Defined in `docs/SPEC.md` §2. Alternatives require clear rationale — don't suggest them casually, but surface them when the current tool genuinely can't do the job.

Auth = email + 6-digit code. No passwords, no magic links, no OAuth.

---

## PocketBase

Migrations: never delete, only append. Hooks run in isolated sandboxes — inline all helpers into callback body.
Permissions: PB rules first, server hooks for complex logic only. No realtime subscriptions.

---

## Frontend patterns

Forms: SvelteKit form actions + progressive enhancement, not client-side fetch.
Loading: skeleton UI (not spinners) where layout is known.
Errors: in-context messages for validation, toasts for transient confirmations.
Modals: bottom sheets on mobile, centered modals on tablet+.

---

## Testing

Vitest for algorithmic logic, Playwright for critical-path E2E. Don't test trivial CRUD.

---

## Off the table

Multi-currency, push notifications, embedded maps, real-time co-editing, native apps, AI-generated itineraries.

---

## Dev environment

`pnpm dev` (frontend) + `./backend/start.sh` (PB — never run pocketbase binary directly, it skips env vars).
Deploys via GitHub Actions on push to main. Config in `deploy/`.

---

## Session start

```
git status && git log --oneline -5 && pnpm check
```

After Svelte changes: `pnpm check`. After DOM changes that add links/buttons: `pnpm test:e2e`.

---

## Visual verification

Use preview tools after any UI/layout change. Always verify at mobile (375px).
Critical: `vite.config.ts` must honor `PORT` env var or preview binds to wrong port.

---

## Gotchas

Before generating PB/Svelte/API code: check `.wolf/cerebrum.md` for known pitfalls.
After fixing any unexpected bug: append to cerebrum's Do-Not-Repeat section.
