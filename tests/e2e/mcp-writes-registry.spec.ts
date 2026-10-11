import { test, expect } from '@playwright/test';
import { E2E_PB_BASE } from './e2e-env';
import { superuser } from './mcp-seed';
import { WRITABLE, BLOCKED_COLLECTIONS } from '../../src/lib/server/mcp/writes/registry';

// #503 / ADR-0025 — every PB collection is either AI-writable or on the
// can't-list. A new collection fails this until someone decides which, and the
// invariant audit (docs/plans/2026-10-11-mcp-writes/invariant-audit.md) says
// why its form-only rules are safe for generic writes.
test('every PB collection is classified', async () => {
	const su = await superuser();
	const res = await fetch(`${E2E_PB_BASE}/api/collections?perPage=500`, { headers: { Authorization: su } });
	expect(res.ok).toBe(true);
	const { items } = (await res.json()) as { items: { name: string; system: boolean }[] };
	const unclassified = items
		.filter((c) => !c.system)
		.map((c) => c.name)
		.filter((n) => !WRITABLE[n] && !BLOCKED_COLLECTIONS.includes(n));
	expect(unclassified).toEqual([]);
});
