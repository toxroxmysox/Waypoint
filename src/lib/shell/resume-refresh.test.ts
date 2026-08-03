import { describe, it, expect } from 'vitest';
import {
	shouldRefreshOnResume,
	installResumeRefresh,
	RESUME_REFRESH_MS,
	type VisibilityDoc
} from './resume-refresh';

/**
 * A hand-driven stand-in for `document` + a stubbed clock. Deliberately NOT a
 * real browser: a headless/preview pane reports `visibilityState === 'hidden'`
 * and never ticks rAF, so eyeballing this logic in a pane proves nothing.
 * Synthetic transitions on a fake clock are the only honest proof.
 */
function fakeDoc(initial: 'visible' | 'hidden' = 'visible') {
	let state: string = initial;
	const listeners = new Set<() => void>();
	const doc: VisibilityDoc = {
		get visibilityState() {
			return state;
		},
		addEventListener: (_type, l) => void listeners.add(l),
		removeEventListener: (_type, l) => void listeners.delete(l)
	};
	return {
		doc,
		listenerCount: () => listeners.size,
		/** Flip visibility and fire `visibilitychange`, exactly like a browser. */
		go(next: 'visible' | 'hidden') {
			state = next;
			for (const l of [...listeners]) l();
		}
	};
}

function harness(opts: { start?: 'visible' | 'hidden'; online?: boolean } = {}) {
	const d = fakeDoc(opts.start ?? 'visible');
	let clock = 1_000_000;
	let calls = 0;
	const teardown = installResumeRefresh({
		doc: d.doc,
		now: () => clock,
		isOnline: () => opts.online ?? true,
		revalidate: () => void calls++
	});
	return {
		...d,
		teardown,
		calls: () => calls,
		advance(ms: number) {
			clock += ms;
		}
	};
}

describe('shouldRefreshOnResume — the 60s contract (#372)', () => {
	it('refreshes when the document was hidden longer than the threshold', () => {
		expect(shouldRefreshOnResume(0, RESUME_REFRESH_MS + 1, true)).toBe(true);
	});

	it('does nothing under the threshold — an app-switch blink is not an absence', () => {
		expect(shouldRefreshOnResume(0, RESUME_REFRESH_MS - 1, true)).toBe(false);
	});

	it('treats exactly the threshold as too short (strictly greater)', () => {
		expect(shouldRefreshOnResume(0, RESUME_REFRESH_MS, true)).toBe(false);
	});

	it('does nothing when we never saw the document go hidden', () => {
		expect(shouldRefreshOnResume(null, 10 * RESUME_REFRESH_MS, true)).toBe(false);
	});

	it('skips revalidation while offline', () => {
		expect(shouldRefreshOnResume(0, RESUME_REFRESH_MS + 1, false)).toBe(false);
	});

	it('pins the threshold at 60s', () => {
		expect(RESUME_REFRESH_MS).toBe(60_000);
	});
});

describe('installResumeRefresh — visibilitychange wiring (#372)', () => {
	it('does NOT revalidate when hidden for less than 60s', () => {
		const h = harness();
		h.go('hidden');
		h.advance(59_000);
		h.go('visible');
		expect(h.calls()).toBe(0);
		h.teardown();
	});

	it('DOES revalidate when hidden for more than 60s', () => {
		const h = harness();
		h.go('hidden');
		h.advance(61_000);
		h.go('visible');
		expect(h.calls()).toBe(1);
		h.teardown();
	});

	it('revalidates once per resume, not once per event', () => {
		const h = harness();
		h.go('hidden');
		h.advance(120_000);
		h.go('visible');
		h.go('visible'); // a spurious repeat event must not double-fire
		expect(h.calls()).toBe(1);
		h.teardown();
	});

	it('measures each absence independently — a long one then a short one', () => {
		const h = harness();
		h.go('hidden');
		h.advance(120_000);
		h.go('visible');
		expect(h.calls()).toBe(1);

		h.go('hidden');
		h.advance(5_000);
		h.go('visible');
		expect(h.calls()).toBe(1); // still 1: the second absence was a blink
		h.teardown();
	});

	it('stays silent while offline even after a long absence', () => {
		const h = harness({ online: false });
		h.go('hidden');
		h.advance(600_000);
		h.go('visible');
		expect(h.calls()).toBe(0);
		h.teardown();
	});

	it('counts a mount that happens while already hidden', () => {
		// A backgrounded launch: no hidden transition is ever observed, so without
		// seeding `hiddenAt` at install the first foreground would never refresh.
		const h = harness({ start: 'hidden' });
		h.advance(120_000);
		h.go('visible');
		expect(h.calls()).toBe(1);
		h.teardown();
	});

	it('teardown removes the listener and stops revalidating', () => {
		const h = harness();
		expect(h.listenerCount()).toBe(1);
		h.teardown();
		expect(h.listenerCount()).toBe(0);
		h.go('hidden');
		h.advance(600_000);
		h.go('visible');
		expect(h.calls()).toBe(0);
	});

	it('is a no-op under SSR (no document)', () => {
		expect(() => installResumeRefresh({ doc: undefined })()).not.toThrow();
	});
});
