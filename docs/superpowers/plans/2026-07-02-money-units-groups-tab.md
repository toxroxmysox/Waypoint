# Plan — Money Units → first-class "Groups" sub-tab (#332)

**Issue:** #332 · **ADR:** ADR-0015 · **Base already shipped:** #230 (`28f5d8f`)
**Ceremony:** feature → plan (this) → build → PR → review · **hitl** (UX + one naming/permission decision)
**Planned with:** ui-ux-pro-max (UX rules) + Waypoint design system.

## TL;DR — this is mostly a UI relocation, not new plumbing

The settle-up collapse, per-unit budgets, and the whole permission model already ship and work:
- `saveMoneyUnit` (expenses `+page.server.ts`) **already supports edit** — `unit_id` present → `update`, absent → `create`.
- `money_units.pb.js` **already implements the exact leave/edit/delete gate**: owner/co-owner OR an existing member of the unit. "Leaving is just an `update` that drops yourself from `members`." Non-members can't self-add.
- `MoneyUnitsManager.svelte` already renders the list + create + delete, and `SettleUpFlow` already renders unit labels.

So #332 = **give it a discoverable home (a Groups sub-tab), surface the edit + leave affordances that already work underneath, add a teaching empty state, and remove the buried Expenses bottom-sheet row.** Backend delta is small (a `leaveMoneyUnit` action + a dissolve-below-2 rule).

## Design system (fixed — Waypoint, do NOT introduce new tokens/styles)

- Tokens: `paper / surface / surface-2 / ink / ink-soft / ink-muted / line`; accent **moss** (planning mode), destructive **clay / error**. Fonts Inter (sans), Fraunces (display), JetBrains Mono (numbers).
- Reuse components: `SubTabs`, `Card`, `Button`, `BottomSheet` (bottom sheet ≤900px, centered modal ≥tablet), `toast`. No new UI primitives.
- Mobile-first 375px; numbers in `font-mono` (tabular); confirm pattern mirrors the recent phases-page inline delete-confirm (`trips/[slug]/phases/+page.svelte`) — no new dialog primitive.

## 1. Nav + route

- **New route** `src/routes/(app)/trips/[slug]/groups/+page.{server.ts,svelte}`.
- **SubTabs** gains a third entry on ALL three money pages (expenses, budget, groups):
  `{ id: 'groups', label: 'Groups', href: \`/trips/${slug}/groups\` }`.
  The tabs array is currently duplicated in `expenses/+page.svelte` and `budget/+page.svelte`. **Extract `moneyTabs(slug)` into a small shared helper** (`src/lib/money/money-tabs.ts`) and use it in all three — prevents the drift that would otherwise show 2 tabs on one page and 3 on another. (`nav-state-active`: SubTabs already highlights the current tab by `id`.)
- Deep-link: `/trips/[slug]/groups` loads directly (`deep-linking`).

## 2. Server load (`groups/+page.server.ts`)

