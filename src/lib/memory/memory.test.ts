import { describe, it, expect } from 'vitest';
import {
	checkPhoto,
	decideMemorySave,
	isRenderablePhoto,
	memoriesByDay,
	MAX_PHOTO_BYTES
} from './memory';
import type { Memory } from './types';

describe('checkPhoto', () => {
	it('accepts common image types', () => {
		expect(checkPhoto({ type: 'image/jpeg', name: 'a.jpg', size: 100 }).ok).toBe(true);
		expect(checkPhoto({ type: 'image/png', name: 'a.png', size: 100 }).ok).toBe(true);
		expect(checkPhoto({ type: 'image/webp', name: 'a.webp', size: 100 }).ok).toBe(true);
		expect(checkPhoto({ type: 'image/heic', name: 'a.heic', size: 100 }).ok).toBe(true);
	});

	it('accepts by extension when the OS reports no MIME (HEIC on some platforms)', () => {
		expect(checkPhoto({ type: '', name: 'IMG_0001.HEIC', size: 100 }).ok).toBe(true);
	});

	it('rejects PDFs — a memory is never a document', () => {
		expect(checkPhoto({ type: 'application/pdf', name: 'pass.pdf', size: 100 }).ok).toBe(false);
	});

	it('rejects files over 20 MB', () => {
		expect(checkPhoto({ type: 'image/jpeg', name: 'a.jpg', size: MAX_PHOTO_BYTES + 1 }).ok).toBe(
			false
		);
	});
});

describe('isRenderablePhoto', () => {
	it('renders jpg/png/webp inline', () => {
		expect(isRenderablePhoto('sunset_x1y2z3a4b5.jpg')).toBe(true);
		expect(isRenderablePhoto('a.png')).toBe(true);
		expect(isRenderablePhoto('a.webp')).toBe(true);
	});

	it('falls back for HEIC/HEIF (browser cannot render; v4 caveat)', () => {
		expect(isRenderablePhoto('IMG_0001.heic')).toBe(false);
		expect(isRenderablePhoto('IMG_0001.heif')).toBe(false);
	});
});

describe('decideMemorySave — the PRD upsert contract', () => {
	const base = {
		hasExisting: false,
		existingHasPhoto: false,
		hasNewPhoto: false,
		removePhoto: false,
		thought: ''
	};

	it('new save with a thought creates', () => {
		expect(decideMemorySave({ ...base, thought: 'A quiet canal at dusk.' })).toBe('create');
	});

	it('new save with only a photo creates', () => {
		expect(decideMemorySave({ ...base, hasNewPhoto: true })).toBe('create');
	});

	it('new save with neither is rejected — a record with neither does not exist', () => {
		expect(decideMemorySave(base)).toBe('reject_empty');
		expect(decideMemorySave({ ...base, thought: '   ' })).toBe('reject_empty');
	});

	it('editing with content updates (replace, never a second record)', () => {
		expect(decideMemorySave({ ...base, hasExisting: true, thought: 'Edited.' })).toBe('update');
		expect(
			decideMemorySave({ ...base, hasExisting: true, existingHasPhoto: true, thought: '' })
		).toBe('update');
	});

	it('clearing BOTH fields deletes the record', () => {
		expect(
			decideMemorySave({
				...base,
				hasExisting: true,
				existingHasPhoto: true,
				removePhoto: true,
				thought: ''
			})
		).toBe('delete');
		expect(decideMemorySave({ ...base, hasExisting: true, thought: '' })).toBe('delete');
	});

	it('replacing the photo while removing the old one still updates', () => {
		expect(
			decideMemorySave({
				...base,
				hasExisting: true,
				existingHasPhoto: true,
				removePhoto: true,
				hasNewPhoto: true
			})
		).toBe('update');
	});
});

describe('memoriesByDay', () => {
	it('groups by day id preserving order', () => {
		const mk = (id: string, day: string): Memory => ({
			id,
			trip: 't1',
			day,
			author: 'm1',
			photo: '',
			thought: 'x',
			created: '',
			updated: ''
		});
		const grouped = memoriesByDay([mk('a', 'd1'), mk('b', 'd2'), mk('c', 'd1')]);
		expect(grouped.d1.map((m) => m.id)).toEqual(['a', 'c']);
		expect(grouped.d2.map((m) => m.id)).toEqual(['b']);
		expect(grouped.d3).toBeUndefined();
	});
});
