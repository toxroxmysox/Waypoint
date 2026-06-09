// Pure, unit-testable helpers for the Documents domain: type/size validation,
// file-kind detection, byte + relative-time formatting. No PocketBase, no DOM.

// Allowed MIME types — mirrors the `documents.file` mimeTypes in migration 0032.
// PB enforces these server-side; the client pre-checks for a fast, in-context
// error message.
export const ALLOWED_MIME_TYPES = [
	'application/pdf',
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/heic',
	'image/heif'
] as const;

// `accept` attribute for the native file picker. Extensions cover the cases
// where the OS reports an empty/odd MIME (notably HEIC on some platforms).
export const FILE_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif';

// 20 MB cap (PRD), in bytes.
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export type FileKind = 'image' | 'pdf';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

/** Lowercased extension without the dot, or '' if none. */
export function fileExtension(filename: string): string {
	const dot = filename.lastIndexOf('.');
	if (dot < 0 || dot === filename.length - 1) return '';
	return filename.slice(dot + 1).toLowerCase();
}

/** Classify a stored filename as image or pdf (default: pdf — non-image). */
export function fileKind(filename: string): FileKind {
	return IMAGE_EXTENSIONS.includes(fileExtension(filename)) ? 'image' : 'pdf';
}

/**
 * HEIC/HEIF rarely renders in browsers and PB doesn't transcode it (v4): such
 * images fall back to a download link rather than a thumbnail/lightbox.
 */
export function isRenderableImage(filename: string): boolean {
	const ext = fileExtension(filename);
	return IMAGE_EXTENSIONS.includes(ext) && ext !== 'heic' && ext !== 'heif';
}

/**
 * Strip the random suffix PocketBase appends to stored filenames
 * ("boarding_pass_a1b2c3d4e5.pdf" → "boarding_pass.pdf") for display. Leaves
 * names without the 10-char suffix untouched.
 */
export function prettyFilename(stored: string): string {
	return stored.replace(/_[a-z0-9]{10}(\.[^.]+)$/i, '$1');
}

/** Best label for a document row: the caption if set, else the pretty filename. */
export function documentLabel(caption: string, stored: string): string {
	const c = caption?.trim();
	return c || prettyFilename(stored);
}

export interface FileCheckResult {
	ok: boolean;
	error?: string;
}

/** Client-side pre-check before upload. PB is the real enforcement. */
export function checkFile(file: { type: string; name: string; size: number }): FileCheckResult {
	const ext = fileExtension(file.name);
	const typeOk =
		(file.type && (ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) ||
		IMAGE_EXTENSIONS.includes(ext) ||
		ext === 'pdf';
	if (!typeOk) {
		return { ok: false, error: 'PDF or image only.' };
	}
	if (file.size > MAX_FILE_BYTES) {
		return { ok: false, error: `Too large — ${formatBytes(file.size)}. Max 20 MB.` };
	}
	return { ok: true };
}

/** "2.4 MB", "812 KB", "640 B" — compact human size. */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${Math.round(kb)} KB`;
	const mb = kb / 1024;
	return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

/**
 * Compact relative time ("just now", "3m", "5h", "2d", then a date) from a PB
 * timestamp ('YYYY-MM-DD HH:MM:SS.sssZ' or ISO). `now` is injectable for tests.
 */
export function relativeTime(created: string, now: Date = new Date()): string {
	if (!created) return '';
	const then = new Date(created.replace(' ', 'T'));
	const diffMs = now.getTime() - then.getTime();
	if (Number.isNaN(diffMs)) return '';
	const sec = Math.floor(diffMs / 1000);
	if (sec < 60) return 'just now';
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h`;
	const day = Math.floor(hr / 24);
	if (day < 7) return `${day}d`;
	return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
