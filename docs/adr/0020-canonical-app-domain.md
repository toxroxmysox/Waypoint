# ADR-0020: `waypoint.vandenwarsen.com` is the canonical app URL; `app.` is a permanent redirect

**Status:** Accepted (decision); execution pending a manual cutover (see Runbook)
**Date:** 2026-06-29
**Deciders:** Scott
**Context:** #97. The app is served at `app.vandenwarsen.com` (Cloudflare Tunnel → `waypoint:8080`). `waypoint.vandenwarsen.com` already exists as a Cloudflare 301 redirect → `app.` (path-preserving). The build bakes the canonical URL as absolute build args (`PUBLIC_APP_URL`, `PUBLIC_PB_URL` in the box's `docker-compose.yml`); the client PocketBase SDK (`src/lib/shell/pb.ts`) uses `PUBLIC_PB_URL` as an absolute base for **every** call, so the app only works same-origin on its baked host. The issue asked for `waypoint.` to "function as the app url as well" — refined in discussion to: **make `waypoint.` the primary, with `app.` a permanent alias.**

## Decision

### `waypoint.vandenwarsen.com` becomes canonical
The app serves at `waypoint.vandenwarsen.com` (more on-brand than `app.`). `app.vandenwarsen.com` becomes a **permanent, path+query-preserving 301 → `waypoint.`**. The build bakes `PUBLIC_APP_URL=https://waypoint.vandenwarsen.com` and `PUBLIC_PB_URL=https://waypoint.vandenwarsen.com/pb`.

### Why not the alternatives
- **Keep `app.` canonical, `waypoint.` a vanity alias** (the issue's literal framing). Rejected: Scott wants `waypoint.` to be the address users actually see.
- **Truly serve at both hosts** (rebuild with a *relative* `PUBLIC_PB_URL=/pb`). Rejected: yields two independent login sessions (auth cookie is host-scoped) for no real gain, and is a code change vs. a config flip.

## Cutover runbook (one-time, manual — order matters)
The risk is a window where the app's baked host ≠ the host that serves it (→ cross-origin PB calls). Avoid it by sequencing:

1. **Cloudflare Tunnel:** add `waypoint.vandenwarsen.com` as a public hostname → `http://waypoint:8080` (same target as `app.`). Now it *can* serve. (Don't point users yet — PB URL is still baked to `app.`.)
2. **Rebuild + redeploy** (`docs/DEPLOY_RUNBOOK.md`) with the build args flipped to `waypoint.` (`PUBLIC_APP_URL` + `PUBLIC_PB_URL`). The app now self-references `waypoint.` same-origin.
3. **Immediately flip the Cloudflare redirect:** remove the `waypoint.→app.` rule; add `app.→waypoint.` (301, **preserve path + query** — old invite links are `app.../invite/<code>`). `waypoint.` now serves; `app.` redirects.

Optionally fold a `RESEND_FROM → waypoint@vandenwarsen.com` change into step 2's rebuild (mail still sends from the apex per ADR-0019 — `waypoint.` as the app host does not change the mail domain).

## Consequences
- **Code-free:** the canonical URL is build args + Cloudflare config; the in-image Caddyfile is host-agnostic (`:8080 {…}`) and serves either host unchanged. No repo logic change.
- **One-time re-login:** auth cookies are host-scoped, so existing `app.` sessions are dropped at cutover — sign in again at `waypoint.`.
- **`app.` redirect is PERMANENT, not temporary:** invite/OTP emails already delivered embed `app.vandenwarsen.com` (built from the old `PUBLIC_APP_URL`); the redirect must live indefinitely and preserve path/query so those links keep working.
- **HSTS preload** (#288/#312) should be submitted for `waypoint.vandenwarsen.com` (the new canonical) at hstspreload.org; `app.` only needs to keep redirecting.
- New invite/OTP links (built from `PUBLIC_APP_URL`) become `waypoint.` after the rebuild. Mail domain is unaffected (apex, ADR-0019) — `send.`/apex for mail vs `waypoint.` for the app stay cleanly separate.
