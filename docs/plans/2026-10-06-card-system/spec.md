# Spec: Card system — Waypoint 3.0 (snapshot of #418)

> **Snapshot** of GitHub issue #418, taken 2026-10-06 so svw plans and reviewers have a path to read. #418 stays canonical, and a change to either needs Scott.
>
> **Superseded since #418 was written:** its opening note says two areas still wait on Scott. Both were approved on 2026-10-06 (`docs/CARD_SYSTEM.md` §4 item 11): the item page (Planning and Trip Mode), Ideas for now with vote pills, and Skip's destination. No ticket carries `needs-info`.
>
> **Intent sources for every ticket in this release:** this file (user stories, implementation decisions, testing decisions, out of scope); `docs/CARD_SYSTEM.md` (D1–D13, the why); `CONTEXT.md` (glossary); `docs/adr/0011-item-card-avatars-denote-assignees.md` (amended), `docs/adr/0014-paid-moment-decoupled-from-booking.md`, `docs/adr/0016-codes-as-documents.md`; `docs/CARD_CONTENT_SPEC.md` (field → slot contract, amended per ticket). Ticket plans live beside this file as `<N>-<slug>.md`.

---

> Every rule below traces to a decision in the card system decision log (`docs/CARD_SYSTEM.md`, D1–D13), cited in brackets; a fidelity audit checked this spec against it. **Two areas still wait on Scott:** the item page layout (Planning and Trip Mode, shown to him on 2026-10-06) and trip mode's Ideas for now. They are marked, and their tickets carry `needs-info`. Existing actions the redesign never discussed are **kept as built** and named as such.

## Problem Statement

Waypoint shows an Item in about 23 different ways, built from 11 components and about a dozen inline snippets, and each one answers the same questions differently.

- **Time is unreliable.** On the day page the time prints twice, once in the Timeline Rail and once on the card. A deadline only reads correctly because the card spells out "Ends by". In Trip Mode a card shows only its start, so end times and deadlines disappear.
- **Colour means everything, so it means nothing.** Type tints, booked green, the overlap edge, the now accent and avatar colours all compete. The overlap edge never even renders.
- **Cards sprawl.** A loaded timeline card runs to seven rows. Glyphs come in 11 sizes.
- **People and preferences are muddled.** Votes show on planned cards, where they don't help, and not where ideas are actually weighed. The avatar slot sometimes means "who's going" and sometimes doesn't.
- **Now loses items.**
  - A start-only item disappears once it starts.
  - A past deadline shows twice.
  - The free-time countdown ignores deadlines.
  - When two things happen at once with different people, only one of them shows.
- **The item page is a long stack.** It is about 3,900px of one card per field, with the same controls for every role, including actions the server will refuse.

Planning a day or living it, a member can't trust a card to tell them when, where, who's going and what still needs doing.

## Solution

- **Four Card Shapes.** Every rendering of an Item is one of four: **Card**, **Hero**, **Row** or **Span**.
- **One set of rules across them:**
  - one anatomy per shape
  - one time grammar
  - one colour rule: colour only ever means "act on this"
- **The rail owns time.** On rail-hosted lists the Timeline Rail is the only place time prints: start on the card's top edge, end on its bottom edge.
- **Going means who's going,** with three states.
- **Votes appear only on unplanned ideas,** as tap-to-vote pills, and ideas sort by votes within type groups.
- **Now shows a Hero for every ongoing item.**
- **The item page becomes a Hero header** that carries what you need at the venue, with controls that follow who you are and what stage the item is at.
- **Desktop keeps the same cards** in a three-column frame.

## User Stories

### Planning a day (Planning Mode, day page)

