import { test, expect } from '@playwright/test';
import { callTool, connect, rpc } from './mcp-helpers';
import { MCP_EMAILS, PLANTED_EMAILS, seedMcpTrips, type McpSeed } from './mcp-seed';
import { E2E_PB_BASE } from './e2e-env';

// #503 / ADR-0025 — the MCP write tools, called the way the Claude connector
// calls them, as seeded users against the disposable PB. Assertions are on tool
// output and on what the trip looks like in PB afterwards.

test.describe.configure({ mode: 'serial' });

let seed: McpSeed;
const tokens: Record<'owner' | 'traveler' | 'viewer' | 'outsider', string> = {} as never;

async function pbAs(email: string) {
	const r = await fetch(`${E2E_PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email })
	});
	const token = ((await r.json()) as { token: string }).token;
	return async (method: string, path: string, body?: unknown) => {
		const res = await fetch(`${E2E_PB_BASE}${path}`, {
			method,
			headers: { 'content-type': 'application/json', Authorization: token },
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
	};
}

test.beforeAll(async () => {
	seed = await seedMcpTrips();
	for (const who of ['owner', 'traveler', 'viewer', 'outsider'] as const) {
		tokens[who] = (await connect(MCP_EMAILS[who])).access;
	}
});

test.describe('describe + authorship', () => {
	test('get_item says who added it, by name only', async () => {
		const owner = await pbAs(MCP_EMAILS.owner);
		const m = await owner('GET', `/api/collections/trip_members/records/${seed.members.owner}?expand=user&fields=display_name,expand.user.name`);
		const name = m.json.display_name || m.json.expand.user.name;
		const r = await callTool(tokens.owner, 'get_item', { item: seed.items.lodging });
		expect(r.text).toContain(`Added by ${name}`);
		expect(r.text).not.toMatch(/@/);
	});

	test('describe is listed with the write tools', async () => {
		const r = await rpc(tokens.owner, 'tools/list');
		const tools = r.json.result.tools as { name: string; annotations?: { readOnlyHint?: boolean } }[];
		expect(tools.map((t) => t.name)).toContain('describe');
	});

	test('describe names what is writable, and the trip\'s members, phases and days, without emails', async () => {
		const r = await callTool(tokens.owner, 'describe', { trip: seed.trips.current });
		const s = r.structured;
		expect(s.collections.map((c: { name: string }) => c.name)).toContain('items');
		expect(s.collections.map((c: { name: string }) => c.name)).not.toContain('trip_members');
		expect(s.members.map((m: { id: string }) => m.id)).toContain(seed.members.traveler);
		expect(s.phases.length).toBeGreaterThan(0);
		expect(s.days.map((d: { date: string }) => d.date)).toContain(seed.dates.today);
		const all = JSON.stringify(r);
		for (const e of PLANTED_EMAILS) expect(all.toLowerCase()).not.toContain(e.toLowerCase());
	});
});
