/**
 * Pure zoom/pan/swipe math for the DocumentLightbox (#371).
 *
 * Coordinate space: points are relative to the CENTRE of the image stage. The
 * image is laid out centred in the stage and transformed with
 * `translate(tx, ty) scale(s)` about its own centre, so an image-local offset
 * `q` from the image centre lands on screen at `t + s·q`. Keeping everything in
 * that one frame makes "zoom about the fingers" a one-liner.
 */

export type Pt = { x: number; y: number };
export type Size = { w: number; h: number };
export type View = { s: number; x: number; y: number };

export const MIN_SCALE = 1;
export const MAX_SCALE = 5;
/** Double-tap zoom level — enough to read a boarding-pass seat/QR block. */
export const TAP_SCALE = 2.5;
/** Below this a view counts as "at 1x" (float noise from a pinch that returned). */
export const ZOOM_EPSILON = 0.02;

export const IDENTITY: View = { s: 1, x: 0, y: 0 };

export function isZoomed(v: View): boolean {
	return v.s > 1 + ZOOM_EPSILON;
}

export function clampScale(s: number): number {
	return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/**
 * Keep the scaled image covering the stage wherever it is bigger than the
 * stage, and centred on any axis where it is not — no panning an edge inwards
 * past the stage edge, no panning a fitting axis at all.
 */
export function clampPan(v: View, img: Size, stage: Size): View {
	const maxX = Math.max(0, (img.w * v.s - stage.w) / 2);
	const maxY = Math.max(0, (img.h * v.s - stage.h) / 2);
	return {
		s: v.s,
		// `|| 0` folds -0 (from clamping to a zero range) into 0.
		x: Math.min(maxX, Math.max(-maxX, v.x)) || 0,
		y: Math.min(maxY, Math.max(-maxY, v.y)) || 0
	};
}

/** Rescale to `s` keeping the image point under `focal` fixed on screen. */
export function zoomAbout(v: View, s: number, focal: Pt, img: Size, stage: Size): View {
	const next = clampScale(s);
	const k = next / v.s;
	return clampPan(
		{ s: next, x: focal.x - k * (focal.x - v.x), y: focal.y - k * (focal.y - v.y) },
		img,
		stage
	);
}

/**
 * Two-finger pinch. `start` is the view when the second finger landed; the
 * image point that was under the fingers' starting midpoint follows the
 * current midpoint (so a pinch also pans), scaled by the spread ratio.
 */
export function pinchView(
	start: View,
	startMid: Pt,
	startDist: number,
	mid: Pt,
	dist: number,
	img: Size,
	stage: Size
): View {
	const s = clampScale(start.s * (dist / Math.max(1, startDist)));
	const k = s / start.s;
	return clampPan(
		{ s, x: mid.x - k * (startMid.x - start.x), y: mid.y - k * (startMid.y - start.y) },
		img,
		stage
	);
}

/** Double-tap: zoomed → back to 1x; at 1x → TAP_SCALE about the tap point. */
export function doubleTapView(v: View, focal: Pt, img: Size, stage: Size): View {
	if (isZoomed(v)) return IDENTITY;
	return zoomAbout(v, TAP_SCALE, focal, img, stage);
}

/** Pixels a finger must travel before a press becomes a drag (vs a tap). */
export const TAP_SLOP = 8;
/** Double-tap window: max gap and max distance between the two taps. */
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_DIST = 30;

const PAGE_DIST = 60;
const PAGE_VELOCITY = 0.4; // px/ms
const DISMISS_DIST = 120;
const DISMISS_VELOCITY = 0.5; // px/ms

export type Release = 'next' | 'prev' | 'dismiss' | 'none';

/**
 * What a 1x single-finger drag does on release. `axis` is the axis the drag
 * locked to once it left the tap slop; `d`/`v` are displacement and release
 * velocity along it. A flick counts even when short; a slow drag must travel.
 * Paging never fires past the ends of the gallery.
 */
export function releaseAction(
	axis: 'x' | 'y',
	d: number,
	v: number,
	opts: { hasPrev: boolean; hasNext: boolean }
): Release {
	if (axis === 'x') {
		if ((d < -PAGE_DIST || v < -PAGE_VELOCITY) && d < 0 && opts.hasNext) return 'next';
		if ((d > PAGE_DIST || v > PAGE_VELOCITY) && d > 0 && opts.hasPrev) return 'prev';
		return 'none';
	}
	// Downward only — an upward drag is not a dismissal.
	if (d > DISMISS_DIST || (v > DISMISS_VELOCITY && d > 30)) return 'dismiss';
	return 'none';
}
