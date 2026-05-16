# M3 Status

**Status: COMPLETE.** Started 2026-05-15. Merged to main via [PR #6](https://github.com/toxroxmysox/Waypoint/pull/6). Deployed to production. CD pipeline added.

---

## Sub-milestones

### M3a — BottomNav (done)
Replace TripTabs with BottomNav + sub-tabs.

Tasks:
- [x] `BottomNav.svelte`: fixed bottom nav, 4 tabs (Itinerary, Money, Members, More)
- [x] `SubTabs.svelte`: reusable horizontal sub-tab strip
- [x] Wired BottomNav into trip `+layout.svelte`
- [x] Removed TripTabs from all 5 pages
- [x] Added Itinerary sub-tabs (Overview, Phases) to overview + phases pages
- [x] Created `/expenses` stub route with Money sub-tabs
- [x] Created `/budget` stub route with Money sub-tabs
- [x] Created `/more` page (Inbox, Settings, Vault placeholder)
- [x] `pnpm check`: 0/0/0
- [x] Updated M2 E2E test for nav restructure
- [x] Visual verification at 375px mobile

### M3b — Data Model + Rules (done)
PB migrations for expenses, settlements, trip_budgets. Permission rules. Server-side hooks.

Tasks:
- [x] Migration `0021_expenses.js`: expenses collection with indexes
- [x] Migration `0022_settlements.js`: settlements collection with indexes
- [x] Migration `0023_trip_budgets.js`: trip_budgets collection with unique trip index
- [x] `expenses.pb.js`: split_data validation, viewer block, delete permission hook
- [x] `settlements.pb.js`: party validation, self-settlement block, delete permission hook
- [x] `budgets.pb.js`: owner/co_owner enforcement, categories structure validation
- [x] TypeScript types: Expense, Settlement, TripBudget, SplitData, DebtEdge
- [x] `debt-simplify.ts`: greedy net-balance algorithm + 10 unit tests passing
- [x] `pnpm check`: 0/0/0

### M3c — Expense Entry + List (done)
Add Expense form, expense list, FAB, category filters.

Tasks:
- [x] `expenses/+page.server.ts`: loads expenses, settlements, members, items; addExpense + deleteExpense actions
- [x] `BottomSheet.svelte`: reusable bottom sheet UI component with slide-up animation
- [x] Expense list page: balance cards (horizontal scroll, clay/moss), chronological list, empty state
- [x] Add Expense form: amount, description, paid by, split config (equal/by_amount), category chips, date
- [x] FAB wired to open Add Expense sheet
- [x] `pnpm check`: 0/0/0
- [x] Visual verification at 375px mobile

### M3d — Budget View (done)
Budget planning sub-tab, category detail, budget vs actual summary.

Tasks:
- [x] `budget/+page.server.ts`: loads budget (or defaults), computes tripDays + spentByCategory; saveBudget action
- [x] `budget/+page.svelte`: grand total, per-day rate, category cards with emoji + progress bars
- [x] Editable fields for owner/co_owner: mode toggle (per_day/total), daily_amount or total input
- [x] Budget vs actual progress bars (moss under budget, clay over)
- [x] Save Budget form with `use:enhance`
- [x] Budget-vs-actual collapsible summary on expenses page (collapsed: total progress bar, expanded: per-category bars)
- [x] `pnpm check`: 0/0/0
- [x] Visual verification at 375px mobile

### M3e — Balances + Settle Up (done)
Debt simplification algorithm, balance cards, settle up flow.

Tasks:
- [x] Balance cards: horizontal-scroll cards showing who you owe / who owes you (clay/moss)
- [x] Settle Up button with debt count
- [x] "All squared up!" banner when no debts remain
- [x] Settle Up bottom sheet: 3-step flow (list → record → confirmed)
- [x] Step 1 (list): all debts with Record Payment buttons
- [x] Step 2 (record): from→to visual, amount input (pre-filled), note field, confirm
- [x] Step 3 (confirmed): checkmark + summary + Done button
- [x] `recordSettlement` server action with validation
- [x] `pnpm check`: 0/0/0
- [ ] Visual verification at 375px mobile (deferred to M3f)

### M3f — E2E + Polish (done)
Playwright happy-path tests, mobile responsive, edge cases.

Tasks:
- [x] `tests/e2e/m3-money.spec.ts`: 6 tests covering expenses empty state, add expense, budget save, settle up, mobile responsive (375px expenses + budget)
- [x] `pnpm check`: 0/0/0
- [x] Unit tests: 23/23 passing
- [x] Visual verification at 375px mobile
- [x] Full Playwright run: 6/6 passing

### M3g — CD Pipeline (done)
- [x] `.github/workflows/deploy.yml`: auto-deploy to Fly.io on push to main
- [x] `FLY_API_TOKEN` stored as GitHub secret
- [x] First deploy triggered on push

---

## Lessons learned (M3)

- **PocketBase `created_by` is not auto-populated.** Server actions must explicitly look up the current user's trip_member record and include `created_by: membership.id` in create payloads.
- **PocketBase datetime strings need splitting before Date construction.** PB stores dates as `YYYY-MM-DD HH:MM:SS.sssZ`. Appending `T00:00:00` to the full string creates an invalid date. Always split on `T` or space first: `dateStr.split(/[T ]/)[0]`.
- **FAB positioning must account for BottomNav.** `bottom-5` gets cut off by the fixed bottom nav. Use `bottom-20` minimum.
- **Playwright strict mode bites with generic text matchers.** `getByText(/payment.*needed/i)` matched both a button label and a `<p>` tag. Use `.first()` or more specific locators. `getByRole('button', { name: 'X', exact: true })` is safest for buttons.
- **Cross-test state in Playwright is fragile.** Tests that depend on data created by prior tests work only when run serially with a single worker. Use `.or()` to accept either state (data exists or empty state) for resilience.
- **Browser scroll-to-change on number inputs is a UX trap.** Users scrolling past a focused number input unknowingly change its value. Global wheel handler that blurs number inputs is the fix -- add it once in root layout.

---

## Open decisions

None.
