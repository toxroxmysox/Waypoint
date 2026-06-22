# ADR-0017: AI is an assistant over owned trip data, never a generator of the trip — local-first, opt-in

**Status:** Proposed (awaiting Scott's ratification)
**Date:** 2026-06-21
**Deciders:** Scott
**Context:** `docs/CAPABILITY_MAP_REVIEW_2.html` (council pass-2 opportunity horizon, 2026-06-21) → `docs/CAPABILITY_MAP.md` §1.92 Pass-2 note → `docs/BUILD_PLAN.md` S3 (#264). The council endorsed a cluster of **local-AI *assist* surfaces** — sentiment summary, packing-list draft, booking-extraction-from-email, conflict surfacing, "when's our flight", expense categorization — but gated **all of them** behind "a zero-code AI-assist posture ADR (local-first); must precede any AI surface." Without this ADR, the keystone questions — which model, where it runs, what it's allowed to touch, what it's allowed to *do* — get decided implicitly by whoever ships the first surface, against Scott's open-source-first rule and over the most PII-dense data Waypoint holds (faces per ADR-0007, member emails, finances). This is a **posture**, not an implementation: it draws the assist-vs-generate line and the privacy/runtime constraints so the six surfaces can be sliced safely. It builds **no AI** and picks **no specific model/runtime** in depth.

## Decision

### 1. The assist-vs-generate line

AI in Waypoint may **assist over data the group already owns**. It may not **generate the trip**.

**Assist (allowed):** summarize, extract, classify, surface, and answer-over **existing** trip data the members put there. The AI reads what the group already entered and gives it back in a more useful shape. Every assist output is a **suggestion the user accepts, edits, or ignores** — never a silent write.

**Generate (off the table):** producing trip content the group did not supply — destinations, itineraries, day plans, "things to do." This is the charter NOT-list item **AI-generated itineraries** (`docs/app-audit/charter.md`; `CLAUDE.md` "Off the table"; charter "People-first, not AI-forward"). It does not move because of this ADR.

The mechanical test, in order:
1. **Source:** does the output derive *only* from data already in the trip? If it invents content the group didn't supply → **generate → forbidden.**
2. **Commit:** does it write on its own? If it auto-commits without human confirmation → **forbidden**, regardless of source. Every AI-touched write is human-confirmed (consistent with ADR-0014's "always opens an editable, dismissible prefill — never a silent write").
3. **Authority:** an assist output is a **draft or a highlight, never a decision.** The Vote mechanism (ADR-0004/0009), promotion, settle-up, and booking stay human acts. AI never casts a vote, promotes a candidate, settles a balance, or marks a booking.

### 2. Local-first / on-device is the default; proprietary API is an exception that must clear the bar

The **default runtime is a self-hosted small model** on infrastructure Waypoint controls (e.g. Ollama / llama.cpp on the home server — *named as direction, not ratified as the implementation*). Trip data — faces, emails, finances, free-text — does not leave Waypoint's trust boundary to be processed by a third party as a matter of course.

A **proprietary or hosted API is an exception**, not a fallback, and must clear the project's standing bar: it is permitted only when an open/self-hosted alternative is **significantly worse** for the specific surface (per `CLAUDE.md` "open-source first" and `docs/SPEC.md` §2 tech-stack discipline). Any such exception is decided **per surface, in that surface's own issue/ADR**, with the PII it would expose named explicitly. This ADR grants no blanket exception.

**Why local-first, not merely a preference:**
- **The data is the most sensitive Waypoint holds.** ADR-0007 already treats trip memory as capped, owned context; faces, member emails, and finances are exactly the categories that must not be shipped to a third party by default.
- **It matches the whole product's posture.** Waypoint is the local-first, privacy-preserving, no-one-returns-to-Splitwise tool. An AI surface that quietly exfiltrates the group's expenses to a hosted model breaks that promise more than any feature it adds.
- **Deciding it once, here, prevents the implicit decision.** Six surfaces across six capabilities with no node and no ADR means the first one shipped sets model/privacy/placement for all of them. This ADR is that decision, made deliberately.

### 3. Opt-in and privacy stance

- **AI assist is opt-in,** not on by default. A surface that processes trip data with AI is something the group turns on, not something that happens to them.
- **The LLM connector lives under Integrations & Syncing** (the enabling capability that already owns Places, AeroDataBox, Resend), alongside the other external/compute connectors — one place, one set of guardrails, not scattered per feature.
- **No new data category, no realtime.** Assist surfaces read existing collections and write human-confirmed rows through the normal form-action path. They do not introduce realtime subscriptions (`CLAUDE.md` PocketBase rules) and do not create a new PII store.

### 4. Which of the six surfaces this ADR unblocks

All six council-named surfaces are **assist, not generate**, and are therefore **unblocked to be sliced** (each still owns its own grill/plan/issue — this ADR removes only the posture gate, not the design work):

| Surface | Why it's assist (passes the test) |
| --- | --- |
| **Sentiment summary** | Summarizes existing comments/activity. Source = owned data; output = a read, human-interpreted. |
| **Packing-list draft** | Drafts a checklist the user then edits/accepts. A draft, not a committed list; pairs with Weather (backlog). |
| **Booking-extraction-from-email** | Extracts structured fields from a confirmation email the member pasted in. Extraction over supplied text; result is a prefilled, confirmable Item/Document (consistent with ADR-0016 codes→Documents intent). |
| **Conflict surfacing** | Surfaces/highlights overlaps already present in the data (double-booked, schedule clash). Highlight, never a fix it applies. |
| **"When's our flight" (NL Q&A)** | Answers a natural-language question over owned itinerary/travel data. Read-only answer, no write. |
| **Expense categorization** | Classifies an expense the user entered into a category. Classification suggestion on an existing row, user-confirmable. |

### 5. What this ADR rules out

- **AI-generated itineraries / destination suggestion / "things to do"** — stays on the charter NOT-list; this ADR reaffirms it. The date-finding wedge (S13) is explicitly bound by the same line: it *ranks group-supplied candidate windows, never auto-suggests destinations.*
- **Auto-committing AI** — no AI surface writes without human confirmation, even when the source is owned data.
- **AI as a decision-maker** — no AI vote, promote, settle, or book.
- **Hosted-API-by-default** — third-party model processing of trip data is per-surface, justified, and exceptional; never the silent default.

## Considered and rejected

- **No posture / decide per surface.** Rejected: that *is* the failure mode — model, privacy, and placement get set implicitly by the first surface to ship, against the open-source-first rule, over the most PII-dense data in the app.
- **Proprietary frontier API as the default runtime** (best quality fastest). Rejected as the default: it routes faces/emails/finances to a third party by default and breaks the local-first promise. Retained only as a *bar-clearing, per-surface exception.*
- **Allow AI generation but require a human to approve before commit.** Rejected: "approve a generated itinerary" is still AI-generated itineraries — the charter line is about *who authors the trip's content*, not about the commit gate. Human-confirm is a necessary guardrail on assist, not a license to generate.
- **A blanket model/runtime choice decided here.** Rejected as out of scope: this ADR sets the *posture* (local-first default, exception bar, assist-only, opt-in, Integrations-housed). The concrete model, quantization, and serving choice belong to the first surface's implementation, judged against this posture.

## Consequences

- **The six assist surfaces are unblocked** for slicing (grill/plan/issue per surface). BUILD_PLAN S3's gate is satisfied once Scott ratifies; nothing in the 2-week window blocked on this, and it did not gate Wave 1.
- **Email Digest write-back + narration (S15) is unblocked at the posture level.** Phase-1 dumb diff was always independent; LLM narration and tokenized one-tap write-back were explicitly gated on ADR-0017 (BUILD_PLAN S15, open question #6) — narration is read-over-owned-data assist, and write-back stays structured + human-initiated via signed token links, both inside this line.
- **Integrations & Syncing gains a planned LLM-connector node;** `docs/CAPABILITY_MAP.md` Integrations entry should note the local-AI connector as 🔵 planned, housed here.
- **Every future AI surface inherits four standing guardrails:** (1) assist-only, source = owned data; (2) local-first default, hosted API only as a justified per-surface exception; (3) opt-in; (4) human-confirmed, never a silent write, never a decision.
- **CONTEXT.md / charter:** the charter NOT-list ("AI-generated itineraries", "People-first, not AI-forward") is reaffirmed unchanged; this ADR is the affirmative companion that says what AI *may* do.
- **Status is Proposed** — Scott ratifies before any AI surface is sliced against it.
