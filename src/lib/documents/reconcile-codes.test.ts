import { describe, it, expect } from 'vitest';
import { normalizeCodes, reconcileItemCodes } from './reconcile-codes';

// #268 / ADR-0016 — reconciliation is the #1 correctness risk: upsert-by-(label,
// value) + delete-missing, touching ONLY this item's code docs. A naive
// delete-all-recreate would churn ids/timestamps; assert we DON'T.

describe('normalizeCodes', () => {
	it('trims, drops value-less rows, dedupes identical pairs', () => {
		expect(
			normalizeCodes([
				{ label: ' Conf ', value: ' ABC ' },
				{ label: 'Empty', value: '   ' }, // value-less → dropped
				{ label: '', value: '' }, // blank editor line → dropped
				{ label: 'Conf', value: 'ABC' } // dup of the first (post-trim) → dropped
			])
		).toEqual([{ label: 'Conf', value: 'ABC' }]);
	});

	it('keeps a code with a blank label but a real value', () => {
		expect(normalizeCodes([{ label: '', value: 'X' }])).toEqual([{ label: '', value: 'X' }]);
	});
});

// A minimal fake PocketBase that records create/delete calls and serves a fixed
// existing set scoped to the item filter.
function fakePb(existing: { id: string; item: string; code_label: string; code_value: string }[]) {
	const created: { code_label: string; code_value: string; item: string; trip: string; kind: string }[] = [];
	const deleted: string[] = [];
	const pb = {
		collection() {
			return {
				async getFullList() {
					// reconcile filters to this item + kind=code; the fixture is already scoped.
					return existing.filter((d) => !deleted.includes(d.id));
				},
				async create(body: Record<string, unknown>) {
					created.push(body as never);
					return { id: `new-${created.length}` };
				},
				async delete(id: string) {
					deleted.push(id);
				}
			};
		}
	};
	return { pb: pb as never, created, deleted };
}

describe('reconcileItemCodes', () => {
	it('creates new, keeps unchanged (no churn), deletes removed', async () => {
		const existing = [
			{ id: 'keep', item: 'i1', code_label: 'Conf', code_value: 'KEEP' },
			{ id: 'gone', item: 'i1', code_label: 'PNR', code_value: 'REMOVE' }
		];
		const { pb, created, deleted } = fakePb(existing);

		await reconcileItemCodes(pb, 'trip1', 'i1', [
			{ label: 'Conf', value: 'KEEP' }, // unchanged → kept, NOT recreated
			{ label: 'New', value: 'ADD' } // new → created
		]);

		// 'keep' survived untouched (not deleted, not recreated).
		expect(deleted).toEqual(['gone']);
		expect(created).toHaveLength(1);
		expect(created[0]).toMatchObject({
			kind: 'code',
			trip: 'trip1',
			item: 'i1',
			code_label: 'New',
			code_value: 'ADD'
		});
	});

	it('a changed value reads as remove-old + add-new', async () => {
		const existing = [{ id: 'old', item: 'i1', code_label: 'Conf', code_value: 'OLD' }];
		const { pb, created, deleted } = fakePb(existing);

		await reconcileItemCodes(pb, 'trip1', 'i1', [{ label: 'Conf', value: 'NEW' }]);

		expect(deleted).toEqual(['old']);
		expect(created).toHaveLength(1);
		expect(created[0]).toMatchObject({ code_value: 'NEW' });
	});

	it('empties all codes → deletes every existing, creates none', async () => {
		const existing = [
			{ id: 'a', item: 'i1', code_label: 'C', code_value: 'X' },
			{ id: 'b', item: 'i1', code_label: 'D', code_value: 'Y' }
		];
		const { pb, created, deleted } = fakePb(existing);

		await reconcileItemCodes(pb, 'trip1', 'i1', []);

		expect(deleted.sort()).toEqual(['a', 'b']);
		expect(created).toHaveLength(0);
	});

	it('no existing + a fresh list → pure creates', async () => {
		const { pb, created, deleted } = fakePb([]);

		await reconcileItemCodes(pb, 'trip1', 'i1', [
			{ label: 'A', value: '1' },
			{ label: 'B', value: '2' }
		]);

		expect(deleted).toHaveLength(0);
		expect(created.map((c) => c.code_value)).toEqual(['1', '2']);
	});

	it('drops a duplicate existing row even when the value is still desired', async () => {
		// Two existing docs with the same (label,value); the desired list wants it once.
		const existing = [
			{ id: 'dup1', item: 'i1', code_label: 'C', code_value: 'X' },
			{ id: 'dup2', item: 'i1', code_label: 'C', code_value: 'X' }
		];
		const { pb, created, deleted } = fakePb(existing);

		await reconcileItemCodes(pb, 'trip1', 'i1', [{ label: 'C', value: 'X' }]);

		// One kept, the duplicate deleted; nothing recreated.
		expect(deleted).toEqual(['dup2']);
		expect(created).toHaveLength(0);
	});
});
