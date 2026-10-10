# #428 Now Hero Implementation Plan

> **For agentic workers:** Use svw:executing-plans. Steps use checkbox syntax.

**Goal:** One reusable Hero component, adopted on Now's mid-event Focus only.

**Architecture:** Pure derivations in `src/lib/trip-mode/hero.ts` (status line, going names, Maps URL). `Hero.svelte` is presentational: props in, snippets for the `⋯` menu and extra body. `CodeRow.svelte` is the large tap-to-copy row. Now wires `ItemActionsMenu` + `ItemActionSheets` (#437) into the Hero's `menu` snippet; no new role logic.

**Tech Stack:** SvelteKit 5, Tailwind tokens, Vitest, Playwright.

**Spec:** `docs/plans/2026-10-06-card-system/spec.md` (#418, stories 36-38, 49), `docs/CARD_SYSTEM.md` D10/D11.

**Intent sources:** ADR-0016 (codes are documents), ADR-0011 (Going). Glossary `CONTEXT.md`.

**Run:** `E2E_SLOT=1 pnpm verify:visual` with `VISUAL_SEED='{"now":"hero"}'`, route `/trips/{slug}/now`.

## Global Constraints

- Time grammar: `4:00p` (`formatClock`); countdown `formatCountdown`.
- Status line: `NOW · until 4:00p · 55m left`.
- Hero is the only accent on Now: clay border, filled icon, `NOW`. Next card in Coming up loses its accent (D10).
- 44px hit areas; text >= 4.5:1.
- Several Heroes / start-only `since` feed rules belong to #429; not built here.

## Review Focus

- Item ends exactly now: not mid-event (end exclusive).
- Under a minute left: `< 1m left`.
- Hero with no place / no codes / nobody going / not booked: those rows are simply absent.
- Viewer / traveler: no `⋯`.
- Clipboard refused: toast fallback.

### Task 1: Pure derivations
**Files:** Create `src/lib/trip-mode/hero.ts`, `hero.test.ts`.
**Produces:** `heroStatus(item, now): { label: 'NOW'; text: string } | null` (`until 4:00p · 55m left`; null when no end or not ongoing); `goingNames(item, members): {memberId, name}[]`; `mapsUrl(item): string`.
- [ ] Red tests: status line values (55m, 1h 5m, <1m, end==now => null, no end => null, before start => null); goingNames order + tombstone dropped; mapsUrl precedence place_id > coords > address > ''.
- [ ] Implement; tests green; commit.

### Task 2: Components
**Files:** Create `src/lib/documents/components/CodeRow.svelte`, `src/lib/itinerary/components/Hero.svelte`; modify `ItemActionSheets.svelte` (optional `onskipped`).
**Produces:** Hero props: `item`, `members`, `status?: {label,text}|null` (live styling), `timeText?`, `typeLine?`, `codes`, `href?`, `showMaps?`, `menu?: Snippet`, `children?: Snippet`.
- [ ] Build; `pnpm check`.

### Task 3: Adopt on Now
**Files:** Modify Now `+page.svelte`, `+page.server.ts` (none needed unless data missing), `TripModeCard.svelte` (drop isNext accent), e2e regex in `trip-mode-views.spec.ts`; dev seed flag `now` in `backend/pb_hooks/dev-auth.pb.js`.
- [ ] Wire; add e2e `trip-mode-hero.spec.ts` (copy code, Skip from Hero, no `⋯` for traveler is covered by permissions unit).

### Task 4: Docs + proof
- [ ] CARD_CONTENT_SPEC Now section; screenshots 375/768 (hero + no-hero); `pnpm check`, unit, `E2E_SLOT=1 pnpm test:e2e:clean`; PR.
