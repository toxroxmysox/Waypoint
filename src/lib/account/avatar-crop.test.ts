import { describe, it, expect } from 'vitest';
import { coverScale, computeCropRect, maxOffset, type CropView } from './avatar-crop';

const base = (over: Partial<CropView> = {}): CropView => ({
	naturalWidth: 1000,
	naturalHeight: 1000,
	viewport: 300,
	zoom: 1,
	offsetX: 0,
	offsetY: 0,
	...over
});

describe('coverScale', () => {
	it('picks the larger ratio so the viewport is fully covered', () => {
		// Wide image: height is the tight axis → viewport/height wins.
		expect(coverScale(2000, 500, 300)).toBeCloseTo(300 / 500);
		// Square image scales uniformly.
		expect(coverScale(600, 600, 300)).toBeCloseTo(0.5);
	});
});

describe('computeCropRect', () => {
	it('centers a square source at zoom 1, no offset', () => {
		const { sx, sy, sSize } = computeCropRect(base());
		// scale = 0.3, sSize = 300 / 0.3 = 1000 → the whole square image.
		expect(sSize).toBeCloseTo(1000);
		expect(sx).toBeCloseTo(0);
		expect(sy).toBeCloseTo(0);
	});

	it('zoom shrinks the framed region toward the center', () => {
		const { sx, sy, sSize } = computeCropRect(base({ zoom: 2 }));
		// scale = 0.6, sSize = 500, centered.
		expect(sSize).toBeCloseTo(500);
		expect(sx).toBeCloseTo(250);
		expect(sy).toBeCloseTo(250);
	});

	it('drag offset shifts the framed region in the opposite direction', () => {
		const { sx } = computeCropRect(base({ zoom: 2, offsetX: 60 }));
		// scale = 0.6; centerX = 500 - 60/0.6 = 400; sx = 400 - 250 = 150.
		expect(sx).toBeCloseTo(150);
	});

	it('clamps so the source square never leaves the image', () => {
		const huge = computeCropRect(base({ zoom: 2, offsetX: 99999 }));
		expect(huge.sx).toBeCloseTo(0); // hard left edge
		const other = computeCropRect(base({ zoom: 2, offsetX: -99999 }));
		expect(other.sx).toBeCloseTo(500); // naturalWidth - sSize
	});

	it('never upscales source past the image on a non-square photo', () => {
		const r = computeCropRect(base({ naturalWidth: 1600, naturalHeight: 900, zoom: 1 }));
		// cover scale = 300/900; sSize = 900; fully inside height, centered in width.
		expect(r.sSize).toBeCloseTo(900);
		expect(r.sy).toBeCloseTo(0);
		expect(r.sx).toBeCloseTo((1600 - 900) / 2);
	});
});

describe('maxOffset', () => {
	it('is zero on a square image at zoom 1 (no slack to drag)', () => {
		const m = maxOffset({ naturalWidth: 800, naturalHeight: 800, viewport: 300, zoom: 1 });
		expect(m.x).toBeCloseTo(0);
		expect(m.y).toBeCloseTo(0);
	});

	it('grows with zoom', () => {
		const m = maxOffset({ naturalWidth: 800, naturalHeight: 800, viewport: 300, zoom: 2 });
		expect(m.x).toBeGreaterThan(0);
		expect(m.x).toBeCloseTo(m.y);
	});
});
