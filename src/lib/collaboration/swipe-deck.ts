import type { ItemStatus } from '$lib/itinerary/types';
import { orderDayItems } from '$lib/itinerary/timeline';
import type { VoteValue } from './types';

/** px a drag must travel past to commit a vote (else it springs back). */
export const COMMIT_PX = 88;

/** Up-bias: a vote reads as Love (up) only when |dy| clears this fraction of |dx|. */
const UP_BIAS = 0.8;

/**
 * Map a drag vector to a directional vote, or null for no commit.
 * up = Love, right = Like, left = Pass (dislike); down is intentionally dead
 * (rubber-bands, never votes). Flexible is button-only and never returned here.
 */
export function voteFromIntent(dx: number, dy: number): Exclude<VoteValue, 'flexible'> | null {
	if (Math.abs(dy) > Math.abs(dx) * UP_BIAS) {
		return dy < 0 ? 'love' : null; // south = dead
	}
	return dx >= 0 ? 'like' : 'dislike';
}

// ── Flick release (#376) ──────────────────────────────────────────────────
//
// Release used to commit on distance alone (`hypot(dx,dy) > COMMIT_PX`), so a
// fast, confident flick that only travelled ~60px sprang back — which reads as
// "the app ignored me", the worst failure mode for a gesture. Distance is a
// proxy for intent; speed is the other half of it. A short-but-fast throw is
// unambiguous intent and now commits in the flick's direction.

/** px/ms the trailing pointer window must exceed for a short flick to commit. */
export const COMMIT_VELOCITY = 0.6;

/**
 * Trailing window velocity is measured over. Only the last ~80ms counts, and
 * that is the whole trick: a slow drag that ends in a flick still commits (the
 * slow part is outside the window), while a fast start that decays into a hold
 * does NOT (the fast part is outside the window).
 */
export const VELOCITY_WINDOW_MS = 80;

/**
 * Floor on total travel before the velocity path may fire. Without it a tap
 * with 3px of finger jitter over 5ms clears COMMIT_VELOCITY and casts a vote
 * the user never made — a strictly worse bug than the one #376 fixes.
 * A deliberate flick clears 24px trivially; a twitch does not.
 */
export const FLICK_MIN_PX = 24;

/** One pointer position in time. `t` is a monotonic clock (`performance.now()`). */
export interface PointerSample {
	x: number;
	y: number;
	t: number;
}

/**
 * Pointer velocity over the trailing `windowMs`, in px/ms.
 *
 * IMPORTANT: the caller must push a final sample at RELEASE (pointerup), not
 * just on move. The window is anchored to the last sample, so without a release
 * sample a gesture that moves fast and then holds still keeps reporting the
 * stale fast velocity — the hold produces no pointermove events to age it out.
 */
export function velocityOf(
	samples: readonly PointerSample[],
	windowMs: number = VELOCITY_WINDOW_MS
): { vx: number; vy: number; speed: number } {
	const still = { vx: 0, vy: 0, speed: 0 };
	if (samples.length < 2) return still;
	const last = samples[samples.length - 1];
	// Walk back to the oldest sample still inside the trailing window.
	let i = samples.length - 1;
	while (i > 0 && last.t - samples[i - 1].t <= windowMs) i--;
	const first = samples[i];
	const dt = last.t - first.t;
	if (dt <= 0) return still;
	const vx = (last.x - first.x) / dt;
	const vy = (last.y - first.y) / dt;
	return { vx, vy, speed: Math.hypot(vx, vy) };
}

/**
 * The release decision: which vote (if any) a drag release casts.
 *
 * Distance wins first — an unhurried drag past COMMIT_PX commits exactly as it
 * always did, so nothing about the existing feel changes. Under that distance,
 * a fast enough trailing flick commits along the FLICK's direction (not the
 * accumulated drag's), so "drag left, change your mind, throw right" votes
 * right. Direction always goes through `voteFromIntent`, so axis dominance and
 * the dead south quadrant are identical on both paths.
 */
export function commitFromRelease(
	dx: number,
	dy: number,
	samples: readonly PointerSample[]
): Exclude<VoteValue, 'flexible'> | null {
	if (Math.hypot(dx, dy) > COMMIT_PX) return voteFromIntent(dx, dy);
	if (Math.hypot(dx, dy) < FLICK_MIN_PX) return null;
	const v = velocityOf(samples);
	if (v.speed > COMMIT_VELOCITY) return voteFromIntent(v.vx, v.vy);
	return null;
}

