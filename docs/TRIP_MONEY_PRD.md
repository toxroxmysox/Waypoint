# PRD — Trip-Mode Money: Mid-Trip Summary + Booked-Moment Expense Capture

> Owner: Scott Vanden Warsen
> Created: 2026-06-13 (from the #116 audit; grilled 2026-06-13; charter scenarios 30 + 31; finding WP-A-018; folds in exploration P-3)
> Status: Approved (design grilled 2026-06-13)
> Glossary: [[Expense]], [[Budget]], [[Item Cost]], [[Settlement]], [[Debt Simplification]], [[Trip Mode]], [[Booking Readiness]].
> Depends on: **#170** (the `?action=add` expense prefill is broken — the booked-moment toast *and* the existing Trip-Mode add both need it). Rides **#197** (URL-derived chrome — the Money tab is a trip-mode summary surface, not the planning `/expenses`).
> Records: SPEC §Money / Trip-Mode nav change (Money tab in Trip Mode); CONTEXT.md annotations (**Budget** mid-trip glance, **Expense** booked-moment capture). **No ADR** (additive, reuses the pure money modules, reverses no documented decision).

## Grill Resolutions (2026-06-15 — grilled with Scott + 3-panel review)

> **Supersede the body where they differ.** Source of truth for current intent.

**SPLIT INTO THREE (Scott's call):** the PRD's two halves divide into a ship-ready **Summary**, a reusable **Prefill mechanism** (new issue, re-grill), and a re-grill of the **Capture trigger**.

**A — Trip-Mode Money Summary (READY — afk):**
1. `money-glance` pure module + a read-only Trip-Mode (clay) money route. **KEEP the prepaid/on-trip split** (`expense.date < tripStart` vs `>=`) — it's the PRD's actual insight and nearly free. "Spent" = actual `expenses` only (never estimates). `myBalance` reuses `computeBalances`.
2. **Budget total is NET-NEW** — there is NO reusable total helper (the summation is inline in `budget/+page.server.ts`); build it once in `money-glance` as the single source.
3. `todaySpend` in **trip-local tz**; **over-budget renders "-$X over"** (not a vanished/negative "left"); **no budget set → show spent, omit "left."**
4. Read-only; each figure deep-links to the planning Money pages (#197 keeps the route in Trip-Mode chrome).
5. **NAV — settled by #166, BLOCKED-BY it:** the Money tab lands in the slot freed by #166's Now+Today merge → **`Now · Money · ⊕Add · Docs`**. The body's `Today/Money/Add/Docs/Now` (5-tab) is superseded. The module/route can be built in parallel; the *tab* waits for #166's nav merge.
6. **SPEC delta:** §Money / Trip-Mode nav (Money tab) — bake into this slice.

**B — Reusable prefilled add-expense (NEW ISSUE — re-grill later; Scott: "this won't be the only place we use it"):**
7. `ExpenseForm` **cannot prefill an add today** — passing `expense` flips it to *edit* mode (`?/updateExpense`, hides Paid-by/Split, needs `expense.id`). Add **discrete optional `initial*` props** (amount/description/paidBy/date/linkedItem) that seed the `$state` initializers WITHOUT touching `isEdit`; add the `linked_item` hidden input the form doesn't emit today; the `?action=add` effect must read value params (reads none now). **#170 only opens a BLANK form — this prefill is net-new, not "riding #170."**
8. **Payer prefilled = current member, EDITABLE** (when someone else paid / you booked for the group, fix it inline).
9. General-purpose infrastructure (the booked-moment capture is just one caller). Re-grill the mechanism before slicing.

**C — Paid-moment capture trigger (RE-GRILL — Scott: "booking isn't always the right signal, only sometimes"):**
10. **"Booked" is the wrong trigger by default** — for big line items (group Airbnb, hotels, car) booked ≠ money-left-account (hold now / charged later / deposit-then-balance), so a booked-fired toast mostly mis-captures and trains dismissal. Re-grill toward a **money-event signal** ("I paid / mark prepaid"), booked as only *one* such case.
11. **The prefill must carry the SPLIT, not just the payer** (Dogfood: book the group's $2,400 house → a *personal* expense doesn't close the loop; shared items should default to a group split).
12. The two booking paths are **unequal** — the booking-list "book" server action discards its `result` and returns no item payload; a toast there needs the action to return the item + the page to consume `result`. Dedupe (prompt only if no linked expense — `linked-expenses.ts` exists) decided at re-grill. Depends on **B**.

**Stale refs:** #170/#197/#198 are **CLOSED** — the body's "depends on #170 (broken)" is stale; #170 shipped (blank-form only).

## Problem Statement

Mid-trip money is one-way. From Trip Mode you can ADD an expense (the Add sheet → expenses), but you can SEE nothing — "how are we doing on budget," "what did today cost," "who's owed what" all force a switch to Planning → Money. During the trip is exactly when spending happens and the questions are most urgent, yet Trip Mode (the on-the-road UI) has no Money at all — the tab simply vanishes when the trip goes active. The fallback is Splitwise or the group text (the V1 old stack), on the money job Waypoint means to own.

And the budget number itself doesn't tell the real story. A group pre-pays for flights and tours — money already out of the bank before the trip — then spends day-to-day on the road. "Spent $X so far," with no split between what was prepaid and what's been spent *on* the trip and no "how much is left," can't answer "are we okay on budget?" Worse, much of that prepaid spend never becomes a recorded [[Expense]] at all: today you log expenses by hand, and the moment money actually leaves an account — **booking** — captures nothing, so the mid-trip "spent" number is blind to the biggest line items.

## Solution

Give Trip Mode a Money home, and capture spend at the moment it happens.

- **Money is a tab in Trip Mode**, second in the bar (`Today / Money / [Add] / Docs / Now`) — matching where Money sits in Planning, so it's consistent across modes instead of disappearing on the road. It opens a **trip-mode money summary** (in Trip-Mode chrome): budget status with the prepaid-vs-on-trip split and what's left, your balance, and today's + recent spending — all **read-only**, each row a deep-link to the full Money pages to edit or settle. Glance in Trip Mode; act in Money.
- **A budget line that tells the real story.** The summary reads **Budget $Y · Spent $X (pre-trip $A + on-trip $B) · Left $C**, where "spent" is actual recorded [[Expense]]s — never plan estimates — split by date around the trip start. So "left" lines up with the bank account, and you can see at a glance whether the day-to-day is on track *given what was already prepaid*.
- **Capture spend when it happens.** When you mark an item booked — the moment money leaves an account — a bottom **action toast** offers "Log what you paid," opening the expense **prefilled** from the item (the estimate as the starting amount, linked to the item). Skip it freely and log later. This is what fills in the prepaid half of the mid-trip number, and keeps Money authoritative from planning all the way through.

## User Stories

1. As a member mid-trip, I want a Money tab in Trip Mode, so that I can check our money without switching back to Planning.
2. As a member, I want Money in the same nav position as in Planning, so that it's where I expect it in both modes.
3. As a member, I want the Trip-Mode money view to stay in Trip-Mode chrome, so that checking money doesn't feel like leaving the trip.
4. As a member, I want to see how much we've spent against the budget, so that I can tell if we're on track.
5. As a member, I want "spent" split into what we prepaid and what we've spent on the trip, so that the number reflects how trip money actually works.
6. As a member, I want to see how much budget is left, so that I can compare it against what's in the bank.
7. As a member, I want "spent" to count only real recorded expenses, not plan estimates, so that the budget math matches actual money out.
8. As a member, I want to see my own balance (owed or owing) at a glance, so that I know where I stand without opening the settle screen.
9. As a member, I want to see today's and recent spending, so that I know what the day has cost.
10. As a member, I want each money figure to deep-link to the full Money page, so that I can drill in to edit or settle when I need to.
11. As a viewer, I want to see the money summary read-only, so that I stay informed without being able to change anything.
12. As a member, I want the Trip-Mode money view to be read-only (no settling/editing inline), so that the tab stays a quick glance, not a second editor.
13. As a member who just booked something, I want a prompt to log what I paid, so that the expense gets captured at the moment money left my account.
14. As a member, I want that prompt to be a dismissible toast, not a blocking step, so that I can skip it and log later without friction.
15. As a member, I want the logged expense prefilled from the item (amount, name, link), so that capturing it is a confirm, not a re-entry.
16. As a member, I want the prefilled amount to start from the item's estimate but stay editable, so that I can correct it to what I actually paid.
17. As a member, I want the booked-moment expense linked to its item, so that the plan and the money stay connected.
18. As a member, I want booking from the booking list (not just item detail) to offer the same prompt, so that capture is consistent wherever I book.
19. As a member, I want a flight or tour I prepaid before the trip to show up as pre-trip spend, so that the mid-trip total isn't blind to the big line items.
20. As a phone user, I want the money summary and the booked-moment toast to work one-handed at 375px, so that I can check money or log a payment on the road.
21. As a member with no budget set, I want the summary to still show what we've spent (without a "left" figure), so that it's useful even before anyone sets a budget.
22. As a member who hasn't spent today, I want "today" to read $0 rather than vanish, so that "we haven't spent yet" is itself information.
23. As a member, I do NOT want estimates folded into "spent," so that the number stays honest about real money out.
24. As an owner, I want booking-moment capture to never silently create an expense, so that nothing lands in Money that a member didn't confirm.

## Implementation Decisions

- **`money-glance` is a new pure, deep module — the testable core of the summary.** Signature shape: `moneyGlance(expenses, budget, members, { meId, tripStart, today, tripDays }) → { budgetTotal, spentTotal, spentPreTrip, spentOnTrip, left, myBalance, todaySpend, recent }`. No I/O. Reuses `computeBalances` (your net balance) and the budget-total logic (Σ category budgets, `per_day` × `tripDays` + `total`). The pre/on-trip split is `expense.date < tripStart` vs `>=`. `spentTotal` is Σ actual `expenses.amount_usd` — estimates are never read here. Mirrors `debt-simplify.ts` / `build-split-data.ts` as pure money modules.
- **A new Trip-Mode money summary route, in Trip-Mode (clay) chrome.** Its loader fetches the trip's expenses + budget + roster and feeds `money-glance`. It renders the budget line, the your-balance line, and a short today/recent list — all read-only; each is a link to the planning Money pages (`/budget`, `/expenses`) for editing and settle-up. Because it is its own trip-mode route (not the planning `/expenses`), **#197's URL-derived chrome keeps it in Trip Mode** — tapping a deep-link is an explicit "go to full Money," which crosses to planning chrome by design.
- **Money joins the Trip-Mode nav, second slot.** `getNavConfig`'s trip branch becomes `Today / Money / [Add] / Docs / Now` (and `getActiveTab` gains the money case for the new route). This centers the oversized Add FAB and mirrors Money's position in the Planning nav.
- **Booked-moment expense capture (folds in exploration P-3).** On any `booked` false→true transition — the item's booking toggle *and* the booking [[Smart List]]'s "book" action — a dismissible **action toast** offers "Log what you paid," deep-linking to the prefilled add-expense: amount ← `cost_estimate_usd` (editable), description ← item title, `linked_item` ← the item, paid_by ← the current member, date ← today (editable). A small pure helper builds the prefill params from an item. Dismiss = no expense (log later anytime); never blocking, never a silent write.
- **"Spent" is actual Expenses only.** Per CONTEXT.md ([[Item Cost]] vs [[Expense]]), `cost_estimate_usd` is a forward estimate and never a payment; `money-glance` sums only recorded `expenses`. The booked-moment capture is precisely the bridge that turns a prepaid estimate into a recorded Expense, so the **pre-trip figure is real rather than guessed**.
- **Read-only in Trip Mode.** No settle, no expense edit, no budget edit on the trip-mode summary — those live in the planning Money pages the rows deep-link to. (Mid-trip settle is rare; post-trip settle is #195's wrap-up.)
- **Reuses, no new collections.** `expenses`, `trip_budgets`, `linked_item`, the `booked` flag, and the pure money modules all exist; this PRD is one pure module + one trip-mode route + a nav entry + the booked-moment toast/prefill. The prefilled add-expense rides **#170**'s fix to `?action=add`.

## Testing Decisions

- Good tests assert **external behavior** — expenses + budget + roster in → the summary figures out; an item in → the prefill params out — not internal structure. The pure module is the high-value target because everything else is loader glue, a nav entry, and a toast.
- **Vitest — `money-glance`:** budget total across `per_day` + `total` categories; `spentTotal` = Σ actual expenses (estimates ignored); the pre-trip/on-trip split by `expense.date` vs trip start; `left` = budget − spent (and absent when no budget); `myBalance` from `computeBalances`; `todaySpend`; recent ordering; empty cases (no budget; no expenses → settled, $0 today). Prior art: `debt-simplify.test.ts`, `build-split-data.test.ts`.
- **Vitest — the prefill helper:** item → `{ amount, description, linked_item, paid_by, date }`; estimate-as-amount; missing estimate → blank amount. Prior art: the pure itinerary helpers.
- **Playwright — two paths:** (1) on an active trip, the Money tab shows budget / balance / today and a row deep-links to the full Money page; (2) mark an item booked → the action toast appears → "Add expense" opens prefilled → save → it appears in the summary's spent. Visual-verify the summary + the toast at 375px. Prior art: existing money / trip-mode specs.
- **Not separately unit-tested:** the loader glue, the nav-config entry, and the toast rendering — consistent with "don't test trivial CRUD / PB glue."

## Out of Scope

- **Estimates in "spent."** Excluded by design — `money-glance` reads recorded Expenses only ([[Item Cost]] stays a plan estimate).
- **Settling or editing inside the Trip-Mode summary.** It's read-only; settle/edit deep-link to the planning Money pages. Post-trip settle is **#195**'s wrap-up.
- **The rest of *Day Wrapped Stats*** (items / distance) — this PRD delivers only the money/spent piece; the broader stat card stays backlog.
- **PT-2 "Money epilogue"** (post-trip estimate-vs-actual recap) — a separate post-trip node of the money story.
- **#198 plan-vs-budget** ("can we afford this," forward-looking, Planning) — distinct from this *actual*-spend mid-trip view.
- **Real-time** — the summary follows the app's load/refresh model (no live subscriptions, per CLAUDE.md).
- **Auto-creating expenses without confirmation** — the booked-moment toast always opens an editable, dismissible prefill; it never silently writes an Expense.

## Further Notes

- **Origin:** audit #116, finding **WP-A-018** (P2; charter scenarios 30 "mid-trip budget glance" + 31 "who owes whom"). Folds in exploration **P-3** ("Booked moment → Log what you paid"), which the explorations already named as the enabler that "feeds the mid-trip/post-trip money story with real prepaid data." Report: `docs/app-audit/v2/index.html`.
- **The grill's key turns:** (1) Money becomes a **tab in Trip Mode** (Scott's consistency call) rather than a glance card buried on Today — a real, roomier home that fixes the "money lives in the other mode" asymmetry; (2) "spent" stays **actual Expenses only**, which forced folding in the **booked-moment capture** so prepaid spend is recorded rather than estimated.
- **Charter D1 (no collaboration / aggregation hub)** holds: the Money tab is consistency with Planning (Money is already a Planning tab), not a new hub; the trip-mode summary is a glance, with the authoritative Money surfaces unchanged.
- **The money story across pillars:** Planning logs prepaid at the booked moment (this PRD) → Trip Mode glances mid-trip (this PRD) → post-trip recaps estimate-vs-actual (PT-2, separate). This PRD owns the first two nodes.
- **Dependencies:** **#170** (prefilled `?action=add` — currently broken) gates the booked-moment toast and the existing Trip-Mode add; **#197** (URL-derived chrome) is what lets the Money *tab* be a trip-mode surface while its deep-links cross to planning Money. **#198** is the planning-side budget sibling.
- **Slicing** (`to-issues` later): natural first slice = the `money-glance` module + the Trip-Mode Money tab/summary (tracer: the tab shows real spent-vs-budget); then the booked-moment toast + prefill (riding #170).
- **No PR from this session** — audit dispositioning in the research worktree; Scott controls git.
