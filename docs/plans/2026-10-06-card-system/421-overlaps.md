# #421 overlaps: audit plan

Audit of every acceptance criterion against the code after #420/#429. Departure approved by Scott (2026-10-09): the note uses the partner's title clipped to 16 chars.

| Criterion | Status | Gap / action |
|---|---|---|
| `overlapPairs` returns pairs with partner title + shared | done (#420) | Unit-covered for 2 items. Gap: three-way. |
| Both strips show `Overlaps {partner}`, first in priority | done (#420) | `stripEntries` puts it first; unit-covered. Gap: a three-way picks the FIRST partner only. |
| Shared: red note + icon, red rail times (earlier end, later start) | partly | Gap: one `role` per item. Three-way: B is later vs A and earlier vs C, and A can be red vs C while its first partner B is ink. Fix: prefer a shared partner; add `redStart`/`redEnd` flags to `OverlapInfo`. |
| Nobody shared: ink, no red anywhere | done | Unit-covered; verified visually. |
| Shared = Going (`assigned_to`) only | done | `not_going` ignored. Add unit proof. |
| Untimed / start-only / end-only | done | Only start+end ranges pair. Unit-covered (start-only); add end-only. |
| Nothing in Trip Mode | done (#429) | Unit (`stripEntries`) + e2e `trip-mode-rail`. |
| verify:visual 375 + 768, both halves | to do | `VISUAL_SEED='{"rich":true}'` day 5. |
| CARD_CONTENT_SPEC 2a | to do | Add three-way rule. |

TDD: red tests for three-way (shared partner preferred; red flags per direction), then implement.