/**
 * The pure deck builder behind the Swipe-Quiz harvest (and the shared SwipeDeck
 * substrate). No UI, no IO — see `swipe-deck.test.ts`.
 *
 * Order (#120 — supersedes Resolution 8's ordering): planned items FIRST in
 * itinerary order (day date asc; within a day, timed by start_time, untimed by
 * sort_order — same as `buildTimeline`), then the unplanned tail by
 * vote-quantity desc (count of *all* members' votes, not weighted score), ties
 * + zero-vote by creation time oldest-first.
 * Eligibility: in-scope phase, status planned|unplanned (done/considered are
 * closeout-only), not already voted by the current member.
 */

/** Statuses a card can carry. done/considered only exist post-trip (closeout). */
const ELIGIBLE_STATUSES: ReadonlySet<ItemStatus> = new Set<ItemStatus>(['planned', 'unplanned']);

/**
 * A trip item, narrowed to what the deck needs, decorated by the loader with the
 * all-members vote count plus the itinerary-position fields the order needs.
 * `created` is PB's fixed-width sortable string.
 */
export interface DeckCandidate {
	id: string;
	phase: string;
	status: ItemStatus;
	created: string;
	/** Count of every member's votes on this item (not the weighted score). */
	voteCount: number;
	/** Owning day's date (PB sortable string; "" when unscheduled). Drives planned itinerary order. */
	dayDate: string;
	/** Start anchor ("" when untimed). */
	start_time: string;
	/**
	 * End anchor ("" when unset). An end-only item is a deadline ("back by 6")
	 * and anchors AT its end — `orderDayItems` reads this via `itemAnchorTime`.
	 * Without it (#354) such an item fell to the untimed tail here while the day
	 * timeline placed it on the spine, so the two disagreed about the same day.
	 *
	 * REQUIRED, not optional, and deliberately so: `DayOrderable.end_time` is
	 * optional, so an optional field here let the loader silently stop passing
	 * it with both the tests and `pnpm check` still green — exactly how #354
	 * went unnoticed. Required makes the wiring compiler-enforced. Mirrors
	 * `Item.end_time`, which is a required string (PB stores "", never null).
	 */
	end_time: string;
	/** Manual order within a day. */
	sort_order: number;
}

/** Phase-scoped only in v4; `phaseOrder` drives the next-phase hand-off. */
export interface DeckScope {
	phaseId: string;
	phaseOrder: string[];
}

export interface BuiltDeck {
	queue: DeckCandidate[];
	/** Next phase in order that still has unvoted cards, or null. */
	nextPhaseId: string | null;
}

function isEligible(item: DeckCandidate, votedItemIds: Set<string>): boolean {
	return ELIGIBLE_STATUSES.has(item.status) && !votedItemIds.has(item.id);
}

/**
 * Resolution-8 comparator: vote-quantity desc, ties + zero-vote by creation
 * oldest-first. Drives the unplanned tail here, and the capture deck's reaction lane.
 */
function byVoteQtyThenOldest(a: { voteCount: number; created: string }, b: { voteCount: number; created: string }): number {
	if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
	return a.created < b.created ? -1 : a.created > b.created ? 1 : 0;
}

/** Day dates ascending; an unset day ("" — PB stores empty, never null) trails dated days. */
function byDayDate(a: string, b: string): number {
	if (a === b) return 0;
	if (!a) return 1;
	if (!b) return -1;
	return a < b ? -1 : 1;
}

/**
 * Planned items in itinerary order: group by owning day, days ascending (unset
 * trailing), then each day woven by `orderDayItems` (timed by time, untimed by
 * sort_order). Pure (no mutation).
 */
function orderPlanned(planned: DeckCandidate[]): DeckCandidate[] {
	const byDay = new Map<string, DeckCandidate[]>();
	for (const item of planned) {
		const group = byDay.get(item.dayDate);
		if (group) group.push(item);
		else byDay.set(item.dayDate, [item]);
	}
	return [...byDay.keys()]
		.sort(byDayDate)
		.flatMap((date) => orderDayItems(byDay.get(date)!));
}

/**
 * Deck order (#120): planned items first in itinerary order, then unplanned by
 * vote-quantity desc / creation oldest-first. Pure (no mutation).
 */
function orderCards(items: DeckCandidate[]): DeckCandidate[] {
	const planned = items.filter((i) => i.status === 'planned');
	const unplanned = items.filter((i) => i.status === 'unplanned');
	return [...orderPlanned(planned), ...unplanned.sort(byVoteQtyThenOldest)];
}

