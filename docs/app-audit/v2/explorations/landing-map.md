# Post-Action Landing Map

> Audit #116, v2 exploration. Question: **where should travelers land after they complete a task or item?**
> Method: enumerated every form action in `src/routes/**/+page.server.ts` (30 files, ~74 actions), read each
> action body for its success path (redirect vs. stay), then read the client layer (`use:enhance` callbacks,
> sheets, `goto()` follow-ups, toast store) that shapes what the user actually experiences. Code is source of
> truth; routes.json/edges.json used as index only, every claim re-verified in source.

## Judgment criteria

Each landing judged on four axes:

1. **Momentum** — does the next likely intent live where you land?
2. **Context preservation** — are you back where you came from, or ejected somewhere else?
3. **Result visibility** — can you SEE the thing you just made/changed?
4. **House patterns** — toasts for transient confirmation, in-context errors (CLAUDE.md), and the
   project's own emerging conventions (below).

Charter bindings respected: **D3** (today-only boundary in Trip Mode — a landing that strands a
today-scoped task on a planning surface is a dead end; future-scoped is a working door), **D2** (post-join
landing content is a known gap, open issue #111 — cite, don't re-flag), **D5** (wrap-up sequence is a
pre-agreed P1, PRD-sized — landings feeding it are cited to D5, not filed separately).

## The four landing conventions already in the code

The codebase has converged — unevenly — on four good post-action patterns. Naming them because the
mismatches below are all deviations from the app's own instincts:

| Convention | Shape | Exemplars |
|---|---|---|
| **Stay + see it** | No redirect; `use:enhance` invalidates load; result appears in place; toast optional | expenses add/edit/settle, goals create (optimistic row), day notes, members invite, checklist tasks, votes |
| **Land in the thing you made** | Redirect (or client `goto`) into the created/edited artifact | list create → `/lists/[newId]`, item edit → item detail, clone/import/new trip → new trip home |
| **Return to the queue** | Working a pile: act, land back on the pile, toast confirms | inbox approve/reject, booking smart-list `book`, closeout markDone rows |
| **Capture loop** | Multi-add flows: stay on the capture surface with an explicit success state + add-another + exit | goals/capture success screen, phase `addIdea` ("Idea added to parking lot" toast, form stays) |

Where an action follows one of these, the landing is right. Every mismatch below is a place where an
action picked the wrong convention — or none.

---

## Full landing map

Verdict legend: **OK** = matches criteria · **MISS** = mismatch, proposal below · **CITE** = gap already
owned by a charter decision / open issue / PRD (not re-flagged).

### Auth, account, entry doors

| Action | Where (file:line) | Current landing | Verdict | Notes / proposed |
|---|---|---|---|---|
| `/login?/requestOTP` | `(auth)/login/+page.server.ts` | stays — step 2 (code entry) renders | OK | wizard step |
| `/login?/verifyOTP` | `:46` | → `/claim`, whose load routes: pending invite → `/invite/[code]`, else `/trips` | OK | claim interception by design |
| `/logout?/default` | `(auth)/logout/+page.server.ts:7` | → `/login` | OK | |
| `/claim?/accept` | `(app)/claim/+page.server.ts:75` | → `/trips/[claimedSlug]` (or `/claim` if no slug) | CITE | landing *target* right; landing *content* is D2 / #111 (first five minutes) |
| `/claim?/skip` | `:79` | → `/trips` | OK | |
| `/account?/updateName` `updateAvatar` `removeAvatar` | `(app)/account/+page.server.ts` | stays + toasts ('Name saved' / 'Photo updated' / 'Photo removed'), avatar visible | OK | model citizen of stay+see-it |
| `/invite/[code]?/requestOTP` `verifyOTP` `signOut` | `invite/[code]/+page.server.ts` | stays — page re-renders next step (verified → accept button) | OK | progressive on-page wizard |
| `/invite/[code]?/accept` | `:97` | → `/trips/[slug]` Planning overview | CITE | documented-intended: MEMBERSHIP_LIFECYCLE_PRD line 55 specs exactly this landing. What it *shows* a stranger = D2, open issue #111 |
| `/join/[token]?/accept` (+ OTP actions) | `join/[token]/+page.server.ts:98` | → `/trips/[slug]` | CITE | same as invite |

### Trip lifecycle

