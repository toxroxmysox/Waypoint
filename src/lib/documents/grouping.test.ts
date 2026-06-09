import { describe, it, expect } from 'vitest';
import { groupDocuments, documentTypeBreakdown } from './grouping';
import type { DocumentView } from './types';

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
