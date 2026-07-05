// Pure, unit-testable helpers for the Trip Memory domain (#269 / ADR-0007).
// No PocketBase, no DOM. Image-only file rules (a memory is never a document —
// no PDF), the 280-char thought cap, and the upsert/delete decision the
// composer + server action share.

import type { Memory } from './types';

/** Tweet-length — "one thought," not an essay (PRD §Data model). */
export const MAX_THOUGHT_CHARS = 280;

/** 20 MB photo cap (matches documents), in bytes. */
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

/** Images ONLY — mirrors `memories.photo` mimeTypes in migration 0058. */
export const PHOTO_MIME_TYPES = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/heic',
	'image/heif'
] as const;

/** `accept` for the native picker (extensions cover empty/odd OS-reported MIMEs). */
export const PHOTO_ACCEPT =
	'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

function extension(filename: string): string {
	const dot = filename.lastIndexOf('.');
	if (dot < 0 || dot === filename.length - 1) return '';
	return filename.slice(dot + 1).toLowerCase();
}

/**
 * HEIC/HEIF rarely renders in browsers and PB doesn't transcode (v4 caveat,
 * PRD §Constraints): such photos fall back to a download link instead of an
 * inline image. Transcoding is a shelved shared capability.
 */
export function isRenderablePhoto(filename: string): boolean {
	const ext = extension(filename);
	return IMAGE_EXTENSIONS.includes(ext) && ext !== 'heic' && ext !== 'heif';
}

export interface PhotoCheckResult {
	ok: boolean;
	error?: string;
}

/** Client-side pre-check before upload. PB mimeTypes/maxSize is the real gate. */
export function checkPhoto(file: { type: string; name: string; size: number }): PhotoCheckResult {
	const typeOk =
		(file.type && (PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) ||
		IMAGE_EXTENSIONS.includes(extension(file.name));
	if (!typeOk) return { ok: false, error: 'Images only — jpg, png, webp, or heic.' };
	if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: 'Too large — max 20 MB.' };
	return { ok: true };
}

export type MemorySaveOp = 'create' | 'update' | 'delete' | 'reject_empty';

export interface MemorySaveInput {
	/** An existing (day, author) record is being edited. */
	hasExisting: boolean;
	/** The existing record already stores a photo. */
	existingHasPhoto: boolean;
	/** A new photo file rides this save. */
	hasNewPhoto: boolean;
	/** The user removed the existing photo (without replacing it). */
	removePhoto: boolean;
	/** The (trimmed) thought text being saved. */
	thought: string;
}

/**
 * The PRD's upsert contract (§Composer): saving upserts the (day, author)
 * record; clearing BOTH fields deletes it; a brand-new save with neither is
 * rejected (a record with neither does not exist). Pure — shared by the
 * composer's button state and the server action's disposition.
 */
export function decideMemorySave(input: MemorySaveInput): MemorySaveOp {
	const keepsPhoto = input.hasNewPhoto || (input.existingHasPhoto && !input.removePhoto);
	const hasThought = input.thought.trim() !== '';
	if (!keepsPhoto && !hasThought) {
		return input.hasExisting ? 'delete' : 'reject_empty';
	}
	return input.hasExisting ? 'update' : 'create';
}

/** Group a trip's memories by their day id (Closeout's day-by-day review). */
export function memoriesByDay(memories: Memory[]): Record<string, Memory[]> {
	const byDay: Record<string, Memory[]> = {};
	for (const m of memories) (byDay[m.day] ??= []).push(m);
	return byDay;
}