| Action | Where | Current landing | Verdict | Notes / proposed |
|---|---|---|---|---|
| `/trips/new?/default` | `trips/new/+page.server.ts:65` | → `/trips/[slug]` — new trip home, flat day list | OK | you see the skeleton you made; Phases/Lists/Goals one SubTab away. P3 at most |
| `/trips/import?/import` | `trips/import/+page.server.ts:145` | → `/trips/[slug]` | OK | imported result visible |
| `/trips/[slug]/clone?/default` | `clone/+page.server.ts:190` | → `/trips/[newSlug]` | OK | land in the thing you made |
| `/settings?/update` | `settings/+page.server.ts:41` | stays + toast 'Settings saved' | OK | |
| `/settings?/delete` | `:72` | → `/trips` | OK | the trip no longer exists; only sane landing |
| `/settings?/toggleArchive` | `:114-117` | stays; returns `shareToken`; share URL renders | **MISS (P3)** | the artifact you came for is a non-clickable `<code>/archive/{token}</code>` (`settings/+page.svelte:167-174`), relative path, no copy button — compare members page join-links which have copy + 'Link copied' toast (`members/+page.svelte:45`). Scenario 35 ends in manual text-selection on a phone. **Proposed: same landing, make the artifact actionable — full URL, copy button, open link.** |
| `/settings?/archiveTrip` | `:145` | stays `{ archived: true }` | CITE (D5) | landing offers no onward step (no recap, no share CTA, no memory review). The whole settle→closeout→archive sequence is D5's pre-agreed P1, PRD-sized |
| `/closeout?/markDone` `markDoneAll` `trimEnd` `addReplacement` | `closeout/+page.server.ts` | stays — rows/days update in place | OK | queue convention done right |
| `/closeout?/finishCloseout` | `:118` | → `/trips/[slug]` — Planning-mode overview of a now-archived trip | **MISS — fold into D5** | the trip's final action lands on the day-editor view with **zero archived state** (no banner, no recap, no share pointer — `grep archived` in `[slug]/+page.svelte` + load: no hits). The record moment evaporates: V3 seam drop, trip→record. D5 owns the feature; **this landing is the PRD's most important screen: finishing closeout should land on the record (recap/share surface), not on the planning tool for a trip that no longer needs planning.** |

### Structure: phases, days, items

