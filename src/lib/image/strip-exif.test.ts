import { describe, it, expect } from 'vitest';
import {
	isStrippableImage,
	isHeic,
	outputFormatFor,
	renameExtension
} from './strip-exif';

// The DOM re-encode (reencodeStripMetadata) needs a real <canvas>; the unit test
// project runs in node, so we cover the pure decision logic that GUARANTEES the
// strip behaviour: which files get re-encoded, and which output container they
// land in (HEIC must transcode to JPEG — canvas can't encode HEIC, and the JPEG
// re-encode is what physically drops the EXIF/GPS).

describe('isStrippableImage', () => {
	it('accepts the raster image MIME types', () => {
		for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']) {
			expect(isStrippableImage({ type, name: 'x' })).toBe(true);
		}
	});

	it('falls back to extension when MIME is empty (HEIC on some platforms)', () => {
		expect(isStrippableImage({ type: '', name: 'IMG_0001.HEIC' })).toBe(true);
		expect(isStrippableImage({ type: '', name: 'photo.jpg' })).toBe(true);
	});

	it('rejects PDFs and other non-raster files', () => {
		expect(isStrippableImage({ type: 'application/pdf', name: 'boarding.pdf' })).toBe(false);
		expect(isStrippableImage({ type: 'image/svg+xml', name: 'logo.svg' })).toBe(false);
		expect(isStrippableImage({ type: '', name: 'notes.txt' })).toBe(false);
	});
});

describe('isHeic', () => {
	it('detects HEIC/HEIF by MIME or extension', () => {
		expect(isHeic({ type: 'image/heic', name: 'a' })).toBe(true);
		expect(isHeic({ type: 'image/heif', name: 'a' })).toBe(true);
		expect(isHeic({ type: '', name: 'IMG.HEIC' })).toBe(true);
		expect(isHeic({ type: 'image/jpeg', name: 'a.jpg' })).toBe(false);
	});
});

describe('outputFormatFor', () => {
	it('transcodes HEIC/HEIF to JPEG (canvas cannot encode HEIC)', () => {
		expect(outputFormatFor({ type: 'image/heic', name: 'IMG.HEIC' })).toEqual({
			mime: 'image/jpeg',
			ext: 'jpg'
		});
		expect(outputFormatFor({ type: '', name: 'IMG.heif' })).toEqual({
			mime: 'image/jpeg',
			ext: 'jpg'
		});
	});

	it('keeps PNG as PNG (lossless source)', () => {
		expect(outputFormatFor({ type: 'image/png', name: 'shot.png' })).toEqual({
			mime: 'image/png',
			ext: 'png'
		});
	});

	it('normalises JPEG and WebP to JPEG', () => {
		expect(outputFormatFor({ type: 'image/jpeg', name: 'a.jpg' }).mime).toBe('image/jpeg');
		expect(outputFormatFor({ type: 'image/webp', name: 'a.webp' }).mime).toBe('image/jpeg');
	});
});

describe('renameExtension', () => {
	it('swaps the extension', () => {
		expect(renameExtension('IMG_0001.HEIC', 'jpg')).toBe('IMG_0001.jpg');
		expect(renameExtension('vacation.photo.png', 'jpg')).toBe('vacation.photo.jpg');
	});

	it('appends when there is no extension', () => {
		expect(renameExtension('screenshot', 'jpg')).toBe('screenshot.jpg');
	});
});
