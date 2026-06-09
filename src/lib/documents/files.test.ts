import { describe, it, expect } from 'vitest';
import {
	fileExtension,
	fileKind,
	isRenderableImage,
	checkFile,
	formatBytes,
	relativeTime,
	prettyFilename,
	documentLabel,
	MAX_FILE_BYTES
} from './files';

describe('fileExtension', () => {
	it('lowercases and strips the dot', () => {
		expect(fileExtension('Boarding Pass.PDF')).toBe('pdf');
		expect(fileExtension('photo.JPEG')).toBe('jpeg');
	});
	it('returns empty for no extension or trailing dot', () => {
		expect(fileExtension('noext')).toBe('');
		expect(fileExtension('trailing.')).toBe('');
	});
});

describe('fileKind', () => {
	it('classifies images vs pdf', () => {
		expect(fileKind('a.png')).toBe('image');
		expect(fileKind('a.heic')).toBe('image');
		expect(fileKind('a.pdf')).toBe('pdf');
		expect(fileKind('weird.bin')).toBe('pdf');
	});
});

describe('isRenderableImage', () => {
	it('is true for browser-renderable images', () => {
		expect(isRenderableImage('a.png')).toBe(true);
		expect(isRenderableImage('a.webp')).toBe(true);
	});
	it('is false for HEIC/HEIF (no browser render, no transcode in v4)', () => {
		expect(isRenderableImage('a.heic')).toBe(false);
		expect(isRenderableImage('a.heif')).toBe(false);
	});
	it('is false for pdf', () => {
		expect(isRenderableImage('a.pdf')).toBe(false);
	});
});

describe('checkFile', () => {
	it('accepts an allowed image under the cap', () => {
		expect(checkFile({ type: 'image/png', name: 'x.png', size: 1000 })).toEqual({ ok: true });
	});
	it('accepts a pdf by extension when MIME is empty', () => {
		expect(checkFile({ type: '', name: 'x.pdf', size: 1000 }).ok).toBe(true);
	});
	it('accepts HEIC by extension when MIME is empty (common on iOS)', () => {
		expect(checkFile({ type: '', name: 'IMG_0001.HEIC', size: 1000 }).ok).toBe(true);
	});
	it('rejects an unsupported type', () => {
		const r = checkFile({ type: 'application/zip', name: 'x.zip', size: 1000 });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/PDF or image/);
	});
	it('rejects a file over 20 MB', () => {
		const r = checkFile({ type: 'image/png', name: 'x.png', size: MAX_FILE_BYTES + 1 });
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/Too large/);
	});
});

describe('formatBytes', () => {
	it('formats across units', () => {
		expect(formatBytes(640)).toBe('640 B');
		expect(formatBytes(2048)).toBe('2 KB');
		expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
		expect(formatBytes(15 * 1024 * 1024)).toBe('15 MB');
	});
});

describe('prettyFilename', () => {
	it('strips the PB random suffix', () => {
		expect(prettyFilename('boarding_pass_a1b2c3d4e5.pdf')).toBe('boarding_pass.pdf');
		expect(prettyFilename('IMG_2034_Zz9Yy8Xx7w.png')).toBe('IMG_2034.png');
	});
	it('leaves plain names untouched', () => {
		expect(prettyFilename('ticket.pdf')).toBe('ticket.pdf');
	});
});

describe('documentLabel', () => {
	it('prefers caption when present', () => {
		expect(documentLabel('TAP boarding pass', 'x_a1b2c3d4e5.pdf')).toBe('TAP boarding pass');
	});
	it('falls back to the pretty filename', () => {
		expect(documentLabel('', 'ticket_a1b2c3d4e5.pdf')).toBe('ticket.pdf');
		expect(documentLabel('   ', 'ticket_a1b2c3d4e5.pdf')).toBe('ticket.pdf');
	});
});

describe('relativeTime', () => {
	const now = new Date('2026-06-08T12:00:00Z');
	it('handles sub-minute, minutes, hours, days', () => {
		expect(relativeTime('2026-06-08 11:59:40.000Z', now)).toBe('just now');
		expect(relativeTime('2026-06-08 11:45:00.000Z', now)).toBe('15m');
		expect(relativeTime('2026-06-08 09:00:00.000Z', now)).toBe('3h');
		expect(relativeTime('2026-06-06 12:00:00.000Z', now)).toBe('2d');
	});
	it('falls back to a date beyond a week', () => {
		expect(relativeTime('2026-05-01 12:00:00.000Z', now)).toBe('May 1');
	});
	it('returns empty for blank input', () => {
		expect(relativeTime('', now)).toBe('');
	});
});
