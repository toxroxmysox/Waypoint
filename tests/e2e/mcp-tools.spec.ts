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

test.describe('get_day', () => {
	const titles = (r: { structured: { cards: { title: string }[] } }) => r.structured.cards.map((c) => c.title);

	test('today: the stay first, then the day in app order, then day notes', async () => {
		const r = await callTool(tokens.owner, 'get_day', { trip: seed.trips.current, date: 'today' });
		const t = titles(r);
		expect(t[0]).toBe('Casa do Rio');
		expect(r.structured.cards[0].lines.join(' ')).toContain('Night 2 of 3');
		expect(t.slice(1, 6)).toEqual(['TP 123 to Lisbon', 'Port cellar tour', 'River cruise', 'Picnic lunch', 'Day notes']);
		expect(r.structured.cards[1].lines.join(' ')).toContain('10:00a');
		expect(r.structured.cards[1].tag).toBe('booked');
		expect(r.text).toContain('Call the host before 9.');
	});

	test('the last day shows the stay as check-out', async () => {
		const r = await callTool(tokens.owner, 'get_day', { trip: seed.trips.current, date: seed.dates.last });
		const stay = r.structured.cards.find((c: { title: string }) => c.title === 'Casa do Rio');
		expect(stay.lines.join(' ')).toMatch(/Check-out/);
	});

	test('a date outside the trip is a note, not an error', async () => {
		const r = await callTool(tokens.owner, 'get_day', { trip: seed.trips.current, date: '2001-01-01' });
		expect(r.isError).toBeFalsy();
		expect(r.structured.note).toBe('That date is outside the trip.');
	});

	test('an AI-off trip shows only its name, dates and the notice', async () => {
		const r = await callTool(tokens.owner, 'get_day', { trip: seed.trips.off });
		expect(r.text).toContain('AI access is turned off for this trip by its owner.');
		expect(JSON.stringify(r)).not.toContain(seed.offSecretText);
	});

	test('an ambiguous trip name asks which one', async () => {
		const r = await callTool(tokens.owner, 'get_day', { trip: 'E2E MCP' });
		expect(r.isError).toBe(true);
		expect(r.text).toContain('matches several trips');
	});

	test('a trip the user is not in is not found', async () => {
		const r = await callTool(tokens.owner, 'get_day', { trip: seed.trips.foreign });
		expect(r.isError).toBe(true);
		expect(r.text).toContain('No trip matching');
		expect(r.text).not.toContain('Not Yours');
	});
});

test.describe('get_trip', () => {
	test('overview: phases, nights, members, goals, ideas', async () => {
		const r = await callTool(tokens.owner, 'get_trip', { trip: seed.trips.current });
		const text = r.text;
		expect(text).toContain('Porto');
		// One sleep card per night; all three nights at Casa do Rio.
		const nights = r.structured.cards.filter((c: { tag?: string }) => c.tag === 'night');
		expect(nights).toHaveLength(3);
		for (const n of nights) expect(n.lines.join(' ')).toContain('Casa do Rio');
		expect(text).toContain('Vic');
		expect(text).toContain('Abby');
		expect(text).toContain('Eat a francesinha');
		expect(text).toMatch(/Surf lesson in Matosinhos[\s\S]*2 votes/);
	});

	test('a night with no lodging says so', async () => {
		const r = await callTool(tokens.owner, 'get_trip', { trip: seed.trips.off });
		expect(r.text).toContain('AI access is turned off');
		const p = await callTool(tokens.owner, 'get_trip', { trip: seed.trips.past });
		const nights = p.structured.cards.filter((c: { tag?: string }) => c.tag === 'night');
		expect(nights.some((n: { lines: string[] }) => n.lines.join(' ').includes('no lodging'))).toBe(true);
	});

	test('viewer gets the same overview', async () => {
		const o = await callTool(tokens.owner, 'get_trip', { trip: seed.trips.current });
		const v = await callTool(tokens.viewer, 'get_trip', { trip: seed.trips.current });
		expect(v.structured.cards).toEqual(o.structured.cards);
	});
});
