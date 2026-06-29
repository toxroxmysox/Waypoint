import { describe, it, expect } from 'vitest';
import { groupDocuments, documentTypeBreakdown, itemsWithCodes } from './grouping';
import type { DocumentView } from './types';
import type { ItemType } from '$lib/types';

function doc(id: string, item: string, item_type?: string): DocumentView {
	return {
		id,
		collectionId: '',
		collectionName: 'documents',
		created: '',
		updated: '',
		trip: 'trip1',
		item,
		file: `${id}.pdf`,
		caption: '',
		uploaded_by: 'm1',
		kind: 'file',
		code_label: '',
		code_value: '',
		file_href: '',
		uploader_name: 'A',
		uploader_role: 'owner',
		item_type
	} as DocumentView;
}

describe('groupDocuments', () => {
	it('puts the Trip-level group first, then item types in fixed order', () => {
		const groups = groupDocuments([
			doc('a', 'i1', 'meal'),
			doc('b', '', undefined), // trip-scoped
			doc('c', 'i2', 'lodging'),
			doc('d', 'i3', 'flight')
		]);
		expect(groups.map((g) => g.key)).toEqual(['trip', 'lodging', 'flight', 'meal']);
		expect(groups[0].label).toBe('Whole trip');
	});

	it('omits empty groups', () => {
		const groups = groupDocuments([doc('a', 'i1', 'activity')]);
		expect(groups).toHaveLength(1);
		expect(groups[0].key).toBe('activity');
	});

	it('omits the Trip-level group when there are no trip-scoped docs', () => {
		const groups = groupDocuments([doc('a', 'i1', 'lodging')]);
		expect(groups.find((g) => g.key === 'trip')).toBeUndefined();
	});

	it('preserves input order within a group (caller sorts newest-first)', () => {
		const groups = groupDocuments([
			doc('a', 'i1', 'meal'),
			doc('b', 'i2', 'meal'),
			doc('c', 'i3', 'meal')
		]);
		expect(groups[0].docs.map((d) => d.id)).toEqual(['a', 'b', 'c']);
	});

	it('returns an empty array for no documents', () => {
		expect(groupDocuments([])).toEqual([]);
	});
});

describe('documentTypeBreakdown', () => {
	it('reports per-group counts in order', () => {
		const breakdown = documentTypeBreakdown([
			doc('a', '', undefined),
			doc('b', '', undefined),
			doc('c', 'i1', 'lodging')
		]);
		expect(breakdown).toEqual([
			{ label: 'Whole trip', count: 2 },
			{ label: 'Lodging', count: 1 }
		]);
	});
});

describe('itemsWithCodes (#268 — codes sourced from kind:code Documents)', () => {
	function item(id: string, type: ItemType) {
		return { id, title: id.toUpperCase(), type };
	}
	// A minimal kind:code Document shape (the helper only reads these fields).
	function codeDoc(item: string, label: string, value: string) {
		return { item, code_label: label, code_value: value, kind: 'code' as const };
	}

	it('returns one entry per code-bearing item, in item (sort_order) order', () => {
		const out = itemsWithCodes(
			[item('a', 'lodging'), item('b', 'flight')],
			[codeDoc('a', 'Conf #', 'ABC123'), codeDoc('b', 'PNR', 'XYZ789')]
		);
		expect(out.map((e) => e.item_id)).toEqual(['a', 'b']);
		expect(out[0].item_type).toBe('lodging');
		expect(out[0].codes).toHaveLength(1);
		expect(out[0].codes[0]).toEqual({ label: 'Conf #', value: 'ABC123' });
	});

	it('omits items with no code docs — independent of whether they have a file', () => {
		const out = itemsWithCodes(
			[item('a', 'meal'), item('b', 'lodging')],
			[codeDoc('b', 'C', 'X')]
		);
		expect(out.map((e) => e.item_id)).toEqual(['b']);
	});

	it('drops blank-value code docs, and the item if every code is blank', () => {
		const out = itemsWithCodes(
			[item('a', 'lodging'), item('b', 'flight')],
			[codeDoc('a', 'C', '   '), codeDoc('b', 'PNR', 'OK'), codeDoc('b', 'Seat', '')]
		);
		expect(out.map((e) => e.item_id)).toEqual(['b']);
		expect(out[0].codes).toHaveLength(1);
	});

	it('groups multiple code docs onto the same item, in input order', () => {
		const out = itemsWithCodes(
			[item('a', 'lodging')],
			[codeDoc('a', 'Conf #', 'ABC'), codeDoc('a', 'PIN', '4242')]
		);
		expect(out).toHaveLength(1);
		expect(out[0].codes.map((c) => c.value)).toEqual(['ABC', '4242']);
	});

	it('ignores trip-scoped (item-less) code docs and non-code docs', () => {
		const out = itemsWithCodes(
			[item('a', 'lodging')],
			[
				codeDoc('', 'Trip', 'WIFI'), // trip-scoped — dropped
				{ item: 'a', code_label: '', code_value: '', kind: 'file' as const }, // file — dropped
				codeDoc('a', 'C', 'X')
			]
		);
		expect(out.map((e) => e.item_id)).toEqual(['a']);
		expect(out[0].codes).toHaveLength(1);
	});

	it('handles empty input', () => {
		expect(itemsWithCodes([{ id: 'a', title: 'A', type: 'note' }], [])).toEqual([]);
		expect(itemsWithCodes([], [])).toEqual([]);
	});

	it('falls back to "Item" when the title is blank', () => {
		const out = itemsWithCodes(
			[{ id: 'x', title: '', type: 'activity' as ItemType }],
			[codeDoc('x', 'C', 'X')]
		);
		expect(out[0].item_title).toBe('Item');
	});
});
