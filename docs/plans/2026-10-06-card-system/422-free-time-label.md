# #422 free-time label: audit plan

Audit after #420/#421/#429. Derivation (`freeTimeGaps`, `freeTimeLabel`, `freeTimeSpoken`) and `FreeTimeLabel` exist; the day page renders it. Gap: the Trip Mode rail lists (Now's Coming up, Next 3 days) don't.

| Criterion | Status | Action |
|---|---|---|
| >= 60 min label text | done (#420) | add edge tests: untimed items between, latest end wins across overlap, multi-gap, 59 min |
| Start-only creates no gap | done | add: range, start-only, range -> no gap after the start-only |
| Screen reader "Free, 4:30p to 6:30p" | done | unit-assert `freeTimeSpoken` |
| Day page | done | none |
| Coming up / Next 3 days | **missing** | render `FreeTimeLabel` before the closing card, gaps computed per list in display order |
| CARD_CONTENT_SPEC | to do | add section |
| verify:visual 375 + 768 | to do | `{"now":"rail"}` seed; day page |

Scope calls: Earlier today (past) gets no labels (planning cue, not history). Gaps never span lists. Now's free-time card (#431) untouched.

TDD: extra unit cases first, then wire the two Svelte lists.
