import { test, expect } from '@playwright/test';
import { BASE, callTool, connect, rpc } from './mcp-helpers';
import { MCP_EMAILS, seedMcpTrips, type McpSeed } from './mcp-seed';

// #502 — the MCP read tools, called the way the Claude connector calls them, as
// seeded users against the disposable PB. Assertions are on tool output only.

test.describe.configure({ mode: 'serial' });

let seed: McpSeed;
const tokens: Record<'owner' | 'traveler' | 'viewer' | 'outsider', string> = {} as never;

test.beforeAll(async () => {
	seed = await seedMcpTrips();
	for (const who of ['owner', 'traveler', 'viewer', 'outsider'] as const) {
		tokens[who] = (await connect(MCP_EMAILS[who])).access;
	}
});

test.describe('list_trips', () => {
	test('owner sees their trips, with AI-off marked, never a trip they are not in', async () => {
		const r = await callTool(tokens.owner, 'list_trips');
		const titles = r.structured.cards.map((c: { title: string }) => c.title);
		expect(titles).toContain(`E2E MCP Porto ${seed.suffix}`);
		expect(titles).toContain(`E2E MCP Alps and Lisbon ${seed.suffix}`);
		expect(titles).not.toContain(`E2E MCP Not Yours ${seed.suffix}`);
		const off = r.structured.cards.find((c: { title: string }) => c.title === `E2E MCP Private ${seed.suffix}`);
		expect(off.tag).toContain('AI access off');
		const cur = r.structured.cards.find((c: { title: string }) => c.title === `E2E MCP Porto ${seed.suffix}`);
		expect(cur.tag).toBe('owner');
		expect(cur.lines.join(' ')).toContain(seed.trips.current);
	});

	test('viewer sees the trip with their role', async () => {
		const r = await callTool(tokens.viewer, 'list_trips');
		const cur = r.structured.cards.find((c: { title: string }) => c.title === `E2E MCP Porto ${seed.suffix}`);
		expect(cur.tag).toBe('viewer');
	});

	test('every tool is listed read-only', async () => {
		const r = await rpc(tokens.owner, 'tools/list');
		const tools = r.json.result.tools as { name: string; annotations?: { readOnlyHint?: boolean } }[];
		expect(tools.map((t) => t.name)).toContain('list_trips');
		for (const t of tools) expect(t.annotations?.readOnlyHint, t.name).toBe(true);
	});

	test('no token → 401 pointing at the protected-resource metadata', async () => {
		const res = await fetch(`${BASE}/mcp`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
		});
		expect(res.status).toBe(401);
		expect(res.headers.get('www-authenticate')).toContain(
			`resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"`
		);
	});
});
