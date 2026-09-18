import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	COMPLETE_MS,
	createNavProgress,
	DELAY_MS,
	FADE_MS,
	START_PROGRESS,
	TRICKLE_CAP,
	TRICKLE_MS,
	type NavProgressState
} from './nav-progress';

function setup() {
	const emitted: NavProgressState[] = [];
	const ctrl = createNavProgress((s) => emitted.push(s));
	return { ctrl, emitted };
}

describe('nav-progress (#363)', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('does not show before the delay', () => {
		const { ctrl } = setup();
		ctrl.start();
		vi.advanceTimersByTime(DELAY_MS - 1);
		expect(ctrl.state.phase).toBe('waiting');
		expect(ctrl.state.visible).toBe(false);
	});

	it('shows once the delay elapses', () => {
		const { ctrl } = setup();
		ctrl.start();
		vi.advanceTimersByTime(DELAY_MS);
		expect(ctrl.state).toMatchObject({ phase: 'running', visible: true, progress: START_PROGRESS });
	});

	it('a navigation that completes inside the delay never paints', () => {
		const { ctrl, emitted } = setup();
		ctrl.start();
		vi.advanceTimersByTime(DELAY_MS - 10);
		ctrl.done();
		vi.advanceTimersByTime(5000);
		expect(ctrl.state.phase).toBe('idle');
		expect(emitted.some((s) => s.visible)).toBe(false);
	});

	it('eases toward the cap while pending and never reaches it', () => {
		const { ctrl } = setup();
		ctrl.start();
		vi.advanceTimersByTime(DELAY_MS);
		let last = ctrl.state.progress;
		for (let i = 0; i < 200; i++) {
			vi.advanceTimersByTime(TRICKLE_MS);
			expect(ctrl.state.progress).toBeGreaterThan(last);
			last = ctrl.state.progress;
		}
		expect(last).toBeLessThan(TRICKLE_CAP);
		expect(last).toBeGreaterThan(TRICKLE_CAP - 0.01);
	});

	it('completion after showing snaps to 100%, fades, then goes idle', () => {
		const { ctrl } = setup();
		ctrl.start();
		vi.advanceTimersByTime(DELAY_MS + TRICKLE_MS * 3);
		ctrl.done();
		expect(ctrl.state).toMatchObject({ phase: 'completing', visible: true, progress: 1 });
		vi.advanceTimersByTime(COMPLETE_MS);
		expect(ctrl.state).toMatchObject({ phase: 'fading', visible: false, progress: 1 });
		vi.advanceTimersByTime(FADE_MS);
		expect(ctrl.state).toMatchObject({ phase: 'idle', visible: false, progress: 0 });
	});

	it('stops trickling once completed', () => {
		const { ctrl } = setup();
		ctrl.start();
		vi.advanceTimersByTime(DELAY_MS);
		ctrl.done();
		vi.advanceTimersByTime(COMPLETE_MS - 1);
		expect(ctrl.state.progress).toBe(1);
	});

	it('rapid back-to-back fast navs never paint', () => {
		const { ctrl, emitted } = setup();
		for (let i = 0; i < 5; i++) {
			ctrl.start();
			vi.advanceTimersByTime(DELAY_MS / 2);
			ctrl.done();
			vi.advanceTimersByTime(10);
		}
		vi.advanceTimersByTime(5000);
		expect(emitted.some((s) => s.visible)).toBe(false);
		expect(ctrl.state.phase).toBe('idle');
	});

	it('a nav started while the last one is finishing re-shows at once, with a width jump', () => {
		const { ctrl } = setup();
		ctrl.start();
		vi.advanceTimersByTime(DELAY_MS);
		ctrl.done();
		vi.advanceTimersByTime(COMPLETE_MS + 10); // fading
		ctrl.start();
		expect(ctrl.state).toMatchObject({
			phase: 'running',
			visible: true,
			progress: START_PROGRESS,
			animate: false
		});
		// The first nav's fade timer must not knock the second back to idle.
		vi.advanceTimersByTime(FADE_MS * 3);
		expect(ctrl.state.phase).toBe('running');
		expect(ctrl.state.animate).toBe(true);
	});

	it('start() while already pending does not restart the delay', () => {
		const { ctrl } = setup();
		ctrl.start();
		vi.advanceTimersByTime(DELAY_MS - 50);
		ctrl.start();
		vi.advanceTimersByTime(50);
		expect(ctrl.state.phase).toBe('running');
	});

	it('done() while idle is a no-op', () => {
		const { ctrl, emitted } = setup();
		ctrl.done();
		expect(emitted).toHaveLength(0);
	});

	it('destroy() cancels every timer', () => {
		const { ctrl, emitted } = setup();
		ctrl.start();
		ctrl.destroy();
		vi.advanceTimersByTime(5000);
		expect(emitted.some((s) => s.visible)).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});
});