export function buildDeck(
	items: DeckCandidate[],
	myVotes: { item: string }[],
	scope: DeckScope
): BuiltDeck {
	const votedItemIds = new Set(myVotes.map((v) => v.item));

	const queue = orderCards(
		items.filter((i) => i.phase === scope.phaseId && isEligible(i, votedItemIds))
	);

	// Hand off to the next phase *in order* that still has at least one unvoted card.
	const fromIndex = scope.phaseOrder.indexOf(scope.phaseId);
	let nextPhaseId: string | null = null;
	if (fromIndex !== -1) {
		for (const phaseId of scope.phaseOrder.slice(fromIndex + 1)) {
			const hasCards = items.some((i) => i.phase === phaseId && isEligible(i, votedItemIds));
			if (hasCards) {
				nextPhaseId = phaseId;
				break;
			}
		}
	}

	return { queue, nextPhaseId };
}

/**
 * Where the swipe deck would launch for the current member, and how many cards
 * are still unrated — the cheap "is there votable content?" check the overview's
 * adaptive onboarding CTA (#275) and the Goals/Phases launch doors (#207) share.
 *
 * Votable = an item the member hasn't voted on yet whose status is planned|
 * unplanned (same eligibility as `buildDeck` — done/considered are closeout-only).
 * `phaseId` is the FIRST phase, in `phaseOrder`, that still has ≥1 such card (where
 * the deck kicks off), or null when nothing is left to rate. Pure (no IO).
 */
export function firstVotablePhase(
	items: Pick<DeckCandidate, 'id' | 'phase' | 'status'>[],
	myVotes: { item: string }[],
	phaseOrder: string[]
): { phaseId: string | null; unratedTotal: number } {
	const votedItemIds = new Set(myVotes.map((v) => v.item));
	const unratedByPhase: Record<string, number> = {};
	let unratedTotal = 0;
	for (const it of items) {
		if (!ELIGIBLE_STATUSES.has(it.status) || votedItemIds.has(it.id)) continue;
		unratedByPhase[it.phase] = (unratedByPhase[it.phase] ?? 0) + 1;
		unratedTotal++;
	}
	const phaseId = phaseOrder.find((p) => (unratedByPhase[p] ?? 0) > 0) ?? null;
	return { phaseId, unratedTotal };
}

// ── Capture deck (goal wizard) ─────────────────────────────────────────────
//
// The capture wizard runs on the same SwipeDeck substrate but interleaves two
// card kinds: REACTION cards (vote on others' goals → goal_votes) and PROMPT
// cards (type 0..n goals → trip_goals). Resolution 8: cards alternate 1:1
// reaction/prompt, degrading to all-prompts (a new trip's first member, no
// reactions) or all-reactions (prompts spent). Deterministic given inputs →
// unit-testable, exactly like buildDeck.

/**
 * A goal eligible to react to: one the member hasn't voted on and didn't create
 * (eligibility filtered by the loader). `voteCount` is all-members; `created` is
 * PB's fixed-width sortable string. Ordered here by Resolution 8.
 */
export interface ReactionCandidate {
	id: string;
	voteCount: number;
	created: string;
}

/** A built card: a reaction (goal id) or a prompt (prompt id). */
export type CaptureCard = { kind: 'reaction'; id: string } | { kind: 'prompt'; id: string };

/**
 * Interleave reaction + prompt cards 1:1, starting with a reaction. When one
 * stream empties the other drains continuously (→ all-prompts / all-reactions).
 * Reactions are ordered by Resolution 8; prompts keep the caller's order (the
 * caller shuffles + does once-per-session dedup). Pure, no mutation.
 */
export function buildCaptureDeck(reactions: ReactionCandidate[], promptIds: string[]): CaptureCard[] {
	const ordered = [...reactions].sort(byVoteQtyThenOldest);
	const deck: CaptureCard[] = [];
	let ri = 0;
	let pi = 0;
	let wantReaction = true; // alternation starts on a reaction
	while (ri < ordered.length || pi < promptIds.length) {
		if (wantReaction && ri < ordered.length) {
			deck.push({ kind: 'reaction', id: ordered[ri++].id });
		} else if (!wantReaction && pi < promptIds.length) {
			deck.push({ kind: 'prompt', id: promptIds[pi++] });
		} else if (ri < ordered.length) {
			// prompt stream spent → drain reactions
			deck.push({ kind: 'reaction', id: ordered[ri++].id });
		} else {
			// reaction stream spent → drain prompts
			deck.push({ kind: 'prompt', id: promptIds[pi++] });
		}
		wantReaction = !wantReaction;
	}
	return deck;
}
