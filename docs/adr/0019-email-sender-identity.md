# ADR-0019: Transactional mail sends authenticated from the apex `vandenwarsen.com`

**Status:** Accepted (revised 2026-06-29 — see "Revision")
**Date:** 2026-06-29
**Deciders:** Scott
**Context:** #293 — OTP/invite emails were landing in spam. Diagnosed (not the transport): mail is sent via Resend (Amazon SES) `From: hello@vandenwarsen.com` (apex), but the apex was **unauthenticated** for that sender — no Resend DKIM, no DMARC; the apex SPF (`include:_spf.mx.cloudflare.net`) authorizes Cloudflare **inbound** routing, not Resend. So every send failed authentication → junked. The issue framed it as "route through my email or Cloudflare?" — both wrong: Cloudflare Email Routing is inbound-forward-only (can't send), and personal Gmail SMTP caps volume + ties OTP to a personal account.

## Decision

### Authenticate + send from the **apex** `vandenwarsen.com`
Resend verifies the apex domain `vandenwarsen.com`:
- **DKIM** TXT at `resend._domainkey.vandenwarsen.com` (signs `d=vandenwarsen.com` → aligns with the apex `From`).
- **Custom MAIL FROM / return-path** on `send.vandenwarsen.com` (Resend auto-managed: `MX feedback-smtp.<region>.amazonses.com` + `SPF include:amazonses.com`) → SPF passes and aligns relaxed with the apex.
- **DMARC** — a single TXT at `_dmarc.vandenwarsen.com` = `v=DMARC1; p=none; rua=mailto:scottvh519@gmail.com`. Monitor-mode; tighten to `p=quarantine` after reports confirm clean.

`From` stays an apex address (`hello@vandenwarsen.com`, or `waypoint@vandenwarsen.com` for app-identification — both authenticate). No app code change — `smtp.pb.js` reads `RESEND_FROM`.

## Revision (why not the `send.` subdomain originally recommended)
The first draft of this ADR recommended a dedicated sending subdomain (`waypoint@send.vandenwarsen.com`) to isolate app-sending reputation from personal apex mail. That was **superseded once the actual Resend state was seen**:
1. **The Resend plan is one domain**, and the **apex was already fully verified** (DKIM live, return-path live). Cutting over to `send.` as a separate domain would burn the single slot and abandon a working verification for marginal gain.
2. **There is no personal apex *sending* to isolate from** — Scott's personal mail is Gmail; `@vandenwarsen.com` only ever sends app mail. The isolation argument evaporates.
The `send.vandenwarsen.com` records that exist are Resend's MAIL FROM/return-path plumbing **for the apex verification**, not a separate sending domain.

## Considered and rejected
- **Dedicated `send.` (or `mail.`) sending subdomain.** Rejected per the Revision: costs the single domain slot, abandons the verified apex, and isolates against a personal-apex-sending risk that doesn't exist at this scale.
- **Cloudflare Email Routing as transport.** Inbound-forward-only; cannot send. (The issue's framing.)
- **Personal Gmail SMTP.** Low limits, ties OTP to a personal account, loses domain branding.

## Consequences
- **Gotcha that bit us:** DMARC (like SPF) allows **exactly one** record per name. Cloudflare's "DMARC Management" auto-creates one; a manually-added second record makes receivers ignore DMARC entirely. Keep exactly one `_dmarc.vandenwarsen.com` TXT.
- App-send reputation is coupled to the apex domain — acceptable because the apex sends nothing but app mail.
- Auth chain (DKIM + SPF-via-return-path + single DMARC) verified live in DNS. Inbox-placement confirmation = a real test send (auth-pass ≠ guaranteed inbox if reputation was damaged; warms up over time).
- No redeploy strictly required (the From is already an apex address); an optional `RESEND_FROM` change to `waypoint@vandenwarsen.com` would ride the next rebuild.