1. As a planner, I want each item's time printed once, in the Timeline Rail, so that I'm not reading the same time twice.
2. As a planner, I want an item's start printed on its card's top edge and its end on the bottom edge, so that I can tell starts from ends at a glance.
3. As a planner, I want an end-only item (a deadline) to show just its time at the card's bottom edge, so that I can see it's due by then without extra words cluttering the rail.
4. As a planner, I want an untimed item to show a dashed type icon centred on its card and no time at all, so that I can tell it isn't pinned to a time.
5. As a planner, I want the type icon to sit on the rail, centred on its card, so that the card's text starts at its left edge and lines up from card to card.
6. As a planner, I want type icons to be one monochrome style, so that colour is free to mean something else.
7. As a planner, I want each card to show the title, then the best "where" for its type, then a strip of what needs attention and who's going, so that every card reads the same way.
8. As a planner, I want a card to grow only with its content and never with its duration, so that the day stays compact and two meals of the same length look the same.
9. As a planner, I want a card's cost on the right of its title, so that I can scan what the day costs.
10. As a planner, I want "Needs booking" shown as a gold pill on the card, so that open loops stand out.
11. As a planner, I want a booked item to say "✓ Booked" quietly, so that settled things don't compete with open ones.
12. As a planner, I want to see who's going as initials bubbles on the right of the card, so that I know who's doing what.
13. As a planner, I want someone who said they're not going shown as a struck-through bubble after the going ones, so that I know they've opted out, and I don't want to see people who haven't answered.
14. As a planner, I want two overlapping items both to say what they overlap ("Overlaps lunch", "Overlaps tee time"), so that I see the clash from either card.
15. As a planner, I want an overlap shown in red only when the same people are going to both items, so that red means a real conflict and not just two things happening at once.
16. As a planner, I want both clashing times on the rail to turn red in a real conflict (the earlier item's end and the later item's start), so that I can see exactly where they collide.
17. As a planner, I want a gap of an hour or more between a known end and the next start labelled on the rail ("2h free · 4:30p to 6:30p"), so that I can see where something could fit.
18. As a planner, I want Morning, Afternoon and Evening dividers centred, with a rule on either side, so that they read as section breaks and don't line up with nothing.
19. As a planner, I want stays and rentals shown as quiet full-width bands above the timeline, with their own day-by-day wording ("Night 2 of 3 · check-out Sat by 11:00a"), so that background context doesn't look like a step in the day.
20. As a planner, I want no vote counts on planned cards, so that the day shows decisions, not opinions.

### Weighing and placing ideas

21. As a planner, I want the day's ideas grouped under type headings (Activities, Meals, …) in a fixed order, so that I can find the kind of thing I'm looking for.
22. As a planner, I want idea cards without a type icon (the heading already says the type), so that they stay compact.
23. As a member, I want to vote on an idea right on its card by tapping Love, Like, Flexible or Pass, each showing its count, so that I don't have to open it.
24. As a member, I want my own vote shown filled, and tapping it again to remove it, so that I can change my mind.
25. As a planner, I want ideas sorted by the group's votes within each type, so that the favourite is on top.
26. As a planner, I want to drag an idea onto the day to plan it, so that placing things is direct.
27. As a planner, I want dragging an idea back among the other ideas to change nothing, so that the vote order stays the truth.
28. As a planner on a phone, I want to start a drag by long-pressing anywhere on the card, so that there are no grip handles to aim for.
29. As a planner on desktop, I want to drag with the mouse straight away, without a long press, so that it feels like a desktop app.
30. As a planner on desktop, I want valid drop places to highlight with what they offer ("Drop to plan · 2h free · 4:30p to 6:30p"), so that I know where an idea will land.

### The trip at a glance (overview)

31. As a planner, I want each day card's date centred on the card, so that it reads as a calendar block.
32. As a planner, I want a day card to say "1 needs booking" in gold instead of "2/3 booked", so that it names the thing to do.
33. As a planner, I want today's day card outlined in green in Planning Mode instead of a TODAY pill, so that today stands out without extra text.
34. As a planner, I want the stay line on a day card in plain ink, so that a stay doesn't look like something to act on.
35. As a planner, I want an empty day to say "Nothing planned yet" and offer to add something or drag an idea in, so that a blank day suggests a next step.

### Living the day (Trip Mode, Now)

36. As a traveler, I want the item happening now as a large Hero card with its title first, then where it is, then how long is left ("NOW · until 4:00p · 55m left"), so that I know where I should be and for how long.
37. As a traveler, I want a confirmation code on the Hero as a large row I can tap to copy, so that I can show or paste it at the counter.
38. As a traveler, I want the Hero to show who's going by name and whether it's booked, so that I know who I'm with.
39. As a traveler, I want every ongoing item to get its own Hero when several things are happening at once with different people, so that nobody's plan disappears from Now. (A Multi-day Item stays a Span. When the same people are on both items, see the next story.)
40. As a traveler, I want the Heroes for things I'm going to listed before everyone else's, then the rest by start time, with no conflict flags in Trip Mode, so that my own plan is on top and the live view stays calm.
41. As a traveler, I want "Coming up" to use the same rail and cards as the day page, so that times read the same way everywhere.
42. As a traveler, I want "Earlier today" items softly faded but still tappable, so that I can find a code or address I just used.
43. As a traveler with nothing on right now, I want a free-time card showing how long I have and what comes next by name ("FREE TIME · 25m · until Return rental clubs"), counting deadlines as well as starts, so that I don't miss something due soon.
44. As a traveler, I want each item to appear in exactly one place on Now (earlier, now or coming up), so that nothing vanishes or shows twice.
45. As a traveler, I want a start-only item that has started to stay "now" until the next item starts, so that it doesn't vanish while I'm there.
46. As a traveler, I want a deadline to move to Earlier today once its time passes, so that it shows once, in the right place.
47. As a traveler, I want the next three days shown with the same rail and cards, without costs, so that looking ahead reads like looking at today.
48. As a traveler, I want a booked item with a confirmation code to show `✓ {code}` as a small chip on its card in Trip Mode (with "+n" if there are several), and a booked item without a code to keep `✓ Booked`, so that I can grab the code without opening the item.
49. As an owner or co-owner in Trip Mode, I want Skip in the Hero's "⋯" menu, so that I can drop something that isn't happening.

