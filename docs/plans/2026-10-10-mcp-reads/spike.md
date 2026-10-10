# MCP v3.1 spike: findings

Date: 2026-10-10 · Issue: [toxroxmysox/Waypoint#502](https://github.com/toxroxmysox/Waypoint/issues/502) · Grill: [grill.md](grill.md) · Code: branch `spike/502-mcp` (reference only, not for merge)

Setup: production build (`node`, not `vite dev`: SvelteKit skips CSRF in dev) on Scott's Mac → cloudflared quick tunnel (`*.trycloudflare.com`) → Claude web (add connector) + Claude iPhone app (connect, use). Throwaway PB on :8096 with one seeded trip owned by Scott; real Resend SMTP. In-memory OAuth store. Tools: `list_trips`, `get_day`, one MCP Apps card view.

## Verdict: go. Phone login works; plan as written holds.

| Question (grill "Spike first") | Result | How verified |
|---|---|---|
| Email-code login in Claude's in-app browser on iPhone | **Works** | Scott connected from the iPhone app; server log: authorize → requestOTP → code issued → token ok |
| CIMD vs DCR | **Claude uses CIMD** (claude.ai's add-connector dialog auto-detects it: "Use Claude's published identity") | Log: `client via cimd Claude`; no `/oauth/register` call. Client doc: `https://claude.ai/oauth/mcp-oauth-client-metadata`, redirect `https://claude.ai/api/mcp/auth_callback` |
| Token endpoint vs SvelteKit CSRF | **Real blocker, solved narrowly** | Token request is form-urlencoded with no Origin (log). SvelteKit prod 403s that (curl: no-Origin POST to `/login` → 403). Fix: fill an *absent* Origin for `POST /oauth/token` only (`scripts/mcp-spike-server.mjs`); foreign Origin still 403 (curl). Disabling CSRF globally was rejected as too broad |
| Refresh | **Works, with rotation** | 60 s access tokens: ~12 `refresh_token` grants, each rotating, zero 401s, no re-login; Scott's question 2+ min later answered |
| MCP Apps cards on iPhone | **Render** | Screenshots: trips + day cards, Waypoint palette, dark theme from host. Both clients declare `io.modelcontextprotocol/ui` / `text/html;profile=mcp-app` |
| Cloudflare bot protection | **NOT tested** | Quick tunnel runs on Cloudflare's zone, not `vandenwarsen.com`. Note: MCP calls come from Anthropic's backend (UA `python-httpx`, clients `Anthropic/ClaudeAI`, `Anthropic/Toolbox`), not the phone, so Bot Fight Mode / AI-crawler blocking on our zone is a real risk for `/mcp`, `/oauth/token`, `/.well-known/*` |

## Findings that change the v3.1 plan

1. **CSRF:** production needs the same narrow exemption. Cleanest home: a Caddy rule on `/oauth/token` (`request_header` sets Origin only when absent), or keep the node shim. The token endpoint reads no cookies; PKCE + single-use code protect it.
2. **Cloudflare zone check is a release task:** before v3.1 ships, confirm (or add a WAF skip rule) that Anthropic's backend reaches `/mcp`, `/oauth/*`, `/.well-known/oauth-*` on `app.vandenwarsen.com`. Test with the real host, not a quick tunnel.
3. **Authorize page gotchas (both bit the spike):**
   - SvelteKit re-runs `load` after a form action on the action URL (`?/requestOTP`), which drops the OAuth query. Carry the pending-request id in the form; don't re-validate query in that load.
   - `pattern="[0-9]{6}"` in a Svelte attribute: `{6}` is an expression → pattern `[0-9]6` → iOS "Match the requested format". Use `pattern={'[0-9]{6}'}` or none.
   - Plain form posts (no `enhance`) so the final 303 to claude.ai is a real navigation. Worked.
   - Hide the A2HS "Add to Home Screen" banner on `/oauth/*` (it showed in Claude's sheet).
   - Login must not set the web-app session cookie (spike used a fresh PB client). Kept.
4. **Per-tool approval prompt:** Claude asks once per tool ("Allow once / Always allow") despite `readOnlyHint`. Host behaviour, not ours. 11 tools = 11 first-use prompts; setup notes should say "set all tools to Always allow" in the connector settings.
5. **Posture leak** *(superseded 2026-10-10: Scott ruled timing advice is welcome; posture is now principle-based, see grill "Instructions")*: on Oct 9, unprompted, Claude flagged "order is off" and "no lodging" (fine, that's audit) and also suggested when to fit the kayak in (planning, ADR-0024 says no). Tighten `instructions` + tool descriptions: report gaps, never suggest timing or schedule.
6. **Claude calls `server/discover`** before `initialize` (unknown to SDK 1.32; returns method-not-found, Claude proceeds). Harmless; recheck with the SDK at build time.
7. **Hand-rolled MCP Apps view works.** ~3 KB HTML with a minimal `ui/initialize` → `ui/notifications/tool-result` postMessage loop; no need for the 400 KB `@modelcontextprotocol/ext-apps` bundle. One shared card view for all tools rendering `structuredContent { heading, cards[] }` is enough.
8. **Restart wipes in-memory OAuth** (expected): every restart forced a reconnect. The real build stores clients' grants/tokens in PB (hashed), per grill.
9. Minor: untimed items sort before timed ones in `get_day` (empty `start_time` sorts first). Use the app's existing timeline ordering.