Mirror the expenses load's money-unit fetch:
- `trip` (by slug), `membership` (caller's active `trip_members`), `members` (active only — `removed_at = ""`), `moneyUnits` (`money_units` where `trip = t.id`, sort `created`; `.catch(() => [])`).
- Return `{ trip, membership, members, moneyUnits }`.

## 3. Screen states (mobile-first)

### a. List (has units)
- Header: title **Groups** + one-line explainer (`--ink-soft`, Fraunces italic ok):
  *"Group people who share a card. Settle-up nets across the group — splits never change."*
- Each unit = a `Card`:
  - Label: `unitLabel` = members joined `" & "`, self shown as **You** (existing `memberName` logic). e.g. "You & Abby".
  - Sub-line (`--ink-muted`, 12px): budget — `Even-share budget` OR `$X.XX budget (custom)`.
  - Member chips/avatars row (reuse existing avatar rendering if cheap; else names).
  - **Actions** (overflow or inline, right-aligned): `Edit` · (`Leave` if caller ∈ members) · `Delete`. Destructive items use `--clay/--error` and sit visually separated from Edit (`destructive-emphasis`, `destructive-nav-separation`).
- Primary action: **New group** button (top-right of header, or FAB consistent with expenses' `FAB`). One primary CTA per screen (`primary-action`).

### b. Empty state (no units) — teaching, per `empty-states`
- Centered: coin/people icon, `No groups yet.` (Fraunces italic like the expenses empty state), then a teaching line + concrete example:
  *"If two of you share a card, group them — one payment settles you both, instead of settling every pair."*
- Primary **New group** button below.

### c. Create / Edit sheet (`BottomSheet`, title "New group" / "Edit group")
- Reuses the current `MoneyUnitsManager` form, relocated:
  - **Members** — checkbox list of active members (labels via `memberName`, `form-labels`); show `(in another unit)` hint on already-assigned members (existing behavior). Seed the creator checked on create; prefill actual members on edit.
  - **Custom budget (optional)** — `type=number step=0.01 min=0`, labeled, helper: *"Absolute target — doesn't change the group budget or other units."* (`input-helper-text`, `input-type-keyboard`).
  - Submit → progressive-enhancement `?/saveMoneyUnit` (create or edit via hidden `unit_id`); loading state on the button (`loading-buttons`, `submit-feedback`); success toast "Group saved" + close sheet (`success-feedback`).
- Validation: ≥1 member (existing); inline error via `role="alert"` (`aria-live-errors`).

### d. Leave confirm (inline, mirrors phases delete-confirm)
- Trigger `Leave` → inline confirm: *"Leave this group? The others stay grouped."* → confirm posts `?/leaveMoneyUnit` (see §4). Success toast "You left the group".

### e. Delete confirm (inline)
- Trigger `Delete` → inline confirm, stronger copy: *"Delete this group for everyone? This can't be undone."* → `?/deleteMoneyUnit`. Success toast "Group deleted" (`confirmation-dialogs`, `undo-support` optional via toast).

## 4. Backend deltas (small)

Move the three actions to `groups/+page.server.ts` (and delete them from `expenses/+page.server.ts`):
- `saveMoneyUnit` — **unchanged** (already create/edit).
- `deleteMoneyUnit` — unchanged.
- **New `leaveMoneyUnit`** — read the unit, drop the caller's `membership.id` from `members`:
  - if remaining `members.length >= 2` → `update` (self-removal; hook allows — caller was in the original members).
  - if remaining `members.length < 2` → `delete` the unit (a unit of one is meaningless; a lone member isn't a "shared card"). **Dissolve-below-2 rule** — apply the same guard in `saveMoneyUnit` edit (editing down to 1 member deletes).
- Hook `money_units.pb.js` — **no change** (leave/edit/delete already gated correctly).

## 5. Remove the old surface

- Delete the "Money units / Group shared cards" bordered row + its `showMoneyUnits` `BottomSheet` from `expenses/+page.svelte`.
- Relocate `MoneyUnitsManager.svelte` logic into the groups page (or keep the component, render it on the groups route). Remove now-unused `moneyUnits` prop plumbing from the expenses page IF settle-up no longer needs it — **keep** the expenses load's `moneyUnits` fetch (SettleUpFlow's `unitLabelFor`/`unitDebts` still need it). Only the management UI moves.
- `grep -rn "Money units" src/ tests/` and fix any e2e asserting the old row (renamed/removed labels go RED at merge — bit #209/#198 pattern).

## 6. SPEC reconciliation (bake into the slice)

- §1/§2 navigation: document the money area as **Expenses · Budget · Groups** (add Groups).
- Money section: document the money-unit lifecycle — create / edit / **leave** (self-removal, consent valve) / delete (whole unit) — and that Groups is its home. Note the dissolve-below-2 rule.

## 7. Decisions (RESOLVED — Scott, 2026-07-02)

1. **Tab label = `Groups`.** (Domain term "Money unit" stays in code/docs/ADR.)
2. **Delete rights = any unit member OR owner/co-owner** — keep current `money_units.pb.js` gate, **no hook change**. Leave is the everyday consent valve; Delete stays available to any member.
3. **Dissolve-below-2 = auto-delete.** When leave/edit drops a unit to <2 members, delete the record.

## 8. Test plan

- e2e (`tests/e2e/`, fresh `:8097`): from Groups tab — create a unit (2 members) → appears in list; edit budget → sub-line updates; add a 3rd member → label updates; leave (as a 3rd member) → unit persists with 2; leave down to 1 → unit dissolves; delete → gone.
- Regression: settle-up collapse unchanged (unit still nets in `SettleUpFlow`) — assert a 2-unit scenario still shows collapsed payments.
- `pnpm check` 0; `pnpm test:unit` green (pure money-units tests unaffected).

## 9. Out of scope

- No settle-up math change (already correct). No per-person breakdown under the unit-net (separate idea if Scott wants it). No budget-envelope redesign (that's the deferred finance-landscape refresh in ADR-0015 consequences).
