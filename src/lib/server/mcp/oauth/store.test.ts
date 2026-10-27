import { describe, it, expect, vi } from 'vitest';
import type PocketBase from 'pocketbase';
import { rotateRefresh, sweepExpiredTokens } from './store';

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

// #520 — a transient PB error on refresh must not force re-auth, nor orphan a row.
const fake = vi.hoisted(() => ({ pb: null as unknown }));
vi.mock('../admin-pb', () => ({ adminPb: async () => fake.pb }));

function rotatePb(opts: { failAccess?: boolean; failRefresh?: boolean; winner?: boolean }) {
	const created: Record<string, unknown>[] = [];
	const deleted: string[] = [];
	const updated: string[] = [];
	const old = {
		id: 'old',
		kind: 'refresh',
		connection: 'c1',
		expires_at: new Date(Date.now() + DAY).toISOString(),
		expand: { connection: { id: 'c1', client_id: 'claude' } }
	};
	fake.pb = {
		filter: (raw: string, p: Record<string, string>) => `${raw}|${JSON.stringify(p)}`,
		collection: () => ({
			getFirstListItem: async (f: string) => {
				if (f.includes('rotated_from')) {
					if (opts.winner) return { id: 'won' };
					throw new Error('404');
				}
				return old;
			},
			create: async (d: Record<string, unknown>) => {
				if (d.kind === 'refresh' && opts.failRefresh) throw new Error('db busy');
				if (d.kind === 'access' && opts.failAccess) throw new Error('db busy');
				created.push(d);
				return { id: `new-${d.kind}` };
			},
			delete: async (id: string) => {
				deleted.push(id);
				return true;
			},
			update: async (id: string) => {
				updated.push(id);
				return {};
			},
			getFullList: async () => []
		})
	};
	return { created, deleted, updated };
}

describe('rotateRefresh — transient errors (#520)', () => {
	it('a failed access insert removes the new refresh row and keeps the old token usable', async () => {
		const s = rotatePb({ failAccess: true });
		const r = await rotateRefresh({ refresh_token: 'tok', client_id: 'claude' });
		expect(r).toMatchObject({ error: 'server_error' });
		expect(s.deleted).toEqual(['new-refresh']);
		expect(s.updated).toEqual([]);
	});

	it('a transient refresh insert error is a server_error, not invalid_grant', async () => {
		rotatePb({ failRefresh: true });
		expect(await rotateRefresh({ refresh_token: 'tok', client_id: 'claude' })).toMatchObject({
			error: 'server_error'
		});
	});

	it('losing a concurrent rotation is still invalid_grant', async () => {
		rotatePb({ failRefresh: true, winner: true });
		expect(await rotateRefresh({ refresh_token: 'tok', client_id: 'claude' })).toMatchObject({
			error: 'invalid_grant'
		});
	});
});
