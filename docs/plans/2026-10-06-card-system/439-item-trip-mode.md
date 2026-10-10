# #439 Item page in Trip Mode: plan

Stories 61, 72 (36 for the NOW line grammar). Spec: Item page, Trip Mode. D12.

- Pure rule `tripModeView` (`item-page.ts`, Vitest): from trip active + item times + trip-local now -> `live` (reuses `heroStatus`, no second derivation), `started`, `logPaymentUnderHero`, `planDetails`.
- Trip Mode = `isTripActive(trip)` (loader returns `tripMode` and trip-local `now`; the page ticks every 30s like Now).
- Started: `now >= start_time`; no start_time -> the item's day is today or earlier; idea / no day -> not started.
- Live: started, planned/considered (not done, not an idea), and `heroStatus` non-null. Passed to the existing Hero `status` prop (clay border, filled icon, `NOW · until …`).
- Log payment under the Hero: started, nothing logged, `canLogPayment`. The payment row then leaves Details (no duplicate). Once paid, `Paid $X` stays a row inside Plan details.
- Plan details: in Trip Mode the Details card becomes a collapsed `<details>` titled `Plan details` (cost, booking link, cancellation, phase, Your vote). Planning Mode unchanged.
- No Hero docs change (documents already show in the Hero and in DocumentSection; not worsened).
- Visual: add `{item1}` / `{item2}` route tokens to verify-visual from the `now` seed (`nowItems`), screenshot live and not-started at 375/768.
- Amend `docs/CARD_CONTENT_SPEC.md` item-detail section.
