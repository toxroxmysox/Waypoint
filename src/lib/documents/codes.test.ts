import { describe, it, expect } from 'vitest';
import { isCodeDocument, isFileDocument, codesByItem, codesForItem, attachCodesToItems } from './codes';

// #268 / ADR-0016 — codes are kind:'code' Documents. These pure helpers re-source
// the legacy `{label,value}[]` shape from code docs. Legacy file rows store
// kind:'' (a non-required select) and must read as FILES, not codes.

function code(item: string, label: string, value: string) {
	return { item, code_label: label, code_value: value, kind: 'code' as const };
}

describe('isCodeDocument / isFileDocument', () => {
	it('only kind:code is a code; "" and "file" are files', () => {
		expect(isCodeDocument({ kind: 'code' })).toBe(true);
		expect(isCodeDocument({ kind: 'file' })).toBe(false);
		expect(isCodeDocument({ kind: '' })).toBe(false);

		expect(isFileDocument({ kind: 'file' })).toBe(true);
		expect(isFileDocument({ kind: '' })).toBe(true); // legacy row
		expect(isFileDocument({ kind: 'code' })).toBe(false);
	});
});

describe('codesByItem', () => {
	it('groups code docs by item id, preserving input order', () => {
		const map = codesByItem([
			code('a', 'Conf', 'A1'),
			code('a', 'PIN', 'A2'),
			code('b', 'PNR', 'B1')
		]);
		expect(map.get('a')).toEqual([
			{ label: 'Conf', value: 'A1' },
			{ label: 'PIN', value: 'A2' }
		]);
		expect(map.get('b')).toEqual([{ label: 'PNR', value: 'B1' }]);
	});

	it('drops blank-value codes and ignores non-code (file) docs', () => {
		const map = codesByItem([
			code('a', 'C', '   '),
			{ item: 'a', code_label: '', code_value: '', kind: 'file' as const },
			code('a', 'Real', 'X')
		]);
		expect(map.get('a')).toEqual([{ label: 'Real', value: 'X' }]);
	});

	it('buckets trip-scoped (item-less) code docs under the empty key', () => {
		const map = codesByItem([code('', 'WiFi', 'guest')]);
		expect(map.get('')).toEqual([{ label: 'WiFi', value: 'guest' }]);
	});
});

describe('codesForItem', () => {
	it('returns one item’s codes, [] when none', () => {
		const docs = [code('a', 'C', 'X'), code('b', 'D', 'Y')];
		expect(codesForItem(docs, 'a')).toEqual([{ label: 'C', value: 'X' }]);
		expect(codesForItem(docs, 'z')).toEqual([]);
	});
});

describe('attachCodesToItems', () => {
	it('sets confirmation_codes in place from the code docs', () => {
		const items = [
			{ id: 'a', confirmation_codes: [{ label: 'STALE', value: 'OLD' }] },
			{ id: 'b' } as { id: string; confirmation_codes?: { label: string; value: string }[] }
		];
		attachCodesToItems(items, [code('a', 'C', 'X')]);
		expect(items[0].confirmation_codes).toEqual([{ label: 'C', value: 'X' }]);
		expect(items[1].confirmation_codes).toEqual([]); // no docs → emptied
	});
});
