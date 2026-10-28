import { describe, it, expect } from 'vitest';
import {
	voteFromIntent,
	commitFromRelease,
	velocityOf,
	COMMIT_PX,
	COMMIT_VELOCITY,
	VELOCITY_WINDOW_MS,
	FLICK_MIN_PX,
	type PointerSample
} from './swipe-physics';

describe('voteFromIntent — gesture map', () => {
	it('right is Like', () => {
		expect(voteFromIntent(100, 0)).toBe('like');
	});

	it('left is Pass (dislike)', () => {
		expect(voteFromIntent(-100, 0)).toBe('dislike');
	});

	it('up is Love when clearly vertical', () => {
		expect(voteFromIntent(0, -100)).toBe('love');
	});

	it('down is dead — never a vote', () => {
		expect(voteFromIntent(0, 100)).toBeNull();
		expect(voteFromIntent(10, 100)).toBeNull();
	});

	it('up wins only when |dy| > |dx| * 0.8', () => {
		// steep enough → love
		expect(voteFromIntent(50, -100)).toBe('love');
		// shallow up-right → horizontal wins (like)
		expect(voteFromIntent(100, -50)).toBe('like');
	});

	it('a mostly-horizontal drag resolves to like/dislike, not love', () => {
		expect(voteFromIntent(100, -70)).toBe('like');
		expect(voteFromIntent(-100, -70)).toBe('dislike');
	});

	it('never returns flexible (button-only)', () => {
		const samples = [
			[100, 0],
			[-100, 0],
			[0, -100],
			[0, 100],
			[60, -60]
		] as const;
		for (const [dx, dy] of samples) {
			expect(voteFromIntent(dx, dy)).not.toBe('flexible');
		}
	});

	it('exposes the ~88px commit threshold', () => {
		expect(COMMIT_PX).toBe(88);
	});
});

// ── #376: flick velocity ──────────────────────────────────────────────────

/**
 * Build a sample track from `[x, y, t]` triples. The LAST entry stands for the
 * release sample the component pushes on pointerup — see `velocityOf`'s note on
 * why a release sample is mandatory.
 */
function track(points: readonly (readonly [number, number, number])[]): PointerSample[] {
	return points.map(([x, y, t]) => ({ x, y, t }));
}

describe('velocityOf — trailing-window pointer velocity (#376)', () => {
	it('is still with fewer than two samples', () => {
		expect(velocityOf([]).speed).toBe(0);
		expect(velocityOf(track([[0, 0, 0]])).speed).toBe(0);
	});

	it('is still when the window collapses to a single instant', () => {
		expect(
			velocityOf(
				track([
					[0, 0, 5],
					[40, 0, 5]
				])
			).speed
		).toBe(0);
	});

	it('measures px/ms over the trailing window', () => {
		const v = velocityOf(
			track([
				[0, 0, 0],
				[30, 0, 20],
				[60, 0, 40]
			])
		);
		expect(v.vx).toBeCloseTo(1.5);
		expect(v.vy).toBe(0);
		expect(v.speed).toBeCloseTo(1.5);
	});

	it('ignores samples older than the window — the slow lead-in of a drag-then-flick', () => {
		// 300ms of crawling, then a 60px throw in the last 40ms.
		const v = velocityOf(
			track([
				[0, 0, 0],
				[10, 0, 300],
				[20, 0, 600],
				[80, 0, 640]
			])
		);
		expect(v.speed).toBeCloseTo(60 / 40);
	});

	it('reports still for a burst that decayed into a hold before release', () => {
		// The release sample is what ages the burst out of the window.
		const v = velocityOf(
			track([
				[0, 0, 0],
				[30, 0, 10],
				[60, 0, 20],
				[60, 0, 400]
			])
		);
		expect(v.speed).toBe(0);
	});
});

describe('commitFromRelease — distance OR flick (#376)', () => {
	/** A leisurely drag: one sample every 200ms, so velocity is ~0 at release. */
	function slowTo(dx: number, dy: number): PointerSample[] {
		return track([
			[0, 0, 0],
			[dx / 2, dy / 2, 200],
			[dx, dy, 400],
			[dx, dy, 410]
		]);
	}

	it('still commits on distance alone, exactly as before', () => {
		expect(commitFromRelease(100, 0, slowTo(100, 0))).toBe('like');
		expect(commitFromRelease(-100, 0, slowTo(-100, 0))).toBe('dislike');
		expect(commitFromRelease(0, -100, slowTo(0, -100))).toBe('love');
	});

	it('a slow 60px drag still springs back — no vote', () => {
		expect(commitFromRelease(60, 0, slowTo(60, 0))).toBeNull();
	});

	it('a fast 60px flick commits (the #376 bug)', () => {
		const samples = track([
			[0, 0, 0],
			[20, 0, 10],
			[40, 0, 20],
			[60, 0, 30],
			[60, 0, 32]
		]);
		expect(commitFromRelease(60, 0, samples)).toBe('like');
	});

	it('a fast start that decays into a hold does NOT commit', () => {
		const samples = track([
			[0, 0, 0],
			[30, 0, 10],
			[60, 0, 20],
			[60, 0, 400] // release, long after the burst
		]);
		expect(commitFromRelease(60, 0, samples)).toBeNull();
	});

	it('a slow drag that ends in a flick commits', () => {
		const samples = track([
			[0, 0, 0],
			[10, 0, 300],
			[20, 0, 600],
			[80, 0, 640],
			[80, 0, 645]
		]);
		expect(commitFromRelease(80, 0, samples)).toBe('like');
	});

	it('flicks in the flick direction, not the accumulated drag direction', () => {
		// Dragged left, changed mind, threw right. The release vector is +30px.
		const samples = track([
			[0, 0, 0],
			[-40, 0, 300],
			[0, 0, 620],
			[30, 0, 640],
			[30, 0, 645]
		]);
		expect(commitFromRelease(30, 0, samples)).toBe('like');
	});

	it('applies the same axis dominance to a diagonal flick as to a drag', () => {
		// Up-left-ish throw, 78px total: |dy| clears |dx| * 0.8 → love, same as
		// voteFromIntent would say for a long drag of that shape.
		const samples = track([
			[0, 0, 0],
			[25, -30, 15],
			[50, -60, 30],
			[50, -60, 33]
		]);
		expect(commitFromRelease(50, -60, samples)).toBe(voteFromIntent(50, -60));
		expect(commitFromRelease(50, -60, samples)).toBe('love');
	});

	it('keeps south dead — a fast downward flick is not a vote', () => {
		const samples = track([
			[0, 0, 0],
			[0, 30, 10],
			[0, 60, 20],
			[0, 60, 25]
		]);
		expect(commitFromRelease(0, 60, samples)).toBeNull();
	});

	it('ignores a fast jitter shorter than the flick floor (tap protection)', () => {
		// 5px in 7ms clears COMMIT_VELOCITY, but it is a tap, not a throw.
		const samples = track([
			[0, 0, 0],
			[5, 0, 5],
			[5, 0, 7]
		]);
		expect(velocityOf(samples).speed).toBeGreaterThan(COMMIT_VELOCITY);
		expect(commitFromRelease(5, 0, samples)).toBeNull();
	});

	it('commits nothing on a release with no movement at all', () => {
		expect(commitFromRelease(0, 0, track([[0, 0, 0]]))).toBeNull();
	});

	it('pins the flick thresholds', () => {
		expect(COMMIT_VELOCITY).toBe(0.6);
		expect(VELOCITY_WINDOW_MS).toBe(80);
		expect(FLICK_MIN_PX).toBe(24);
	});
});
