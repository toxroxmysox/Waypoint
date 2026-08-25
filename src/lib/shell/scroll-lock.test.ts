import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	lockBodyScroll,
	unlockBodyScroll,
	isBodyScrollLocked,
	__resetScrollLock
} from './scroll-lock';

// The suite runs in the `node` project (no DOM), so we stand up the narrowest
// possible stubs for exactly what scroll-lock.ts touches. The point of the test
// is the reference counting and the pathname guard — the algorithmic part that
// a screenshot cannot prove.

type BodyStub = { style: Record<string, string>; dataset: Record<string, string> };

let body: BodyStub;
let scrolledTo: Array<[number, number]>;

function setPathname(p: string) {
	(globalThis as Record<string, unknown>).window = {
		scrollY: (globalThis as unknown as { __scrollY: number }).__scrollY ?? 0,
		location: { pathname: p },
		scrollTo: (x: number, y: number) => {
			scrolledTo.push([x, y]);
		}
	};
}

function setScrollY(y: number) {
	(globalThis as unknown as { __scrollY: number }).__scrollY = y;
	const w = (globalThis as unknown as { window: { scrollY: number } }).window;
	if (w) w.scrollY = y;
}

beforeEach(() => {
	__resetScrollLock();
	body = { style: {}, dataset: {} };
	scrolledTo = [];
	(globalThis as Record<string, unknown>).document = { body };
	setScrollY(0);
	setPathname('/trips/spain-2025/expenses');
});

afterEach(() => {
	delete (globalThis as Record<string, unknown>).document;
	delete (globalThis as Record<string, unknown>).window;
	__resetScrollLock();
});

describe('lockBodyScroll', () => {
	it('pins the body at the current scroll offset', () => {
		setScrollY(420);
		lockBodyScroll();

		expect(body.style.position).toBe('fixed');
		expect(body.style.top).toBe('-420px');
		expect(body.style.overflow).toBe('hidden');
		expect(body.dataset.scrollLocked).toBe('true');
		expect(isBodyScrollLocked()).toBe(true);
	});

	it('restores the exact scroll offset on unlock', () => {
		setScrollY(420);
		lockBodyScroll();
		unlockBodyScroll();

		expect(body.style.position).toBe('');
		expect(body.dataset.scrollLocked).toBeUndefined();
		expect(scrolledTo).toEqual([[0, 420]]);
		expect(isBodyScrollLocked()).toBe(false);
	});
});

describe('reference counting', () => {
	it('keeps the body pinned while an outer overlay is still open', () => {
		setScrollY(100);
		lockBodyScroll(); // sheet
		lockBodyScroll(); // lightbox opened from inside it

		unlockBodyScroll(); // lightbox closes
		expect(body.style.position).toBe('fixed');
		expect(isBodyScrollLocked()).toBe(true);
		expect(scrolledTo).toEqual([]);

		unlockBodyScroll(); // sheet closes
		expect(body.style.position).toBe('');
		expect(scrolledTo).toEqual([[0, 100]]);
	});

	it('captures the offset from the FIRST lock, not a later nested one', () => {
		setScrollY(100);
		lockBodyScroll();
		// Body is pinned now, so window.scrollY reads 0 for any nested caller.
		setScrollY(0);
		lockBodyScroll();
		unlockBodyScroll();
		unlockBodyScroll();

		expect(scrolledTo).toEqual([[0, 100]]);
	});

	it('ignores an unbalanced extra unlock', () => {
		lockBodyScroll();
		unlockBodyScroll();
		scrolledTo = [];

		unlockBodyScroll();
		expect(scrolledTo).toEqual([]);
		expect(isBodyScrollLocked()).toBe(false);
	});
});

describe('navigation safety', () => {
	it('does NOT restore scroll when the overlay unmounted because we navigated', () => {
		setScrollY(600);
		lockBodyScroll();

		// A link inside the sheet navigated: the sheet unmounts on the new route.
		setPathname('/trips/spain-2025/items/abc');
		unlockBodyScroll();

		// Body is released...
		expect(body.style.position).toBe('');
		expect(body.dataset.scrollLocked).toBeUndefined();
		// ...but the new page owns its own scroll position.
		expect(scrolledTo).toEqual([]);
	});
});
