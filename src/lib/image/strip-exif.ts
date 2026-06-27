// Shared client-side image re-encode helper (#290, audit finding FILES-2).
//
// Why this exists: uploaded images carry EXIF/GPS/timestamp/device metadata that
// PocketBase stores and serves back verbatim. The cheapest, backend-free fix is
// to re-encode the pixels through a <canvas> before upload — a canvas holds raw
// RGBA only, so toBlob() emits a clean image with NO metadata. One pass does
// three jobs: browser-native HEIC decode (where supported) + EXIF strip + format
// normalisation.
//
// Reuses the avatar-crop.ts:cropToWebp pattern (decode → draw → toBlob), but for
// the general "sanitise a whole image" case (no crop, preserve dimensions).
//
// Consumers: documents (now, #290), receipts (#229), Memory (#269). Keep this
// module free of any document/receipt/Memory-specific logic.
//
// HEIC caveat: we rely on the BROWSER decoding the source. Safari/iOS (the
// dominant HEIC source) decode HEIC natively, so for those users an HEIC upload
// is transcoded to JPEG and stripped in this same pass. Chrome/Firefox cannot
// decode HEIC; there `reencodeStripMetadata` rejects and the caller keeps the
// original file. A full cross-browser HEIC transcode needs a libheif WASM bundle
// (~1-2 MB) and is deliberately shelved (docs/TRIP_MEMORY_PRD.md "shared
// lib/image/heic.ts") — out of scope for #290.

// --- Pure logic (DOM-free, unit-tested) --------------------------------------

/** Lowercased extension without the dot, or '' if none. */
function ext(filename: string): string {
	const dot = filename.lastIndexOf('.');
	if (dot < 0 || dot === filename.length - 1) return '';
	return filename.slice(dot + 1).toLowerCase();
}

const HEIC_EXTENSIONS = ['heic', 'heif'];
const HEIC_MIMES = ['image/heic', 'image/heif'];

// Raster formats whose pixels a <canvas> can faithfully re-encode and which can
// carry EXIF (JPEG/HEIF) or other sidecar metadata. PNG/WebP rarely hold GPS but
// re-encoding them is cheap and guarantees a clean output, so we sanitise all
// raster images uniformly. PDFs and SVGs are NOT raster images and are skipped.
const RASTER_MIMES = ['image/jpeg', 'image/png', 'image/webp', ...HEIC_MIMES];
const RASTER_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', ...HEIC_EXTENSIONS];

export interface ImageLike {
	type: string;
	name: string;
}

/** True if the file is a raster image we should run through the strip pass. */
export function isStrippableImage(file: ImageLike): boolean {
	if (file.type && RASTER_MIMES.includes(file.type.toLowerCase())) return true;
	// Some platforms report an empty/odd MIME for HEIC — fall back to extension.
	return RASTER_EXTENSIONS.includes(ext(file.name));
}

/** True if the source is HEIC/HEIF (needs transcoding to a web format). */
export function isHeic(file: ImageLike): boolean {
	if (file.type && HEIC_MIMES.includes(file.type.toLowerCase())) return true;
	return HEIC_EXTENSIONS.includes(ext(file.name));
}

export interface OutputFormat {
	/** MIME for canvas.toBlob — never image/heic (canvas can't encode it). */
	mime: string;
	/** Replacement extension for the output filename. */
	ext: string;
}

/**
 * Pick the output container for a sanitised image:
 *   - HEIC/HEIF → JPEG (canvas can't encode HEIC; JPEG is the natural transcode).
 *   - PNG → PNG (lossless source, keep it lossless; PNG carries no GPS anyway).
 *   - everything else (JPEG/WebP/unknown) → JPEG (smallest, universally viewable).
 */
export function outputFormatFor(file: ImageLike): OutputFormat {
	const e = ext(file.name);
	const t = (file.type || '').toLowerCase();
	if (t === 'image/png' || e === 'png') return { mime: 'image/png', ext: 'png' };
	return { mime: 'image/jpeg', ext: 'jpg' };
}

/** Swap a filename's extension (e.g. "IMG_0001.HEIC" → "IMG_0001.jpg"). */
export function renameExtension(filename: string, newExt: string): string {
	const dot = filename.lastIndexOf('.');
	const base = dot < 0 ? filename : filename.slice(0, dot);
	return `${base}.${newExt}`;
}

// --- DOM re-encode (browser only) --------------------------------------------

export interface StripOptions {
	/** JPEG/WebP quality 0..1. Ignored for PNG. Default 0.92 (visually lossless). */
	quality?: number;
	/**
	 * Longest-edge cap in px. Images larger than this are downscaled (preserving
	 * aspect ratio). 0 = no cap. Default 0 (preserve original dimensions).
	 */
	maxEdge?: number;
}

/**
 * Decode an image File and re-encode its pixels through a canvas, producing a new
 * File with ALL metadata (EXIF/GPS/timestamps/device IDs) removed. HEIC sources
 * are transcoded to JPEG in the same pass (where the browser can decode them).
 *
 * Throws if the file isn't a strippable raster image, or if the browser can't
 * decode it (e.g. HEIC on Chrome/Firefox) — callers should catch and decide
 * whether to upload the original or surface an error.
 *
 * @returns a fresh File (sanitised), with the extension/MIME adjusted to the
 *          chosen output format.
 */
export async function reencodeStripMetadata(file: File, opts: StripOptions = {}): Promise<File> {
	if (!isStrippableImage(file)) {
		throw new Error(`Not a strippable raster image: ${file.type || file.name}`);
	}

	const { quality = 0.92, maxEdge = 0 } = opts;
	const bitmap = await decode(file);
	try {
		let { width, height } = bitmap;
		if (maxEdge > 0 && Math.max(width, height) > maxEdge) {
			const ratio = maxEdge / Math.max(width, height);
			width = Math.round(width * ratio);
			height = Math.round(height * ratio);
		}

		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Canvas 2D context unavailable.');
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(bitmap, 0, 0, width, height);

		const { mime, ext: outExt } = outputFormatFor(file);
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, mime, quality)
		);
		if (!blob) throw new Error('Image encoding failed.');

		return new File([blob], renameExtension(file.name, outExt), {
			type: mime,
			lastModified: Date.now()
		});
	} finally {
		// createImageBitmap allocates a GPU/decoder resource — release it.
		if (typeof (bitmap as ImageBitmap).close === 'function') {
			(bitmap as ImageBitmap).close();
		}
	}
}

/**
 * Decode a File into something drawable. Prefer createImageBitmap (off-thread,
 * honours EXIF orientation when supported); fall back to an <img> element when
 * createImageBitmap is unavailable or rejects (some Safari versions, some HEIC).
 */
async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
	if (typeof createImageBitmap === 'function') {
		try {
			// imageOrientation:'from-image' bakes the EXIF orientation into the
			// pixels so the stripped output isn't sideways once the EXIF is gone.
			return await createImageBitmap(file, { imageOrientation: 'from-image' });
		} catch {
			// Fall through to the <img> path (e.g. option unsupported, or HEIC the
			// bitmap decoder rejects but <img> can render).
		}
	}
	return await decodeViaImg(file);
}

/** <img>-element decode fallback (mirrors AvatarCropper's loader). */
function decodeViaImg(
	file: File
): Promise<CanvasImageSource & { width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(
				Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight })
			);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('That image could not be decoded by this browser.'));
		};
		img.src = url;
	});
}
