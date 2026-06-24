# ADR-0017: AI is an assistant over owned trip data, never a generator of the trip — opt-in, per-trip

**Status:** Accepted (ratified by Scott, 2026-06-22)
**Date:** 2026-06-21 (drafted) · 2026-06-22 (ratified)
**Deciders:** Scott
**Context:** `docs/CAPABILITY_MAP_REVIEW_2.html` (council pass-2 opportunity horizon, 2026-06-21) → `docs/CAPABILITY_MAP.md` §1.92 Pass-2 note → `docs/BUILD_PLAN.md` S3 (#264). The council floated a cluster of **AI *assist* surfaces** — sentiment summary, packing-list draft, booking-extraction-from-email, conflict surfacing, "when's our flight", expense categorization — and asked for a posture ADR before any of them ships. Without a posture, the keystone questions — what AI is allowed to *do*, who turns it on, and where it runs — get decided implicitly by whoever ships the first surface, over the most PII-dense data Waypoint holds (faces per ADR-0007, member emails, finances). This ADR is a **posture**, not an implementation: it draws the assist-vs-generate line and the control model. It builds **no AI**, and it deliberately **does not pick a model or runtime** — that is left to a future grill.

## Decision

### 1. The assist-vs-generate line (the core)

AI in Waypoint **helps travelers do what they want in the app — it does not choose what they should do.** It may **assist over data the group already owns**; it may not **generate the trip**.

**Assist (allowed):** summarize, extract, classify, surface, and answer-over **existing** trip data the members put there. The AI reads what the group already entered and gives it back in a more useful shape. Every assist output is a **suggestion the user accepts, edits, or ignores** — never a silent write.

**Generate (off the table):** producing trip content the group did not supply — destinations, itineraries, day plans, "things to do." This is the charter NOT-list item **AI-generated itineraries** (`docs/app-audit/charter.md`; `CLAUDE.md` "Off the table"). It does not move because of this ADR.

The mechanical test, in order:
1. **Source:** does the output derive *only* from data already in the trip? If it invents content the group didn't supply → **generate → forbidden.**
2. **Commit:** does it write on its own? If it auto-commits without human confirmation → **forbidden**, regardless of source. Every AI-touched write is human-confirmed (consistent with ADR-0014's "always opens an editable, dismissible prefill — never a silent write").
3. **Authority:** an assist output is a **draft or a highlight, never a decision.** The Vote mechanism (ADR-0004/0009), promotion, settle-up, and booking stay human acts. AI never casts a vote, promotes a candidate, settles a balance, or marks a booking.

### 2. Control model — AI is decided per trip, per feature

The on/off decision is **scoped to the trip**, not the user, not global:

- **Each trip independently turns AI on or off.** One group may run a trip fully AI-assisted; another turns it off entirely. There is no account-wide or app-wide AI switch that overrides the trip's choice.
- **Within a trip, the choice is granular per feature.** Turning "AI on" for a trip presents **clear per-feature toggles** — each individual assist surface (e.g. expense categorization, conflict surfacing) is separately enable/disable-able. A trip is never forced to take the whole bundle to get one surface.
- **Default off (opt-in).** AI that processes trip data is something the group turns on, not something that happens to them. A trip with no AI choice made = no AI.
- **Who sets it:** the trip-level setting is owner/co-owner gated (consistent with other trip-configuration controls); the per-feature shape is for the future grill to finalize.

*(No collection/field exists yet — the concrete data shape of the per-trip setting and per-feature toggles is left to the surface's own grill/PRD. This ADR fixes the* model *: trip-scoped, granular, opt-in.)*

### 3. Runtime (local vs cloud) is deliberately left OPEN

This ADR **does not decide where the model runs.** Local/self-hosted vs hosted/proprietary API is **deferred to a future grill**, decided when a concrete surface is on the table and the trade-off is real.

Inputs that grill must weigh (recorded here, not pre-decided): the data is the most sensitive Waypoint holds (faces, emails, finances); Waypoint's standing **open-source-first / privacy-preserving** posture (`CLAUDE.md`, `docs/SPEC.md` §2) is a strong prior toward local; against that, surface quality and operational cost. **No default runtime is set by this ADR** — so no surface may assume one. Whatever is chosen is justified in that surface's own issue/ADR, with the PII it would expose named explicitly.

### 4. The connector and its guardrails

- **The LLM connector lives under Integrations & Syncing** (the enabling capability that already owns Places, AeroDataBox, Resend) — one place, one set of guardrails, not scattered per feature.
- **No new PII store, no realtime.** Assist surfaces read existing collections and write human-confirmed rows through the normal form-action path. No realtime subscriptions (`CLAUDE.md` PocketBase rules), no new data category beyond the per-trip AI setting itself.

## Scope of the six surfaces — classified, then DEFERRED

The six council-named surfaces are all **assist, not generate** (they pass the test), so the posture *governs* them — but they are **not a near-term priority and are collectively deferred.** This ADR does **not** schedule them; each is revived later on its own, with its own grill/plan/issue, under this posture and the per-trip control model.

| Surface | Classification (all assist) |
| --- | --- |
| **Sentiment summary** | Summarizes existing comments/activity — a read, human-interpreted. |
| **Packing-list draft** | Drafts a checklist the user edits/accepts — a draft, not a committed list. |
| **Booking-extraction-from-email** | Extracts structured fields from a member-pasted confirmation email — prefilled, confirmable Item/Document. |
| **Conflict surfacing** | Highlights overlaps already present in the data — never a fix it applies. |
| **"When's our flight" (NL Q&A)** | Answers a NL question over owned itinerary data — read-only, no write. |
| **Expense categorization** | Classifies a user-entered expense — a suggestion on an existing row, user-confirmable. |

**Status: deferred.** Revisit when AI moves up the priority queue; nothing in the current build plan depends on them.

## What this ADR rules out

- **AI-generated itineraries / destination suggestion / "things to do"** — stays on the charter NOT-list; reaffirmed. The date-finding wedge (S13) is bound by the same line: it *ranks group-supplied candidate windows, never auto-suggests destinations.*
- **Auto-committing AI** — no AI surface writes without human confirmation, even when the source is owned data.
- **AI as a decision-maker** — no AI vote, promote, settle, or book.
- **A global or account-wide AI switch** — the on/off decision belongs to each trip, granular per feature; nothing overrides the trip's choice.

## Considered and rejected

- **No posture / decide per surface.** Rejected: that *is* the failure mode — what AI may do, who controls it, and where it runs get set implicitly by the first surface to ship.
- **Deciding the runtime (local vs cloud) here.** Rejected as premature — Scott's call: leave it open to a future grill when a concrete surface makes the trade-off real. Recorded the privacy/open-source priors so that grill starts from them, but set no default.
- **Allow AI generation but require a human to approve before commit.** Rejected: "approve a generated itinerary" is still AI-generated itineraries — the charter line is about *who authors the trip's content*, not the commit gate.
- **Scheduling the six surfaces now.** Rejected — Scott deprioritized them; they're deferred. The ADR classifies them so the line is clear when they return, but commits to none.
- **A global/per-user AI setting.** Rejected in favor of **per-trip, per-feature** — different groups want different things, and the data being processed is the trip's, so the trip owns the choice.

## Consequences

- **AI is a posture, not a roadmap item.** The six assist surfaces are **deferred**; no AI work is scheduled. When one is revived it inherits this line and the per-trip control model and gets its own grill.
- **Runtime stays an open question** — a future grill decides local vs cloud per surface; no surface may assume a default.
- **Email Digest is NOT gated on this ADR.** Email Digest (BUILD_PLAN S15) stands on its own — Phase-1 is a dumb structured diff with no AI, and the capability does not wait on any AI decision. If an *optional* AI narration is ever added, it is simply one more per-trip AI feature toggle under this posture — but the digest ships independently of AI. *(This reverses BUILD_PLAN S15 / decision-point #6's "narration gated on ADR-0017" coupling.)*
- **Integrations & Syncing gains a planned LLM-connector node** (🔵, deferred) — housed here when AI work begins.
- **Every future AI surface inherits four standing guardrails:** (1) assist-only, source = owned data; (2) opt-in and decided **per trip, per feature**; (3) human-confirmed, never a silent write, never a decision; (4) runtime justified per surface against the open-source-first/privacy prior (no assumed default).
- **The charter NOT-list** ("AI-generated itineraries", "People-first, not AI-forward") is reaffirmed unchanged; this ADR is the affirmative companion that says what AI *may* do, and who controls it.
