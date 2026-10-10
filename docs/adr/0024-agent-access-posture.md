# ADR-0024: A connected AI acts as the user, under a per-trip AI Access switch (default on); writes are chat-confirmed transcriptions

**Status:** Accepted (Scott, 2026-10-10)
**Date:** 2026-10-10
**Deciders:** Scott
**Amends:** ADR-0017 (AI assist posture)
**Context:** #412 (Claude MCP connector research); grill record `docs/plans/2026-10-10-mcp-reads/grill.md`. Waypoint gets a remote MCP server so members can query trips and enter decisions from their own Claude app. ADR-0017 was written for AI features *inside* Waypoint (per-trip, per-feature, default off, owner-gated, never marks a booking, every write human-confirmed in the app). A connector the user brings is a different shape: the AI is the user's own assistant, acting as them.

## Decision

### 1. The AI acts as the user
A [[Connection]] is personal. The user logs in with their own email code; the AI then acts **as that user with their Role**. Viewers read. A traveler's change to someone else's item becomes a Suggestion, exactly as in the app. No extra consent screen, no per-trip picker: identity is the login.

### 2. One per-trip switch, default on
**AI Access** is a single trip setting, owner/co_owner only, **default on**, including existing and archived trips. Off → the AI sees only the trip's name and dates plus "AI access is turned off for this trip by its owner"; nothing inside.
*Amends ADR-0017 §2* (default off, per-feature toggles). Why: the connector transcribes what the user already decided, it does not author the trip, so opt-out is enough; and a per-feature matrix has no meaning for a general assistant.

### 3. What the AI may write
AI may **record a decision the user explicitly states** — including booked, paid, done — and never infers or initiates one. *Amends ADR-0017 §1.3* ("AI never marks a booking"). The generate line is unchanged: no AI-authored itineraries, no AI choosing which ideas to promote or filling free days, no AI votes.

### 4. Confirmation is in chat
Writes are two-step: the AI shows a preview of the change in Waypoint's visual language (the item as a card, the changed field highlighted — not a code diff), the user says yes in chat, then it commits. The chat yes **is** the human confirmation ADR-0017 requires; there is no draft queue or confirm tap in Waypoint. Backstops: an audit log of AI writes with Recent AI changes → Revert, a server kill switch, no delete tools.

### 5. What never reaches the model
Emails (any member's, anywhere — including addresses typed into notes) and photos (memories, documents, avatars). Names are fine.

### 6. Runtime
Resolves ADR-0017 §3 for this surface only: the model is the user's own Claude (Anthropic cloud), chosen by the user, not run by Waypoint. Waypoint hosts only the MCP server, inside its existing container.

## Considered and rejected
- **Per-user consent screen with trip picker and read/write scope** (#412 draft). Rejected: login already establishes who; the trip switch covers the owner's say. Fewer screens.
- **Default off** (ADR-0017). Rejected for connectors: Scott wants it working on every trip without setup; owners can switch it off.
- **Confirm writes in Waypoint (draft queue).** Rejected: the point is speed from the phone; the chat yes plus revert is enough.
- **Hide off trips entirely.** Rejected: the AI saying "that trip has AI access off" is clearer than "no such trip".

## Consequences
- ADR-0017 still governs AI features built *into* Waypoint (digest narration, etc.); this ADR governs connected assistants.
- Every member of an AI-on trip has their notes and plans readable by any other member's Claude. Accepted: they can already read them in the app.
- The connector URL is bound to the host; the ADR-0020 cutover will require each user to re-add it.
