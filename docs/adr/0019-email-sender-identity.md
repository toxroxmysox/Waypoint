# ADR-0019: Transactional mail sends from `waypoint@send.vandenwarsen.com` (authenticated subdomain)

**Status:** Accepted
**Date:** 2026-06-29
**Deciders:** Scott
**Context:** #293 — OTP/invite emails were landing in spam. Diagnosed (not the transport): Waypoint sends via Resend (Amazon SES) `From: hello@vandenwarsen.com` (the **apex**), but the apex is unauthenticated for that sender — apex SPF is `v=spf1 include:_spf.mx.cloudflare.net ~all` (authorizes Cloudflare **inbound** routing, **not** Resend/SES), no Resend DKIM at apex, and **no DMARC record at all**. So every send fails SPF + has no aligned DKIM + no DMARC → modern Gmail/Yahoo bulk-sender rules junk it. The issue framed it as "route through my email or Cloudflare?" — both are wrong: Cloudflare Email Routing is **inbound-forward-only** (can't send app mail; the apex MX confirms it forwards to Scott's real inbox), and personal-Gmail SMTP caps volume + ties OTP to a personal account + drops domain branding.

## Decision

### Send from an authenticated **subdomain**, not the apex
Transactional mail (OTP, invites) sends `From: waypoint@send.vandenwarsen.com`. `send.vandenwarsen.com` is verified in Resend with its own SPF + DKIM, and carries a DMARC policy. The apex (`vandenwarsen.com`) and its Cloudflare inbound routing are left untouched.

### Shared sending subdomain + per-app local-part
The subdomain `send.vandenwarsen.com` is **reusable** across projects; each app varies the local-part (`waypoint@`, `<nextapp>@`). This is valid because mailbox providers authenticate on the **domain's** SPF/DKIM/DMARC, not the local-part — `waypoint@send.…` and `otherapp@send.…` both pass under one verified subdomain.

### DMARC starts at `p=none`, then tighten
DMARC record at `_dmarc.send.vandenwarsen.com` (scoped to the sending subdomain, so it never affects apex/CF-routed mail). Start `p=none` with an `rua` reporting address to monitor alignment; tighten to `p=quarantine` once reports confirm Waypoint's mail passes.

## Considered and rejected
- **Authenticate the apex, keep `hello@vandenwarsen.com`.** Rejected: couples app-sending reputation to the personal apex (a deliverability hiccup taints personal mail), and forces merging Resend's SPF `include` into the apex's single SPF record alongside Cloudflare's inbound-routing include. The subdomain isolates app mail from personal mail.
- **Cloudflare Email Routing as the transport.** Rejected: it's inbound forwarding only; it cannot send outbound app mail. (Common misconception — the issue's framing.)
- **Personal Gmail SMTP.** Rejected: low sending limits, ties OTP delivery to a personal account, loses `@vandenwarsen.com` branding.
- **Per-app subdomain (true reputation isolation), e.g. `waypoint.vandenwarsen.com`.** Rejected for now: at Scott's low personal-project volume, a shared `send.` subdomain is sufficient, and `waypoint.vandenwarsen.com` is wanted as an app URL (#97). Revisit only if a future app does bulk mail.

## Consequences
- **Reputation is shared per-domain, not per-mailbox** — all apps under `send.vandenwarsen.com` share one sender-reputation bucket. The isolation achieved is "apps vs. the personal apex," not "app vs. app." Acceptable at current volume; an app that ever sends bulk mail should get its own subdomain.
- **Send-only:** replies to `waypoint@send.vandenwarsen.com` are not received unless inbound routing/MX is later added for the subdomain. Fine for OTP/invites.
- No app code change — `smtp.pb.js` reads `RESEND_FROM`; only the env value flips (apex → subdomain) after the subdomain verifies in Resend. Same Resend API key sends from any verified domain on the account.
- **Sequencing matters:** verify the subdomain in Resend + publish the DNS records FIRST; flip `RESEND_FROM` only after, or sends from the not-yet-verified subdomain bounce/fail.
- Execution is partly infra (Resend dashboard verify + Cloudflare DNS records — Scott's, or via the CF API token in `caddy/.env`) + a one-line on-box env change + container restart.
