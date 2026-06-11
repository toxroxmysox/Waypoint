import { describe, it, expect, vi, afterEach } from 'vitest';
import { haptic } from './haptics';

// navigator is available in vitest's default jsdom-ish env via globalThis. We
// stub navigator.vibrate to assert wiring without real hardware, and delete it
// to simulate the iOS case (no Vibration API at all).

afterEach(() => {
	vi.restoreAllMocks();
	// @ts-expect-error — restore a clean slate between cases
	delete (globalThis.navigator as Navigator & { vibrate?: unknown }).vibrate;
});

describe('haptic', () => {
	it('fires navigator.vibrate with the named pattern when supported', () => {
		const vibrate = vi.fn().mockReturnValue(true);
		Object.defineProperty(globalThis.navigator, 'vibrate', {
			value: vibrate,
			configurable: true,
			writable: true
		});

		haptic('commit');
		expect(vibrate).toHaveBeenCalledExactlyOnceWith(10);

		haptic('success');
		expect(vibrate).toHaveBeenLastCalledWith([12, 40, 18]);
	});

	it('defaults to the commit pattern', () => {
		const vibrate = vi.fn();
		Object.defineProperty(globalThis.navigator, 'vibrate', {
			value: vibrate,
			configurable: true,
			writable: true
		});

		haptic();
		expect(vibrate).toHaveBeenCalledWith(10);
	});

	it('no-ops silently when vibrate is absent (the iOS case)', () => {
		// navigator exists but exposes no vibrate — exactly WebKit/iOS.
		expect('vibrate' in navigator).toBe(false);
		expect(() => haptic('commit')).not.toThrow();
	});

	it('never throws if vibrate itself throws', () => {
		Object.defineProperty(globalThis.navigator, 'vibrate', {
			value: () => {
				throw new Error('blocked by policy');
			},
			configurable: true,
			writable: true
		});

		expect(() => haptic('success')).not.toThrow();
	});
});