### Lists (Rows)

50. As a member, I want every list (the booking and flights Smart Lists, money, Trip Documents' codes, a goal's linked items, tomorrow's preview, a forming trip's ideas, scenario picks) to use the same two-line row (an icon on the left, then the title, then the time and place underneath), so that every list reads the same way.
51. As a planner, I want the booking Smart List's checkbox to the left of the icon, so that checking things off is the leading action.
52. As a traveler, I want flight rows to keep the route visible when space runs out (dropping the arrival time first), so that I never lose where I'm going.
53. As a member, I want confirmation codes listed as plain rows with the code in monospace and a copy action, without gold, so that settled things look settled.
54. As a member, I want a goal's items headed "Linked items" and their status written in words ("Idea · Phase 1", "Planned · Thu Oct 1 · 6:30p"), so that I don't have to decode coloured pills.
55. As a traveler, I want a flight titled "Flight to Denver" by default, with the flight number and route on the place line ("UA 1234 · MKE → DEN"), so that the title says where I'm going.

### After the trip

56. As a member closing out a day, I want Done, Swap and Skip as three identical pills inside each row, with the date adjust for multi-day items kept as it is, so that none of them looks like the default.
57. As a member reading the record, I want each item's full description and no outcome stamp (everything in the record was done), and the things we considered as Rows grouped by type, so that the record reads like the trip did.
58. As a member reading the record, I want each day laid out on the same rail, read-only, so that it reads like the day did.

### The item page

