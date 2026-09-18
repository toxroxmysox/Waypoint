import { describe, it, expect } from 'vitest';
import {
	clampPan,
	clampScale,
	doubleTapView,
	IDENTITY,
	isZoomed,
	MAX_SCALE,
	pinchView,
	releaseAction,
	TAP_SCALE,
	zoomAbout
} from './zoom';

// A 343×514 fitted boarding pass in a 375×724 stage (375px phone).
const img = { w: 343, h: 514 };
const stage = { w: 375, h: 724 };

describe('clampScale', () => {
	it('clamps to 1x..5x', () => {
		expect(clampScale(0.3)).toBe(1);
		expect(clampScale(3)).toBe(3);
		expect(clampScale(40)).toBe(MAX_SCALE);
	});
});

describe('clampPan', () => {
	it('pins an axis that fits the stage to centre', () => {
		expect(clampPan({ s: 1, x: 50, y: -50 }, img, stage)).toEqual({ s: 1, x: 0, y: 0 });
	});
	it('limits pan so the scaled edge cannot come inside the stage edge', () => {
		// 2x → 686 wide in 375: may travel (686-375)/2 = 155.5 either way.
		const v = clampPan({ s: 2, x: 999, y: 0 }, img, stage);
		expect(v.x).toBeCloseTo(155.5);
		// 2x → 1028 tall in 724: (1028-724)/2 = 152.
		expect(clampPan({ s: 2, x: 0, y: -999 }, img, stage).y).toBeCloseTo(-152);
	});
});

describe('zoomAbout', () => {
	it('keeps the focal point fixed on screen', () => {
		const f = { x: 60, y: -40 };
		const v = zoomAbout(IDENTITY, 2, f, img, stage);
		// Image point under f before: q = (f - t)/s = f. After: t + s·q must be f.
		expect(v.x + v.s * f.x).toBeCloseTo(f.x);
		expect(v.y + v.s * f.y).toBeCloseTo(f.y);
	});
	it('zooming about the centre does not pan', () => {
		expect(zoomAbout(IDENTITY, 3, { x: 0, y: 0 }, img, stage)).toEqual({ s: 3, x: 0, y: 0 });
	});
});

describe('pinchView', () => {
	it('scales by the finger spread ratio', () => {
		const v = pinchView(IDENTITY, { x: 0, y: 0 }, 80, { x: 0, y: 0 }, 240, img, stage);
		expect(v.s).toBeCloseTo(3);
	});
	it('clamps at MAX_SCALE and never below 1x', () => {
		expect(pinchView(IDENTITY, { x: 0, y: 0 }, 10, { x: 0, y: 0 }, 1000, img, stage).s).toBe(MAX_SCALE);
		expect(pinchView({ s: 2, x: 0, y: 0 }, { x: 0, y: 0 }, 200, { x: 0, y: 0 }, 20, img, stage).s).toBe(1);
	});
	it('the image point under the fingers follows their midpoint', () => {
		const start = { s: 2, x: 0, y: 0 };
		const v = pinchView(start, { x: 0, y: 0 }, 100, { x: 30, y: 20 }, 100, img, stage);
		expect(v).toEqual({ s: 2, x: 30, y: 20 });
	});
});

describe('doubleTapView', () => {
	it('zooms in to TAP_SCALE at 1x and back to identity when zoomed', () => {
		const z = doubleTapView(IDENTITY, { x: 0, y: 0 }, img, stage);
		expect(z.s).toBe(TAP_SCALE);
		expect(isZoomed(z)).toBe(true);
		expect(doubleTapView(z, { x: 10, y: 10 }, img, stage)).toEqual(IDENTITY);
	});
});

describe('releaseAction', () => {
	const both = { hasPrev: true, hasNext: true };
	it('pages on distance or flick, in the finger direction', () => {
		expect(releaseAction('x', -120, 0, both)).toBe('next');
		expect(releaseAction('x', 120, 0, both)).toBe('prev');
		expect(releaseAction('x', -25, -0.8, both)).toBe('next');
		expect(releaseAction('x', -25, 0.05, both)).toBe('none');
	});
	it('does not page past either end of the gallery', () => {
		expect(releaseAction('x', -200, -2, { hasPrev: true, hasNext: false })).toBe('none');
		expect(releaseAction('x', 200, 2, { hasPrev: false, hasNext: true })).toBe('none');
	});
	it('dismisses on a long or flicked downward drag only', () => {
		expect(releaseAction('y', 200, 0, both)).toBe('dismiss');
		expect(releaseAction('y', 60, 1, both)).toBe('dismiss');
		expect(releaseAction('y', 60, 0, both)).toBe('none');
		expect(releaseAction('y', -300, -2, both)).toBe('none');
	});
});
