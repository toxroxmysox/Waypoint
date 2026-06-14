# Terminology Audit — UI labels vs CONTEXT.md glossary

> #116 audit, v2 exploration. Lens: CONTEXT.md glossary is authoritative, including Avoid columns.
> Sweep scope: every user-visible label in `src/routes/**` and `src/lib/**` — nav tabs, SubTabs,
> NavBar/page titles, section headings, buttons, pills, empty states.
> Severity per charter §5: all findings here are P3 (polish/consistency) unless noted.
> D6 applies: CONTEXT.md is a live doc — where the UI word is the better word, the fix may be a
> glossary update, not a UI change. Those are flagged **[Scott's call]**.

## Verdict key

- **ok** — matches glossary or a glossary-sanctioned surfaced label (e.g. Pass-for-dislike).
- **divergent** — UI word differs from glossary term but is not on the Avoid list.
- **avoid-violation** — UI uses a word the glossary explicitly bans for that concept.

---

## 1. Full table

### Nav chrome

| Surface | Current label | Glossary term | Verdict | Proposed |
|---|---|---|---|---|
| Planning bottom-nav / SideRail (`nav-tabs.ts:33-37`) | Itinerary · Money · Members · Docs · More | Bounded contexts; Planning Mode entry lists exactly these five incl. "Docs" | ok | — (glossary sanctions "Docs" for Planning Mode) |
| Trip Mode bottom-nav (`nav-tabs.ts:22-27`) | Now · Today · Add · **Docs** | Trip Mode entry says "(Now, Today, Add, **Documents**)" | divergent (glossary/code mismatch) | Fix the glossary line to "Docs" (D6 — code is truth; UI is consistent across both modes) |
| ModePill (`src/lib/shell/components/ModePill.svelte:21`) | "Edit plan" (→Planning) / "Trip view" (→Trip) | Planning Mode (avoid "edit mode") / Trip Mode (avoid "active mode, **live view**") | divergent, avoid-adjacent | See §2.3 — unify with the "Trip Mode" button or sanction the verbs in glossary **[Scott's call]** |
| Trip overview mode button (`trips/[slug]/+page.svelte:100`) | "Trip Mode" | Trip Mode | ok | — (but conflicts with ModePill's "Trip view" for the same door) |
| Itinerary SubTabs (`+page.svelte:66-69`, `phases/`, `lists/`, `goals/`) | Overview · Phases · **Lists** · Goals | — · Phase · **Checklist** · Trip Goal | divergent ("Lists") | See §2.1 — recommend glossary update, not UI change **[Scott's call]** |
| Money SubTabs (`expenses/+page.svelte:92-93`) | Expenses · Budget | Expense · Budget | ok | — |
| Trip Mode Today SubTabs (`today/+page.svelte:52-53`) | Today · "Next 3 Days" | Today; no term for the preview view | ok / consistency note | NavBar on that page says "Upcoming" — pick one (§3.2) |
| ContextRail parking heading (`src/lib/shell/components/ContextRail.svelte:168`) | "Ideas" | Parking Lot ("colloquially 'ideas'"; avoid "ideas list") | ok (sanctioned colloquialism) | Consistency note §3.1 — sibling surfaces say "Parking lot" |
| SideRail section (`SideRail.svelte:146`) | "Phases" | Phase | ok | — |

### Page titles / NavBar

| Surface | Current label | Glossary term | Verdict | Proposed |
|---|---|---|---|---|
| Inbox NavBar + More card (`inbox/+page.svelte:41`, `more/+page.svelte:44-45`) | "Inbox" / "Review suggestions from travelers" | Suggestion; Planning Mode entry: "suggestions live in the Inbox under More" | ok | — (Inbox is the glossary-sanctioned surface name) |
| Documents NavBar (`documents/+page.svelte:65`) | "Documents" / subtitle "{n} **file(s)** · {trip}" | Document — avoid "attachment, **file**" | **avoid-violation** (subtitle) | "{n} document{n===1?'':'s'}" |
| Booking Smart List NavBar (`lists/booking/+page.svelte:19`) | "Booking" / "Auto · read-only" | Smart List — avoid "auto-list, generated checklist" | ok | — ("Auto" chip ≠ "auto-list"; "Smart List" itself never surfaces, which is fine — it's internal vocabulary) |
| Lists index h1 (`lists/+page.svelte:51`) | "Lists" / "{n} list{s}" | Checklist | divergent | §2.1 **[Scott's call]** |
| Account NavBar (`account/+page.svelte:56`) | "Profile" | — (route is `/account`) | ok (no glossary term) | P3 note: route/title mismatch, not terminology |
| Upcoming NavBar (`today/upcoming/+page.svelte:30`) | "Upcoming" | — | consistency note | §3.2 |
| Swipe NavBar (`swipe/[phaseId]/+page.svelte:104`) | "Swipe-Quiz" | Swipe-Quiz | ok | — |
| Closeout NavBar + More card (`closeout/+page.svelte:48`, `more/+page.svelte:62-63`) | "Closeout" / "Review each day and archive the trip" | Closeout | ok | — |
| Members NavBar (`members/+page.svelte:96`) | "Members" | Trip Member | ok | — |
| New/Edit item (`items/new:57`, `items/[itemId]/edit:61`) | "New item" / "Edit" | Item | ok | — |
| Clone (`clone/+page.svelte:26`, More card `:96-97`) | "Clone Trip" / "Clone trip — Create a new trip based on this one" | Clone (bounded-context term) | ok | — |
| More page Print card (`more/+page.svelte:139`) | "Print itinerary" | "itinerary" is avoided only as a synonym for **Trip**; here it names the plan (Itinerary context) | ok | — |

### Section headings, buttons, pills, empty states

| Surface | Current label | Glossary term | Verdict | Proposed |
|---|---|---|---|---|
| Vote buttons (`VoteButtons.svelte:17-20`, `swipe/vote-meta.ts`) | Love · Like · Flexible · **Pass** | Vote — `dislike` "surfaced as 'Pass'" | ok | — (exactly the sanctioned pattern) |
| Goal detail status explainer (`goals/[goalId]/+page.svelte:91-95`) | "Set automatically from {n} linked **plan{s}**. Link more **plans**…" / "link a **plan** below" | Item — avoid "event, **plan**, entry, booking" | **avoid-violation** | "linked item{s}" / "link an item below" — or sanction "plan" in goal-trace copy and amend glossary **[Scott's call, §2.2]** |
| Goal detail section head (`goals/[goalId]/+page.svelte:105`) | "Plans addressing it" | Item | **avoid-violation** | "Items addressing it" (or **[Scott's call]** §2.2) |
| Goal detail empty state (`goals/[goalId]/+page.svelte:145`) | "No **plans** linked yet. Link an **item** and this goal starts tracking it." | Item | **avoid-violation** + internal mix | Same word both halves, whichever wins §2.2 |
| Goal link sheet (`goals/[goalId]/+page.svelte:222`) | "Link an item" | Item | ok | — (proof the page already speaks "item" elsewhere) |
| Goals tab/pages (`goals/+page.svelte:145,157`, capture `:189`) | "Goals", "Add a goal", "No goals yet…", "Add & review goals" | Trip Goal — UI says "goal" everywhere; "wish" deprecated | ok | — (zero "wish" hits in `src/` — #92 holds) |
| Goal status pills (`goals/[goalId]/+page.svelte:22-27`) | Done · Planned · Unplanned · Considered | Item Status mirror | ok | — |
| Phase detail parking section (`phases/[phaseId]/+page.svelte:163,218,228`) | "Parking lot ({n})", "Add to parking lot", "No ideas yet. Add one to start a parking lot…" | Parking Lot (+ colloquial "ideas") | ok | Consistency note §3.1 |
| ParkingDivider (`ParkingDivider.svelte:35`) | "{phase} · {n}" or "Parking lot · {n}" | Parking Lot | ok | — |
| ParkingLotSection empty (`ParkingLotSection.svelte:140`) | "No parking lot items." | Parking Lot | ok | — |
| Members placeholder badge (`members/+page.svelte:118`) | "(offline)" | Placeholder Member — avoid "ghost member, stub" | divergent | §2.4 **[Scott's call]** — recommend glossary records "offline member" as the surfaced label |
| Members add-placeholder head (`members/+page.svelte:216`) | "Add offline member" | Placeholder Member | divergent | §2.4 **[Scott's call]** |
| Former members section (`members/+page.svelte:187`) | "Former members ({n})" | Departed Member — glossary names the section "Former members" | ok | — |
| Invite section (`members/+page.svelte:316,376`) | "Invite by email", "Send invite" | Invite | ok | — |
| Join-link section (`members/+page.svelte:386`) | "Share a join link" | Join Link — avoid "invite link, share link" | ok | — ("share" is the verb; the noun is "join link") |
| Join page CTA (`join/[token]/+page.svelte:130-132`) | "Join as {name}" / "Join trip" / "Were you already added to this trip?" | Claim (browse-and-claim) | ok | — (no "placeholder"/"claim" jargon shown — good novice-lens copy) |
| Inbox sections (`inbox/+page.svelte:48-54,152`) | "Pending ({n})", "No pending suggestions.", "Recently approved ({n})" | Suggestion | ok | — |
| Settings toggle (`settings/+page.svelte:111`) | "Auto-approve traveler suggestions" | Auto-approve + Suggestion + traveler role | ok | — (textbook glossary usage) |
| Settings archive head (`settings/+page.svelte:124`) | "Public Archive" | Public Archive | ok | — |
| Booked/needs-booking pills (`TimelineItemCard.svelte:84-86`, `SmartRow.svelte:77`, `TripModeCard.svelte:46`) | "Booked" / "Needs booking" | Booking Readiness — '"Needs booking" card pill' sanctioned, mutually exclusive with Booked | ok | — |
| Item cost (`ItemForm.svelte:257,605-607`) | "Cost" / "Cost (USD)" | Item Cost — "surfaced as 'Cost'" | ok | — |
| Confirmation codes (`ItemForm.svelte:568`) | "Confirmation codes" | `confirmation_codes` field (Document entry: codes live on Item) | ok | — |
| Item day select (`ItemForm.svelte:410`) | "Unscheduled" (day = none) | no glossary term for day-absence; "unplanned" is a *status* | divergent (soft) | §3.4 — consider "No day yet" or add a glossary word; "Unscheduled" collides with Anchor Time's avoid "scheduled time" vocabulary |
| Item status select (`ItemForm.svelte:390-391`) | Planned · Done | Item Status | ok (subset) | — |
| Item type picker (`ItemForm.svelte:~329`, `item-fields.ts:107-113`) | Lodging · Transportation · Flight · Activity · Meal · Note | Item Type | ok | — (`checklist: 'Checklist'` at `item-fields.ts:112` is a dead map entry — type picker excludes it; ghost of the superseded checklist Item Type) |
| Budget categories (`budget/+page.svelte:20-24`) | Lodging · **Transport** · Food · Activities · Other | item-type label elsewhere is "Transportation" | divergent (soft) | "Transportation" for family consistency, or accept (expense category ≠ item type) §3.3 |
| Closeout item buttons (`CloseoutItemRow.svelte:102-122`) | Done · **Swap** · **Skip** | Item Status: done / **considered**; Closeout entry describes done-or-considered + keep/remove review | divergent | §2.5 **[Scott's call]** — glossary and UI tell different stories |
| Closeout summary rows (`closeout/+page.svelte:119-128`) | "Done", "Skipped (stayed planned)", "Swapped (considered)" | done / considered | divergent | §2.5 |
| Trip Mode AddSheet (`AddSheet.svelte:46,62,79`) | "Add item to today" / "Add expense" / "Add document" | Item / Expense / Document | ok | — |
| Now focus states (`now/+page.svelte:43`, `NowBetweenThings.svelte:22`, `NowMidEvent.svelte:34`) | "Nothing else planned", "Free time", "Up next" | Focus — both literal strings appear in the glossary entry | ok | — |
| Today page (`today/+page.svelte:91-96`, `TodayTimeline.svelte:64`) | "Tomorrow" + "See all", "Nothing scheduled for today." | Today — "a tomorrow preview" | ok | — |
| Checklist detail (`lists/[listId]/+page.svelte:58`) | "{n} task{s} left" | Task | ok | — |
| Expenses (`expenses/+page.svelte:100,163-164,200-223`) | "No expenses yet.", "Settle Up ({n} payments needed)", "Add/Edit Expense" | Expense / Settlement (avoid "reimbursement") | ok | — |
| Trips index (`trips/+page.svelte:51,67,95,120`) | "No trips yet.", "On trip" / "Upcoming" / "Past" | Trip | ok | — |
| Role pill (`trips/[slug]/+page.svelte:90` via `titleCase`) | "Co Owner" (from `co_owner`) | Role | consistency note | invite/claim pages map to "Co-Owner" (`invite/[code]/+page.svelte:16`) — unify §3.5 |
| Smart List signal (`AutoChip.svelte`, `lists/+page.svelte:73`) | "AUTO" chip, "Auto · from your itinerary", "{n} left" | Smart List | ok | — |
| Document add sheet (`DocumentAddSheet.svelte:30,46`) | "Attach to" / "Choose file" | Document — avoid "file" | ok (edge) | "Choose file" names the OS file-picker object *before* it becomes a Document; acceptable. "Attach to" is fine — "attachment" is avoided as the *noun* for Document |
| Documents empty state (`documents/+page.svelte:82`) | "No documents yet." | Document | ok | — |

---

## 2. Decision items (the ones worth Scott's time)

### 2.1 "Lists" vs Checklist — systemic, deliberate-looking divergence
The UI says "Lists" everywhere a user meets the Checklist primitive: sub-tab (`+page.svelte:68`),
h1 + count (`lists/+page.svelte:51-53`), "New list" / "Create list" (`:103,159`), "No lists yet…"
(`:108`). "list" is **not** on Checklist's Avoid column ("checklist item type, sub-items"), so this
is divergence, not violation — but it means the glossary noun never appears in the product.

**Recommendation: update the glossary, not the UI.** "Lists" is the better surface word: shorter
tab, and the surface unions hand-made Checklists with the booking Smart List. Mirror the
Pass/dislike pattern — add to the Checklist entry: *"surfaced as 'List' in nav and UI copy."*
**[Scott's call]**

### 2.2 Goal detail says "plans" for linked Items — the only hard avoid-list violation in copy
`goals/[goalId]/+page.svelte:91-95` ("linked plan(s)", "Link more plans", "link a plan below"),
`:105` ("Plans addressing it"), `:145` ("No **plans** linked yet. Link an **item**…").
"plan" is on Item's Avoid list. Origin is `V4_GROUP_INPUT_PRD.md:460` ("trace the wish down to the
plans addressing it") — a sentence that also used the deprecated "wish", which got cleaned (#92)
while "plans" survived.

Two defensible directions:
- **Align UI to glossary**: s/plan(s)/item(s)/ — five strings, one file.
- **Sanction "plan" here**: it reads warmer for a novice tracing a goal ("plans addressing it" is
  genuinely nice English). If so, amend Item's Avoid note: *"'plan' permitted in goal-traceability
  copy only."*

Either way, `:145` mixing "plans" and "item" in one sentence is a bug — same noun both halves.
**[Scott's call on direction; the mixed sentence should change regardless.]**

### 2.3 Mode-switch door has two names
The same conceptual door is labeled "Trip view" on the ModePill (`ModePill.svelte:21`) and
"Trip Mode" on the overview banner button (`trips/[slug]/+page.svelte:100`). Reverse direction is
"Edit plan" — which brushes Planning Mode's avoided "edit mode" and never says "plan(ning) mode".
Glossary mode names: Planning Mode, Trip Mode.

**Recommendation:** unify on the glossary nouns — pill says "Trip Mode" / "Planning" (or "Plan").
If Scott prefers verb-y pill labels for tap-affordance, record them in the glossary entries the
way Pass/dislike is recorded. **[Scott's call]**

### 2.4 "Offline member" vs Placeholder Member
`members/+page.svelte:216` "Add offline member", `:118` "(offline)" badge. Not avoid-listed
("ghost member, stub"). "Placeholder" is developer vocabulary; "offline" tells a novice *why*
this person has no avatar and can't log in. The join/claim flow already avoids the jargon
("Were you already added to this trip?").

**Recommendation: update the glossary** — Placeholder Member entry gains *"surfaced as 'offline
member'"*. One wrinkle: a Departed Member is mechanically a placeholder variant but must never
read as "offline" — code already renders those under "Former members" instead, so the rule holds.
**[Scott's call]**

### 2.5 Closeout verbs: Done / Swap / Skip vs done / considered
Glossary (Closeout, Item Status): every planned item gets **done or considered**; phase-end
review of unplanned items (keep-for-archive / remove / bulk auto-consider). Shipped UI
(`CloseoutItemRow.svelte:102-122`): **Done** (status=done), **Swap** (mark considered + quick-add
replacement), **Skip** ("leave as planned" — writes nothing). Summary
(`closeout/+page.svelte:119-128`): "Skipped (stayed planned)", "Swapped (considered)" — the
glossary's own status word appears only inside parentheses, translating UI language back to
domain language.

This is a glossary↔code drift, D6 territory: either the Closeout entry should document the
surfaced verbs (Done/Swap/Skip) and the fact that "skip" leaves items planned, or the UI should
adopt "considered" language. The verbs are friendlier; the entry is stale either way.
*(The missing keep/remove unplanned review is a feature-gap for the main audit, not terminology —
noted here only because the glossary describes UI that doesn't exist.)*
**[Scott's call — my lean: keep the verbs, fix the glossary entry.]**

---

## 3. Minor consistency notes (P3, no decision needed)

1. **Parking Lot label split**: "Parking lot" (phase detail `phases/[phaseId]/+page.svelte:163`,
   `ParkingDivider.svelte:35`, `ParkingLotSection.svelte:140`) vs "Ideas" (ContextRail
   `ContextRail.svelte:168`). Both glossary-sanctioned; novice lens still meets two names for one
   list on adjacent surfaces. Worth one sentence in the glossary deciding which is the *label*
   and which is *explanatory copy* (phase-detail empty state already bridges them well: "No ideas
   yet. Add one to start a parking lot for this phase.").
2. **"Upcoming" vs "Next 3 Days"**: same page, NavBar title vs sub-tab label
   (`today/upcoming/+page.svelte:30,43`). Pick one ("Next 3 Days" is the more honest label).
3. **"Transport" vs "Transportation"**: budget category label (`budget/+page.svelte:21`) vs item
   type label (`item-fields.ts:108`). Different concepts, same word family — full word in both
   places costs nothing.
4. **"Unscheduled"** day-select option (`ItemForm.svelte:410`): no glossary word exists for
   "item without a day". Candidate: "No day yet". Low stakes; only flag is vocabulary collision
   with unplanned/Anytime.
5. **Role casing**: `titleCase('co_owner')` → "Co Owner" (`trips/[slug]/+page.svelte:90`) vs
   hand-mapped "Co-Owner" (`invite/[code]/+page.svelte:16`, `claim/+page.svelte:16`). Hyphenate in
   `titleCase` callers or special-case the map.
6. **Trip Mode nav tab "Docs"** vs glossary's "(Now, Today, Add, Documents)" (`nav-tabs.ts:27` vs
   CONTEXT.md Trip Mode entry). UI is internally consistent ("Docs" both modes); fix the glossary
   sentence (D6).
7. **Dead `checklist` type label** (`item-fields.ts:112`): superseded Item Type still has a
   `typeLabel`; unreachable from the type picker. Ghost code, candidate for cleanup with a legacy-
   data check.

## 4. Confirmed clean (checked, no action)

Vote labels (Love/Like/Flexible/**Pass** — sanctioned), "Inbox" (sanctioned), AUTO chip ≠
"auto-list", "Needs booking"/"Booked" pills (sanctioned), "Cost" (sanctioned), "Confirmation
codes", "Settle Up", "Auto-approve traveler suggestions", "Former members" (sanctioned),
"Share a join link", join/claim copy (jargon-free), "Swipe-Quiz", **zero "wish" strings in src/**
(#92 clean), Time Slots (Morning/Afternoon/Evening/Anytime), Focus strings ("Free time",
"Nothing else planned", "Up next"), "Print itinerary" ("itinerary" avoided only as Trip synonym),
item type labels, AddSheet labels, Task copy ("tasks left", assignee), trips-index groupings.

## 5. Tally

- Avoid-list violations: **2** (goal-detail "plan(s)" ×3 strings; Documents subtitle "file(s)")
- Divergent, decision-worthy: **4** (Lists, offline member, ModePill labels, closeout verbs)
- Glossary-stale vs code (D6 fixes to CONTEXT.md): **3** (Trip Mode tab "Documents"→"Docs",
  Closeout entry vs shipped verbs/flow, plus whichever of §2.1/§2.4 resolves as glossary updates)
- Minor consistency: **7**
- Surfaces verified clean: **25+**

No P1/P2: nothing here forces the old stack, silences a contributor, or drops a seam — every
finding is P3 polish or a live-doc correction.
