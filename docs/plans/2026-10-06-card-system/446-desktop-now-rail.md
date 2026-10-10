# #446 Desktop Now: the context rail holds Ideas for now and tomorrow

> svw:executing-plans, inline. Approved by Scott 2026-10-06 (spec stories 80, 82, 84); no open question.

**Goal:** at >=1280px (`lg-desktop`, where `ContextRail` exists) Now's content column stays on today; Ideas for now (#432 `IdeasStrip`) and tomorrow's Rows (#434) move into the rail. Below 1280 and on phones nothing changes.

## Decisions
- `ContextRail` gets a Now branch (pathname `/trips/{slug}/now`) reading the Now load from merged `page.data`, the same plumb the day page's Ideas use. It replaces the generic Today / Up Next blocks there (today IS the content column).
- Tomorrow preview extracted to `TomorrowPreview.svelte`, used by the page and the rail (no fork).
- The page hides its in-column IdeasStrip door and tomorrow block with `lg-desktop:hidden` (CSS, not JS: matches how AppShell already splits trees).
- Doors: the page's Door 1/2 gating (free time / nothing else / just skipped) is page state the rail can't see. In the rail the strip is ambient reference (space is free), so it shows whenever the phase has ideas. The Door-2 "Replace it" heading is carried by a tiny shared `$state` (`now-rail.svelte.ts`) set from the page's `onskipped`.
- No new Vitest seam (pure layout wiring); proof = `verify:visual` at 375 / 768 / 1280. Existing Now e2e specs run at 375, where the rail is `display:none`.
- 44px hit areas: IdeasStrip's "Do this" and VotePills already meet it; Rows are 44px+.

## Steps
- [ ] `TomorrowPreview.svelte` + use in page
- [ ] `now-rail.svelte.ts`; page sets on skip
- [ ] page: `lg-desktop:hidden` wrappers
- [ ] `ContextRail`: Now branch
- [ ] CARD_CONTENT_SPEC section 2f
- [ ] check, unit, e2e:clean, verify:visual 375/768/1280
