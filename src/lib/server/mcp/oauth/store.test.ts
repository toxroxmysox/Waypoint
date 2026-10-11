import { describe, it, expect } from 'vitest';
import type PocketBase from 'pocketbase';
import { sweepExpiredTokens } from './store';

const DAY = 86400_000;
const NOW = Date.parse('2026-10-11T12:00:00Z');
const at = (ms: number) => new Date(ms).toISOString().replace('T', ' ');

function fakePb(rows: { id: string; kind: string; expires_at: string }[]) {
	const deleted: string[] = [];
	const pb = {
		filter: (raw: string) => raw,
		collection: () => ({
			getFullList: async () => rows,
			delete: async (id: string) => {
				deleted.push(id);
				return true;
			}
		})
	} as unknown as PocketBase;
	return { pb, deleted };
}

describe('sweepExpiredTokens (#512)', () => {
	it('deletes expired access tokens and long-rotated refresh rows, keeps live ones and the replay window', async () => {
		const { pb, deleted } = fakePb([
			{ id: 'a-old', kind: 'access', expires_at: at(NOW - 1000) },
			{ id: 'a-live', kind: 'access', expires_at: at(NOW + 3600_000) },
			{ id: 'r-rotated-long-ago', kind: 'refresh', expires_at: at(NOW - 31 * DAY) },
			{ id: 'r-rotated-yesterday', kind: 'refresh', expires_at: at(NOW - DAY) },
			{ id: 'r-live', kind: 'refresh', expires_at: at(NOW + 10 * DAY) }
		]);
		expect(await sweepExpiredTokens(NOW, pb)).toBe(2);
		expect(deleted.sort()).toEqual(['a-old', 'r-rotated-long-ago']);
	});
});
