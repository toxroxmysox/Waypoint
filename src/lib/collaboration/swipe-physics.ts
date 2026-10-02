import type { VoteValue } from './types';

// #376 / #381 — swipe GESTURE physics: when a drag or flick commits a vote, and
// which one. Split from swipe-deck.ts (deck ORDERING), which changes for
// unrelated reasons. Pure; see swipe-physics.test.ts.

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