59. As a member, I want the item page to open with a Hero: the icon beside the title, then the type and subtype in words ("Meal · Fine dining"), then the place, then the time in text form, so that the important facts are at the top.
60. As a member, I want the place line to open Maps, so that directions are one tap away.
61. As a traveler at the venue, I want codes, documents and the live "until …" line in the Hero, so that I don't scroll at the gate.
62. As a member who hasn't answered, I want the page to ask "Are you going?" with Going and Not going, so that joining is obvious.
63. As a member who has answered, I want to see "You're going · change", so that I can change my answer.
64. As an owner or co-owner, I want "Needs booking" to come with Book ↗ (the booking link) and Mark booked, so that the open loop is something I can close.
65. As a planner marking something booked, I want to add an optional confirmation code and choose to log what I paid next, which opens the normal Add expense already filled in (amount, payer, split all editable), so that booking and paying take a few taps but splits stay flexible.
66. As a member looking at an idea, I want my four vote pills and who voted what, plus "Add to a day" if I can plan it, so that I can weigh it and act.
67. As a member looking at a planned item I voted on (for example in the Swipe-Quiz), I want a quiet "Your vote: Love · change" line, so that I can still change it.
68. As an owner, co-owner or the item's creator, I want Edit visible in the header, so that my most-used action isn't hidden.
69. As a member, I want Move, Skip and Delete in a "⋯" menu that shows only the actions my role allows, so that I never tap something that fails. (The role gating itself is #416.)
70. As a member, I want an empty documents or checklist section shrunk to a one-line add button (sharing one line, "+ Document · + Checklist", when both are empty), so that comments aren't a screen away.
71. As a member, I want the comment box above the newest comment, so that I can reply without scrolling past the thread.
72. As a traveler in Trip Mode, I want Log payment just under the Hero once the item has started, and the planning details folded into "Plan details", so that the page fits what I'm doing.
73. As a desktop user, I want the item page in two columns (the Hero and details on the left; documents, checklist and comments on the right), so that I don't scroll a narrow strip on a wide screen.

### Swipe-Quiz and Suggestions

74. As a member in the Swipe-Quiz, I want the card to show its details without a tap (the place and cost, the date and time or "Unplanned", and the description), so that I can vote without opening anything (#405).
75. As a member in the Swipe-Quiz, I want "Added by Kim" and "Others' votes hidden until you vote" kept apart, so that they don't run together.
76. As an owner, I want a pending Suggestion to offer Approve, Edit and Reject, so that I can decide quickly.
77. As an owner editing a Suggestion, I want Reject, Save and Approve inside the edit view, with Save keeping my edits and leaving it pending, so that I can fix a suggestion before deciding.
78. As an owner, I want rejecting to still ask for a one-line note, so that the suggester learns why (as today).
79. As an owner, I want no role badge on a Suggestion, because "Suggested by Jess" already says who.

### Desktop

80. As a desktop user, I want cards to keep the same layout at any width, so that I don't have to learn two designs.
81. As a desktop user, I want ideas in the right-hand rail on the day page, grouped and sorted like on phones, so that I can drag them straight onto the day.
82. As a traveler on desktop, I want Now's right-hand rail to hold Ideas for now and tomorrow's rows, so that the content column stays on today.
83. As a desktop user, I want the right-hand rail's "Up next" to show each day's title, item count and any "needs booking", so that it tells me something instead of "Phase 1" five times.
84. As a desktop user, I want hover to make things quicker (a card lifts; a vote pill shows who voted) without hiding anything that isn't available elsewhere, so that touch users miss nothing.

### Everyone

85. As a screen-reader user, I want each card's accessible name to carry its time, title, type and state ("6:30 to 8:30 PM, Dinner at The Immigrant, meal, needs booking"), so that I hear what sighted users see.
86. As a member, I want every state chip to meet 4.5:1 contrast and every nested control to have a 44px hit area, so that cards work for everyone.
87. As a member, I want nothing told apart by colour alone, so that colour-blind members miss nothing.

### Actions the redesign keeps as built

88. As an owner or co-owner in Trip Mode, I want "Do this" on an idea in Ideas for now (Light Replanning), so that I can promote a backup into today.
89. As an owner or co-owner, I want to pull an idea up onto the day from its card, as today, so that planning works without dragging. (A traveler's primary action on idea cards stays deferred to #401, per D2.)

## Implementation Decisions

### Shapes [D1]
- Every Item rendering is one of four Card Shapes. Surfaces configure a shape; they never invent one.
  - **Card:** the working-list unit.
  - **Hero:** the Card enlarged for the item that *is* the moment. Used for the Now Focus, the Swipe-Quiz face and the item page header.
  - **Row:** a reference in a list.
  - **Span:** context, not a step. Used for Multi-day Items.
- An item's state marks a shape but never changes its layout. The states are the Item Status (unplanned, planned, done, considered), a Suggestion's pending, and the derived Ongoing / past / next.
- The Swipe-Quiz's gesture layer is the only bespoke piece left; its face is a Hero.

### Time grammar [D5, D9, D11]
- **Format:** `6:30p`, `10:30a`. The colon stays; the space and the "m" go.
- **On the rail:**
  - A start sits on the card's top edge and an end on its bottom edge.
  - An end-only item (deadline) shows a plain end label at the bottom, with **no `by`**.
  - An untimed item shows no time.
- **In text (Row, Hero, Span):**
  - start only: `9:30p`
  - range: `10:00a–12:00p`
  - deadline: `by 4:30p`
  - untimed: omitted
  - flights: `2:05p → 4:20p`
  - Text has no edge to carry the meaning, so an end time never appears without `by`.
- **Date prefix:** the booking list and Rows across days prefix the date (`Thu Oct 1 · 6:30p`).
- **Time shape:** items are classified as untimed, start-only, range or end-only. That one classification drives the rail, the text forms and the Now feed buckets.

### Timeline Rail geometry [D9, D7, D10]
- **Per-card layout:** each card's stretch of the rail is a centred time · icon · time stack, 48px wide, then 8px to the card (about 56px in all).
- **Spacing:**
  - 5px from each rule to its time text
  - 4px from the text to the segment
  - 4px from the segment to the icon disc
  - icon disc 24px with a 16px glyph
  - at least 3px side padding around labels
- **Leaders:** a rule *across* the time, level with the card edge: over the start label along the top edge, under the end label along the bottom edge.
- **Segments:** run only within an item, between its times and the icon. A segment shorter than 6px is dropped. There is no line between cards.
- **The icon node:**
  - monochrome (ink-soft glyph on surface-2 with a line ring), centred vertically on the card
  - dashed when untimed
  - Earlier today: outlined
  - the next item: no accent
  - On Now the accent belongs to the Hero alone
- **Card height:** a card with a time label is at least about 62px.
- **Time Slot dividers** (Morning / Afternoon / Evening) are centred on the screen with a rule on either side.
- **Free-time label:** when the gap between a known end (an end time or a deadline) and the next timed start is ≥ 60 minutes, the rail shows the text `2h free · 4:30p to 6:30p`. There is no line and no tap target, and screen readers hear "Free, 4:30p to 6:30p". A start-only item creates no gap.

### Card anatomy [D2, D8, D10]
- **Zones,** top to bottom; empty zones collapse:
  - **Head:** the title (2 lines max, then ellipsis) and one trailing value per job. In Planning Mode that value is the Item Cost; Trip Mode shows no cost. Idea cards carry the cost in their sub-line instead (`Sheboygan · $40`, per the approved mocks).
  - **Meta:** one line, the best "where" for the type:
    - location
    - flight: the flight number and route, `UA 1234 · MKE → DEN`
    - transport: its location
    - note: the first line of its description
  - **Strip:** info and pills on the left, people on the right.
- **Strip left, in priority order:**
  1. `Overlaps …` (Planning Mode only; red only when people are shared, otherwise ink)
  2. `Needs booking` (gold)
  3. in Trip Mode, a booked item with a code shows a `✓ {code}` chip (tap to copy, `+n` for several); otherwise `✓ Booked`
  4. the documents count

  When it overflows, the lowest-priority entry shrinks to its icon, then drops.
- **Strip right:** Going bubbles, at most 3, then `+n`.
- **Heights:** 1, 2 or 3 rows, plus one line if the title wraps. Duration never sets height.
- **No time on a card hosted by the rail.**
- **No votes on planned cards.**
- **No per-card join button.** Joining happens inside the item [D2]. The "+ Me" chips are retired by the ticket that ships the item page's Going question.
- **At most one primary action shows on the face** [D2]. On idea cards that is the owner's pull-up (kept as built).
- **The "⋯" menu** appears only on jobs with secondary verbs. In Trip Mode that is Skip, for owners and co-owners, on the Hero and on Coming up cards.
- **Off the face** (item page only): the subtype as text, the description (except notes and the record), free cancellation, the booking link, payment state, goals, comments and checklist progress.

### Colour [D10]
- Colour on an item means "act on this", and only that:
  - **Gold:** an open loop (`Needs booking`, `Pending`). Gold-deep is retuned from `#8a6f24` to `#745a1c`.
  - **Red:** a conflict where the same people are going to both items.
  - **Mode accent** (moss in Planning Mode, clay in Trip Mode): "now / your move". It marks the Hero (clay border, filled icon), today's day card (moss outline) and valid drop targets.
- Everything else is ink, told apart by glyph and word: type, settled states, people and votes.
- **Icon sizes:** a 16px bare glyph (Row, Span, group heading); a 24px disc with a 16px glyph (rail node); a 40px disc with a 26px glyph (Hero).
- **People:** neutral initials bubbles. The coloured avatar fallback is retired.
- **Collisions retired:** moss keeps only the planning accent, clay only the trip accent (plus primary actions), gold only open loops, and sky leaves item cards.

### Overlap [D10, D2]
- An overlap is computed as **pairs**: each item learns its partner and whether they share any Going member.
- Both items carry the note. It is red when people are shared, with both colliding rail times in red (the earlier item's end and the later item's start). With nobody shared it is a plain ink note.
- **Planning Mode only.** Trip Mode shows no conflicts at all: no note and no red, on Heroes or on cards (Scott, 2026-10-06).
- Overlap outranks Needs booking in the strip.

### Going [D4, D6]
- Assignment means who is going on or doing the item, and nothing else. The surfaced label is **"Going"**; the field keeps its name.
- **Three states:**
  - Going: a bubble
  - Not going: a struck bubble after the going ones, with no opacity and the letter at ≥ 4.5:1; its accessible name is "Kevin, not going"
  - No answer: not shown
- Not going needs #402's stored state; this spec depends on #402.

### Votes [D3]
- Votes show only on **unplanned** ideas, in these places:
  - the phase's Parking Lot (Phase Detail today; phase planning later, #401)
  - the day page's Parking Lot (mobile and tablet)
  - the desktop Ideas panel
  - Ghost Cards and pending Suggestions
  - the item page of an idea
  - the Swipe-Quiz (unchanged)
- **Form:** tap-to-vote pills under the sub-line, all four always shown (they are the buttons): Love, Like, Flexible, Pass, each with its count. The viewer's own vote is filled; tapping toggles it. No score is ever shown. Each pill has a 44px hit area, and the group's accessible name reads like "2 love, 1 pass, your vote love" [D10].
- **Sort:** ideas sort within each type group by the existing weighted score (2 / 1 / 0 / −2), with ties broken by sort order.
- **Drag only plans:** dragging within the ideas changes nothing, and a card dropped among ideas resolves to its vote position.
- **Planned items** stay in the Swipe-Quiz. Their item page shows one quiet "Your vote: Love · change" row; their cards show no votes.
- **Trip mode's Ideas for now** uses the grouped idea cards with vote pills (Scott, 2026-10-06). "Do this" stays its primary action.

### Ideas grouping [D7]
- Off the rail, idea cards carry **no** icon.
- Ideas are grouped under headings made of the icon plus the plural type label, in this fixed order: Lodging · Flights · Transportation · Activities · Meals · Notes.
- Grip handles are retired. On touch, a long-press anywhere on the card starts a drag.

### Span [D10, D11]
- A Multi-day Item renders as a full-width neutral (surface-2) band outside the timeline ("all-day" in the log means these bands; there is no separate all-day item). Its icon is the 24px disc, sitting where the rail's icons sit, and its title lines up with card titles. It is never dragged.
- **A stay, day by day:**
  - first day: `Check-in 3:00p · 3 nights`
  - middle days: `Night 2 of 3 · check-out Sat by 11:00a`
  - last day: `Check-out by 11:00a`
- **A rental car, day by day:**
  - first day: `Pick up 10:00a`
  - middle days: `Day 2 of 5 · return Sun by 12:00p`
  - last day: `Return by 12:00p`
- The solid moss and clay banners are retired.

### Row [D11]
- Two lines:
  - a 16px icon on the left
  - the title as the headline
  - the time and place (or date) as the sub-line, in the text grammar
  - a trailing slot (a chip, cost, chevron or people bubbles)
- **Leading actions** sit left of the icon, for example the booking list's checkbox.
- **Flights:** when the sub-line overflows, the arrival time drops first.
- **Closeout:** Done, Swap and Skip are identical bordered pills under the sub-line, inside the row, each with a 44px hit area. The date adjust for multi-day items is kept as built.
- **Also Rows** [D1]: a forming trip's idea rows (E7) and scenario picks (E8).
- **Confirmation codes:** a Row with the code in mono on the sub-line and a copy action, with no gold.
- **A Trip Goal's items:** headed "Linked items", with status in words and no coloured pills.

### Hero [D11, D10]
- **Layout, top to bottom:**
  - a 40px icon upper left, beside the title
  - the title
  - the place (with address)
  - `NOW · until 4:00p · 55m left`
  - codes as large tap-to-copy rows
  - `✓ Booked`, plus Going with names
  - `⋯` (Skip; owners and co-owners)
- **Accent:** a clay border and an accent-filled icon.
- **Several Heroes** (Scott, 2026-10-06): every ongoing timed item gets a Hero. A Multi-day Item never becomes a Hero; it stays a Span.
  - The viewer's items come first, then everyone else's, each group by start time.
  - No conflict shows, because Trip Mode shows none.
  - The free-time card shows only when nothing is ongoing.
- **Free-time card:** centred `FREE TIME`, then a large countdown, then `until {next item title}`. It counts to the next timed start **or deadline**, with no second line.
- **Swipe-Quiz face:**
  - the icon beside a Fraunces title
  - the place and cost
  - the date and time, or `Unplanned`
  - the description
  - `Added by Kim` on its own line
  - a divider, then a centred `Others' votes hidden until you vote`
  - no Details tap and no Planned / Idea pill
  - planned items stay in the Swipe-Quiz
- **Item page header:** see the item page section below.

### Now feed [D11, #392]
- The feed classifies items by time shape, and every item lands in exactly one bucket: Earlier today, ongoing (Heroes) or Coming up.
- The countdown target is the next timed start **or deadline**.
- A start-only item stays ongoing (a Hero, `NOW · since 1:00p`) until the next timed item starts, then moves to Earlier today (Scott, 2026-10-06).
- A deadline sits in Coming up until its time passes, then moves to Earlier today, with no overdue state (Scott, 2026-10-06).

### Earlier today [D10]
- Earlier-today items keep the full Card shape without the white fill, in ink-muted text (5.4:1, never opacity), with a lighter rail rule and an outlined node.
- They stay tappable.

### Overview day cards [D10]
- The date block is centred vertically.
- **Today** (Planning Mode only) gets a moss outline instead of the TODAY pill.
- The stay line is neutral ink with the lodging icon.
- `1 needs booking` is a gold pill and replaces `2/3 booked`.
- **Empty day:** the card says "Nothing planned yet · Add something, or drag an idea here". The day page shows a dashed panel with "+ Add item".

### Item page [D12, D13]
- **NavBar:** back, the trip name, Edit (visible to those who can edit, as built), and `⋯`. The `⋯` holds Move, Skip… and Delete, each shown only to roles the server allows; that gating builds on #416. Skip confirms in a sheet that keeps "Nothing is deleted" (Scott approved the `⋯` contents by role, 2026-10-06).
- **Hero header:**
  - the icon and title
  - the type and subtype in words
  - the place line as a Maps link
  - the time line in the text grammar
  - the status
  - code rows and document rows
  - Going
  - in Trip Mode while ongoing: the `NOW` line, a clay border and a filled icon
- **Needs booking** (owners, co-owners and the creator): `Needs booking · Book ↗ · Mark booked`.
  - Mark booked opens a sheet with an optional confirmation code and a "Log what I paid next" checkbox.
  - When ticked, Save then opens the **existing** Add expense, prefilled with the amount from the estimate, the current member as payer and the usual split, all editable.
  - Booked and paid stay separate (ADR-0014).
- **Going:** "Are you going? Going · Not going" until answered, then "You're going · change". Others' bubbles have names. All three states ship in this release (Scott, 2026-10-06), so #402 is in scope. The "+ Me" chips are retired at the same time.
- **Votes:**
  - On an idea: the four pills, who voted what, and "Add to a day" (primary, for those who can plan).
  - On a planned item: the quiet "Your vote" row in Details.
  - Never both votes and Going on one face.
- **Body:**
  - the description
  - one **Details** card of label/value rows: the cost estimate; Log payment or Paid $X as its own row, independent of any estimate; the booking link; cancellation; the phase; your vote (planned items)
  - Goals, if linked
  - an empty Documents or Checklist section as a one-line add button (`+ Document · + Checklist` when both are empty)
  - Comments, with the composer above the newest-first list
- **Trip Mode:** Log payment sits under the Hero once the item has started, and Details folds into "Plan details".
- **Desktop:** two columns at desktop widths [D13]: the Hero, description, Details and Goals on the left; Documents, Checklist and Comments on the right.
- **Copy:** "Assigned to" becomes "Going" [D4].

### Suggestions [D11]
- The Inbox card is the pending idea card: dashed, with a gold `Pending` chip, the vote pills, and a tray with **Approve / Edit / Reject**. The role badge is removed.
- **Edit** opens the Suggestion's edit view, whose actions are **Reject / Save / Approve**. Save stores the edits and leaves the Suggestion pending.
- **New server contract:** the Suggestions endpoint gains an update action that replaces a pending Suggestion's payload without changing its status. Owners and co-owners only, matching review.
- Rejecting still requires a one-line note (existing rule).

### Flights [D2 amendment]
- **Default title:** the flight lookup writes "Flight to {arrival city}". It falls back to the arrival airport code when the city is unknown, using the lookup API's municipality field.
- **New stored field:** the flight number needs its own field, in an append-only migration, because the title no longer carries it.
- **Place line:** `{flight number} · {from code} → {to code}`.
- **Existing flights** keep their titles; the place line uses the new field when present.

### Desktop [D13]
- **Frame** (as built): at ≥ 1280px, a 240px side rail, a 720px content column and a 320px context rail. From 900px, a 72px rail plus content.
- **Cards:** one card at any width.
- **Ideas:** in the context rail at ≥ 1280px; under the timeline below that.
- **Drag:** the mouse drags straight away; touch uses a long-press. Valid drop targets highlight in the planning accent with the gap they offer. The keyboard path is the item's "Add to a day".
- **Up next:** the context rail's list becomes mini day cards.
- **Hover:** a card lifts, and a vote pill's tooltip lists who voted. Nothing exists only on hover.

### Accessibility [D2]
- State chips meet 4.5:1 contrast.
- Nested controls get 44px hit areas: vote pills, code chips, Closeout pills, Going buttons, tray buttons.
- A card's accessible name carries its time, title, type and state.
- Nothing is told apart by colour alone.

### Schema and API changes
1. **Not going** (three-state Going): #402, its own issue and a dependency.
2. **The flight number** stored as its own field: an append-only migration (approved with the flight title, 2026-10-06).
4. **Not going (#402), as built in this release:**
   - Items gain a `not_going` relation list of trip members, beside `assigned_to`, in an append-only migration.
   - A member is in at most one of the two lists; the server keeps them exclusive.
   - The items update rule that lets a traveler change only their own id in `assigned_to` extends to `not_going`. The self-assign endpoint takes a target state (going / not going / no answer).
   - Viewers can't answer.
   - Departure clean-up, Suggestion approval and copying items treat `not_going` the way they treat `assigned_to`.
3. **The Suggestions endpoint's update action:** save without approving.

No other schema changes.

## Testing Decisions

- **What counts as a good test:** assert behaviour a member would notice (what time a card shows and where, which bucket an item lands in, which pill is filled), never markup structure or class names.
- **Seams:** the existing pure derivation modules, the existing Playwright suites, and screenshot proof. No new seams.
  - **Time formatting** (existing unit tests): the text grammar for every time shape, flights, and date prefixes.
  - **Timeline derivation** (existing): time-shape classification, overlap pairs with partner and shared-people flags, and free-time gaps (from a known end or deadline, a 60-minute threshold, and no gap after a start-only item).
  - **Now feed derivation** (existing, the #392 home):
    - every item lands in exactly one bucket
    - several ongoing items are all kept, yours first and then by start time, and Multi-day Items never become Heroes
    - the countdown targets the next start or deadline
    - a start-only item is ongoing until the next start, and a past deadline sits in Earlier today
  - **Multi-day derivation** (existing): the stay and rental day-by-day text.
  - **Day-card derivation** (existing): the needs-booking count, the stay line and the empty state.
  - **Voting and Parking Lot grouping** (existing): per-sentiment counts, the viewer's own vote, the type-group order, and the sort within groups.
  - **Playwright, critical paths only** (existing suites as prior art: timeline drag, parking idea votes, trip-mode views, contribution inbox / approve / reject, paid moment, confirmation codes, multi-day):
    - answering "Are you going?"
    - Mark booked through to a prefilled Add expense
    - tapping a vote pill on an idea
    - dragging an idea onto the day
    - a Suggestion's Approve / Edit (Save stays pending) / Reject
    - two Heroes on Now when two items are ongoing
    - always against the disposable PB (`pnpm test:e2e:clean`)
  - **Screenshot proof:** every UI ticket ships `pnpm verify:visual` shots at 375px and 768px, plus 1280px for desktop tickets. This is proof for review, not an assertion.
- **Trivial rendering CRUD is not tested** (project rule).

## Out of Scope

- **Phase planning mode** (#401). It reuses the idea card and the pending tray but is its own feature.
- **Desktop card variants** (#417, back burner).
- **Item page role gating** (#416), a separate bug fix that lands first.
- **The calendar-day timezone bug** in Closeout and the archive (#393), a separate bug fix.
- **A link-out to search** for "what is this?" (#406). It was never discussed in the card design.
- **Rejected:**
  - duration-scaled card heights (D8)
  - a sticky bottom action bar on the item page (D12)
  - owners setting other members' Going from the item page (raised by a reviewer, never agreed)
- **A personal "your free time"** that ignores other people's items. Not discussed; Now stays the group's day, and free time shows only when nothing is ongoing.
- **The Day-wrapped, Nothing-else-planned and No-itinerary Focus cards** keep their as-built look. D1's open question (whether the Span shape stretches to Now's state cards) stays open; only the free-time card changed (D11).
- **Colour outside Item Cards** (phase chips, money, navigation).

## Further Notes

- **Sources:**
  - Decisions and rationale: `docs/CARD_SYSTEM.md` (D1–D13, findings §2).
  - Visual reference: the before/after page of every surface (Scott's private artifact).
  - The field → slot contract `docs/CARD_CONTENT_SPEC.md` is amended by each ticket as its surface ships, per the existing convention.
  - The glossary (`CONTEXT.md`) and ADR-0011 were brought up to date on 2026-10-06. Still to change when the work ships: Focus may hold several Heroes, "Assigned to" becomes "Going", and `docs/design-system.md`'s tokens (gold-deep `#745a1c`; sky is no longer the multi-day colour).
- **Answers and absorbs** #388 (the time renders twice), #392 (the Now feed), #405 (swipe details). Depends on #402 (not going) and #416 (role gating).
- **Build and release plan** (Scott delegated it, 2026-10-06). One integration branch, one deploy, **Waypoint 3.0.0**.
  - **Step 0: set up.**
    - Scott reviews PR #415 (security, migration 0070), and it merges to `main` first.
    - `release/3.0` is cut from `main`.
    - PR #399 (invitations, plus the #400 fix) and the `docs/card-system` branch merge into it.
    - Every ticket's PR targets `release/3.0`.
  - **Waves:** a ticket starts when its blockers are done. Parallel sessions each use their own worktree and `E2E_SLOT`. Tickets touching the same page are chained in their "Blocked by".
    1. The prefactor; app version 3.0.0; #402 (Not going storage); #416 (role gating); #393 (time zone bug).
    2. The day page timeline, overview day cards, the Hero, Rows part 1; the item page header (after #416).
    3. Overlaps, ideas grouped, the empty day, the Trip Mode lists, the flight title, the record, the Swipe-Quiz face; the item page body.
    4. The free-time label, vote pills, several Heroes, "Are you going?", Span bands.
    5. The Now feed (#392), Mark booked, Ghost Cards and Suggestions.
    6. Rows part 2, item page votes; Ideas for now.
    7. The item page in Trip Mode, the desktop day page, desktop Now.
    8. Integrate and verify, then one PR from `release/3.0` to `main` and **the deploy, on Scott's word**: backup, migrations (0070, the flight number, `not_going`), tag `v3.0.0`.
