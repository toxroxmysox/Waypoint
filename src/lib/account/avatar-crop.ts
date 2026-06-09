// Hand-rolled avatar crop pipeline (PRD #59 D7, issue #104). No cropper lib.
//
// The cropper shows the image "cover"-scaled inside a square circular-masked
// viewport. The user drags (recenter) and zooms (>=1). `computeCropRect` turns
// that view state into the source rectangle of the natural image that the
// viewport currently frames; `cropToWebp` draws that rect onto a 512² canvas
// and encodes webp. The geometry is pure (and unit-tested); only the encode
// touches the DOM.

export const OUTPUT_SIZE = 512;

export interface CropView {
	/** Natural (intrinsic) image width in px. */
	naturalWidth: number;
	/** Natural image height in px. */
	naturalHeight: number;
	/** Square viewport edge in display px. */
	viewport: number;
	/** Zoom factor, >= 1 (1 = cover-fit). */
	zoom: number;
	/** Image-center offset from viewport center, in display px (drag). */
	offsetX: number;
	offsetY: number;
}

export interface CropRect {
	/** Source x/y/size in natural image px, clamped to stay inside the image. */
	sx: number;
	sy: number;
	sSize: number;
}

/**
 * Base scale that makes the image just cover the square viewport (zoom = 1).
 * The larger ratio wins so neither axis leaves a gap.
 */
export function coverScale(naturalWidth: number, naturalHeight: number, viewport: number): number {
	return Math.max(viewport / naturalWidth, viewport / naturalHeight);
}

/**
 * Map view state → the natural-image source square the viewport frames.
 * Offset is clamped so the cover-scaled image always fills the viewport (no
 * empty edges), which is what makes "cover" framing safe at any drag/zoom.
 */
export function computeCropRect(view: CropView): CropRect {
	const { naturalWidth, naturalHeight, viewport, offsetX, offsetY } = view;
	const zoom = Math.max(1, view.zoom);
	const scale = coverScale(naturalWidth, naturalHeight, viewport) * zoom;

	// The viewport spans this many natural px at the current scale.
	const sSize = viewport / scale;

	// Drag moves the image under a fixed viewport, so a positive offset shifts
	// the framed region the opposite way (in natural px).
	const centerX = naturalWidth / 2 - offsetX / scale;
	const centerY = naturalHeight / 2 - offsetY / scale;

	const rawX = centerX - sSize / 2;
	const rawY = centerY - sSize / 2;

	// Clamp so the source square stays inside the image. max>=0 because the
	// cover scale guarantees sSize <= each natural dimension.
	const sx = clamp(rawX, 0, naturalWidth - sSize);
	const sy = clamp(rawY, 0, naturalHeight - sSize);

	return { sx, sy, sSize };
}

/** Max drag offset (display px) before the framed square would leave the image. */
export function maxOffset(view: Omit<CropView, 'offsetX' | 'offsetY'>): { x: number; y: number } {
	const zoom = Math.max(1, view.zoom);
	const scale = coverScale(view.naturalWidth, view.naturalHeight, view.viewport) * zoom;
	const sSize = view.viewport / scale;
	// Slack in natural px on each axis, converted back to display px.
	const slackX = (view.naturalWidth - sSize) / 2;
	const slackY = (view.naturalHeight - sSize) / 2;
	return { x: slackX * scale, y: slackY * scale };
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(Math.max(v, lo), hi);
}

/**
 * Draw the framed region onto a 512² canvas and encode webp. Output is square,
 * so the final circular mask in <Avatar> via object-cover is exact.
 */
export async function cropToWebp(
	source: CanvasImageSource,
	view: CropView,
	quality = 0.85
): Promise<Blob> {
	const { sx, sy, sSize } = computeCropRect(view);

	const canvas = document.createElement('canvas');
	canvas.width = OUTPUT_SIZE;
	canvas.height = OUTPUT_SIZE;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D context unavailable.');
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(source, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/webp', quality)
	);
	if (!blob) throw new Error('Image encoding failed.');
	return blob;
}