| Action | Where | Current landing | Verdict | Notes / proposed |
|---|---|---|---|---|
| `/phases?/create` | `phases/+page.server.ts` | stays + toast 'Phase created' | OK | |
| `/phases?/reorder` `delete` | same | stays (optimistic / toast 'Phase deleted') | OK | |
| `/phases/[phaseId]?/update` | `phases/[phaseId]/+page.server.ts:84` | **→ `/phases` list** (+ toast 'Phase updated') | **MISS (P3)** | the edit form lives ON the phase detail page (`phases/[phaseId]/+page.svelte:80`), but saving ejects you to the phases list — context loss for no reason; you were mid-phase (its parking lot, days, ideas below). Likely vestige of when phase edit lived on the list. **Proposed: return `{ success: true }`, stay on detail (enhance invalidates), keep the toast.** |
| `/phases/[phaseId]?/addIdea` | `:90` | stays `{ ideaAdded }` + toast 'Idea added to parking lot' | OK | capture-loop convention; scenario 11 (several meal options in a row) — shipped right in #159 |
| `/phases/[phaseId]?/reorder` | `:121,139` | stays (also cross-route target of day-view parking drag #160 — enhance invalidates the *posting* page) | OK | |
| `/days/[dayId]?/updateNotes` | `days/[dayId]/+page.server.ts` | stays + toast 'Notes saved' | OK | |
| `/days/[dayId]?/reorder` `pullToPlan` `pushToParking` | same | stays — optimistic drag, hidden forms, invalidate (`DragDropTimeline.svelte:243-268`) | OK | D3-compliant in mechanics: day view renders under AppShell, so on an active trip the bottom nav stays Trip-mode tabs |
| `/items/new?/default` — owner edit-and-approve of suggestion | `items/new/+page.server.ts:225` | → `/inbox` | OK | return-to-queue, correct |
| `/items/new?/default` — traveler suggestion | `:249` | → `/trips/[slug]` overview, **no toast, no trace** | **MISS (P1)** | see Mismatch 1 below |
| `/items/new?/default` — direct create, day set | `:274` | → `/days/[day]` | OK *for planning entries* / **MISS (P2) for Trip-Mode entry** | day-FAB entry: perfect context return. Trip-Mode AddSheet entry: see Mismatch 2 |
| `/items/new?/default` — direct create, "Unscheduled" | `:276` | → `/trips/[slug]` overview | **MISS (P3)** | see Mismatch 4 |
| `/items/[itemId]?/delete` | `items/[itemId]/+page.server.ts:129-131` | → `/days/[day]` if scheduled, else trip home | OK | visible absence in the right context |
| `/items/[itemId]?/uploadDocument` `deleteDocument` | same | stays; sheet closes; doc list updates | OK | |
| `/items/[itemId]?/attachChecklist` `deleteChecklist` `addTask` `toggleTask` `assignTask` `deleteTask` | same | stays — checklist updates in place; assign sheet `closeOnDone` | OK | |
| `/items/[itemId]?/addComment` | `:~360` | stays — comment appears | OK | scenario 16 clean |
| `/items/[itemId]?/vote` `unvote` | `:367-415` | stays — `VoteButtons` enhance, posts cross-route from parking cards too | OK | |
| `/items/[itemId]?/moveItem` | `:418-434` | stays on item detail; day badge + back-target re-derive after invalidate | OK | staying with the thing you moved is right |
| `/items/[itemId]/edit?/update` | `edit/+page.server.ts:178` | → `/items/[itemId]` | OK | land in the thing you edited |
| `/items/[itemId]/edit?/delete` | `:193-195` | → day or trip home | OK | |

### Lists

| Action | Where | Current landing | Verdict |
|---|---|---|---|
| `/lists?/create` | server returns `{ listId }`; client `goto('/lists/[newId]')` (`lists/+page.svelte:126`) | new list page | OK — land in the thing you made |
| `/lists/[listId]?/addTask` `toggleTask` `assignTask` `deleteTask` `rename` | `lists/[listId]/+page.server.ts` | stays | OK |
| `/lists/[listId]?/deleteList` | `:176` | → `/lists` | OK |
| `/lists/booking?/book` | `lists/booking/+page.server.ts` | stays — row flips to booked, keep working the queue | OK — scenarios 6/13 |

### Goals & swipe

| Action | Where | Current landing | Verdict |
|---|---|---|---|
| `/goals?/create` | `goals/+page.server.ts` | stays — optimistic row drops in instantly (`goals/+page.svelte:164-191`) | OK |
| `/goals/capture?/addGoal` `deleteGoal` `vote` `unvote` | `goals/capture/+page.server.ts` | stays — immersive capture loop; success screen offers add-another / 'See the goal list' / close → `/goals` | OK — the capture-loop reference implementation |
| `/goals/[goalId]?/link` `unlink` `setStatus` | `goals/[goalId]/+page.server.ts` | stays | OK |
| `/goals/[goalId]?/delete` | `:129` | → `/goals` | OK |
| `/swipe/[phaseId]?/vote` `unvote` | `swipe/[phaseId]/+page.server.ts` | stays — deck advances client-side; end card offers next-phase deck / parking lot / back to phases | OK — momentum handled explicitly |

### Money

| Action | Where | Current landing | Verdict |
|---|---|---|---|
| `/expenses?/addExpense` `updateExpense` `deleteExpense` | `expenses/+page.server.ts` | stays — sheet closes, toast ('Expense added' etc.), list updates | OK. Trip-Mode AddSheet routes here via `/expenses?action=add`; Money tab exists in BOTH modes' bottom nav (`nav-tabs.ts`), so scenario 20 lands correctly and Now is one tab away — D3-compliant |
| `/expenses?/recordSettlement` | same | stays + toast 'Settlement recorded' | OK — scenario 31 |
| `/budget?/saveBudget` | `budget/+page.server.ts` | stays + toast 'Budget saved' | OK |

### Members, inbox, documents, today

| Action | Where | Current landing | Verdict |
|---|---|---|---|
| `/members?/invite` `revoke` `addPlaceholder` `promote` `remove` | `members/+page.server.ts` | stays — namespaced in-context success/error per section | OK |
| `/members?/createJoinLink` `rotateJoinLink` `revokeJoinLink` | same | stays; copy button + 'Link copied' toast | OK — this is what settings' archive share URL should copy |
| `/inbox?/approve` `reject` | `inbox/+page.server.ts` | stays + toast — keep working the queue | OK (the approved item materializes elsewhere, but queue momentum wins for a review flow) |
| `/documents?/uploadDocument` `deleteDocument` | `documents/+page.server.ts` | stays — add-sheet closes, doc appears | OK. Trip-Mode AddSheet → `/documents?action=add`; Docs tab in both modes | 
| `/today?/toggleTask` | `today/+page.server.ts` | stays on Today | OK — scenario 25, D3-compliant |

---

## Mismatches in detail

### 1. Traveler suggestion vanishes into a black hole — P1 (V2)

**Where:** `src/routes/(app)/trips/[slug]/items/new/+page.server.ts:249`
**Current:** a traveler (auto-approve off) fills the full New-Item form — told beforehand "Your item will be
submitted as a suggestion for the owner to review" (`items/new/+page.svelte:64-68`) — taps save, and lands
on the trip overview. No toast (the only landing in the creation family with neither redirect-into-result
nor confirmation). No trace: the overview renders days and lists only; the suggestion lives in `/inbox`,
which 403s for travelers (`inbox/+page.server.ts:10-11`). No outcome loop either: notification hooks emit
`suggestion_added` → owners only; nothing fires to the suggester on approve/reject
(`backend/pb_hooks/notifications.pb.js:5-7`).
**Why it fails:** result visibility = zero; momentum = dead (next intent — "suggest another" or "check it
went through" — lives nowhere reachable). The non-technical friend's contribution appears to disappear, so
they confirm out-of-band: "hey, did you see my suggestion?" in the group text. That is V1+V2 in one move,
on the exact persona the quality bar names. Not documented-deferred: SPEC_BACKLOG's suggestion entries
cover edit-and-approve UI and an E2E test, not submitter feedback.
**Proposed landing:** keep the traveler on `/items/new` with an explicit success state — the goals/capture
pattern, already the house convention for capture loops: "Sent to [owner] for review" + *Suggest another* +
*Back to trip*. Minimum viable fix is a redirect-with-toast, but a toast alone still leaves no persistent
trace, so pair it with a "waiting for review" chip wherever the traveler would look for the item (day view /
parking lot). The approve/reject notification back to the suggester closes the loop but is a separate,
small backend slice.

### 2. Trip-Mode quick-add lands on the planning day editor — P2 (D3 seam)

**Where:** `src/lib/trip-mode/components/AddSheet.svelte:15-19` → `items/new/+page.server.ts:273-276`
**Current:** Trip Mode's + sheet ("Add item to today") navigates to `/items/new?from=trip&day=<todayId>`.
**`from=trip` is dead code — no load function, form, or action ever reads it** (grep: zero non-comment
hits). On save the action redirects by `day` alone → `/days/[todayId]`: the planning-mode day editor (drag
handles, parking zones, planning NavBar whose back goes to the planning overview). The Trip-Mode bottom nav
survives (AppShell mode derives from trip activity, `AppShell.svelte:35-46`), so this isn't a hard mode
exit — but the traveler who asked "add a coffee stop to *today*" never sees today's *timeline* again; they
get the editing bench, one cognitive frame and two taps away from where they think.
**Why it fails:** context preservation (came from Now/Today, lands in Planning's furniture) and momentum
(next intent mid-trip is "back to what's happening", i.e. Today/Now). D3 says quick-add for today must work
inside Trip Mode — mechanically it does, but the landing leaks the planning stack into the one-handed
mid-trip flow. TRIP_REPLANNING_PRD (#166) explicitly scopes quick-create OUT ("the Add sheet already covers
quick-add-for-today") — so the PRD leans on this flow and does not fix its landing; fair game as a
standalone finding.
**Proposed landing:** honor the parameter that already exists: thread `from=trip` through the form (hidden
input) and redirect to `/trips/[slug]/today` on success — the new item visible in the timeline you just
added it to. The expense and document legs of the same AddSheet already land correctly (Money/Docs tabs
exist in both modes); item-add is the only leg that strands you.

### 3. Finishing closeout lands on the planning view of a dead trip — fold into D5

**Where:** `closeout/+page.server.ts:118`; absence verified in `[slug]/+page.svelte` + load (no archived
handling).
**Current:** `finishCloseout` archives the trip and redirects to `/trips/[slug]` — the planning overview,
which renders identically to a live trip: no archived banner, no recap, no share link, no memory pointer.
**Why it fails:** V3 seam drop (trip day → record). The single most ceremonial action in the app — closing
the trip — lands on the tool for a job that no longer exists. Settings' `archiveTrip` has the same shape
(stays on settings, `{ archived: true }`, no onward step).
**Disposition:** D5 pre-agreed this territory as P1 and feature-sized (grill→PRD, not a quick issue). This
exploration's contribution to that PRD: **the wrap-up's final landing should be the record surface** —
recap/archive view with the share link — and the archived trip home should *be* (or lead with) that record,
not the day editor.

### 4. "Unscheduled" item creation lands where the item is invisible — P3

**Where:** `items/new/+page.server.ts:276`; "Unscheduled" option at `ItemForm.svelte:410`.
**Current:** creating an item with day = Unscheduled (a parking-lot idea) redirects to the trip overview,
which shows days and lists only — unplanned items render in phase parking lots (`/phases`, phase detail,
day-view parking zones), none of which is where you land.
**Why it fails:** result visibility. You made a thing and land on a page that cannot show it. Low traffic
(the dedicated capture paths — phase `addIdea`, goals capture — handle most idea entry, and both land
correctly), hence P3.
**Proposed landing:** `/trips/[slug]/phases` (the parking lots live there), or the chosen phase's detail
page when the form had a phase selected. Alternatively stay-on-form with a capture-loop success state for
parity with `addIdea`.

### 5. Saving a phase ejects you from the phase — P3

**Where:** `phases/[phaseId]/+page.server.ts:84` (`throw redirect(303, '/phases')`); form on
`phases/[phaseId]/+page.svelte:80`.
**Current:** edit name/dates on the phase detail page → save → phases *list* (+ 'Phase updated' toast).
**Why it fails:** context loss with no compensating momentum — the phase detail holds the things you're
likely mid-task on (its ideas, days, swipe entry). Sibling action `addIdea` on the same page stays put;
`update` is the odd one out.
**Proposed landing:** stay on phase detail — return `{ success: true }`, keep the toast, let enhance
invalidate.

### 6. Archive share URL is an inert string — P3

**Where:** `settings/+page.svelte:167-174` (after `toggleArchive`, `settings/+page.server.ts:114-117`).
**Current:** enabling archive returns the share token; landing (stay on settings) is right, but the result
renders as a relative, non-clickable `<code>` block. Scenario 35 ("share with grandma") ends with
text-selection gymnastics on a phone.
**Proposed:** same landing; make the artifact actionable — absolute URL, copy button with 'Link copied'
toast (exact pattern already shipped for join links, `members/+page.svelte:45`), plus an "open archive"
link so the owner can see what grandma will see.

---

## Non-findings worth recording

- **Invite/join → trip overview** is the documented landing (MEMBERSHIP_LIFECYCLE_PRD L55: "land on
  `/trips/[slug]` in Planning Mode at the link's role"). The orientation gap on arrival is D2, open issue
  #111. Cited, not re-flagged.
- **Inbox approve keeps you on the queue** rather than following the approved item into the plan — correct
  for a review flow; the owner is processing a pile, not touring results.
- **Expense/document add from Trip Mode** land correctly today because their destination tabs exist in both
  modes' bottom nav. Only the item-add leg of the AddSheet misfires (Mismatch 2).
- **Day-view drag mutations** (reorder/pull/push, incl. cross-route parking reorder from #160) are
  optimistic, stay in place, and invalidate — the strongest in-place mutation cluster in the app.
- **Toast coverage is uneven but directionally right**: money, account, settings, inbox, phases, budget,
  day-notes confirm; the creation family (items/new in all four legs) is the notable hole — and only the
  traveler-suggestion leg (Mismatch 1) lacks any other form of result visibility.

## Pattern recommendation (for Phase 3 / design-system)

Codify the four conventions in `docs/design-system.md` as the post-action contract:

1. **In-place mutation** → stay + invalidate; toast only when the change isn't visually obvious.
2. **Creation** → land *in* (or scrolled to) the created artifact; never on a page that can't show it.
3. **Queue work** → stay on the queue; toast each disposal.
4. **Capture loop** → stay on the capture surface with success state + add-another + explicit exit.

Plus one Trip-Mode rider per D3: any action initiated from Trip Mode that targets *today* must land back on
a Trip-Mode surface (Now/Today) with the result visible.
