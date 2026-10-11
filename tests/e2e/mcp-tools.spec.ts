import { test, expect } from '@playwright/test';
import { BASE, callTool, connect, rpc } from './mcp-helpers';
import { MCP_EMAILS, seedMcpTrips, type McpSeed } from './mcp-seed';
import { E2E_PB_BASE } from './e2e-env';

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

test.describe('search', () => {
	const titles = (r: { structured: { cards: { title: string }[] } }) => r.structured.cards.map((c) => c.title);

	test('finds the Lucerne hotel across trips, tagged with its trip', async () => {
		const r = await callTool(tokens.owner, 'search', { query: 'Lucerne', type: 'lodging' });
		const card = r.structured.cards.find((c: { title: string; tag: string }) => c.title === 'Hotel Schweizerhof' && c.tag === `E2E MCP Alps and Lisbon ${seed.suffix}`);
		expect(card).toBeTruthy();
		expect(card.lines.join(' ')).toContain(`id: ${seed.items.hotelLucerne}`);
	});

	test('filters by country', async () => {
		const r = await callTool(tokens.owner, 'search', { query: `restaurant ${seed.suffix}`, country: 'PT' });
		expect(titles(r)).toContain(`Taberna da Rua restaurant ${seed.suffix}`);
		const ch = await callTool(tokens.owner, 'search', { query: `restaurant ${seed.suffix}`, country: 'CH' });
		expect(titles(ch)).not.toContain(`Taberna da Rua restaurant ${seed.suffix}`);
	});

	test('covers day notes, codes, expenses and goals', async () => {
		const trip = seed.trips.current;
		expect((await callTool(tokens.owner, 'search', { trip, query: 'before 9' })).text).toContain('Call the host');
		expect((await callTool(tokens.owner, 'search', { trip, query: 'TAP9XZ' })).text).toContain('TP 123 to Lisbon');
		expect((await callTool(tokens.owner, 'search', { trip, query: 'Dinner' })).text).toContain('$90');
		expect((await callTool(tokens.owner, 'search', { trip, query: 'francesinha' })).text).toContain('Eat a francesinha');
	});

	test('never searches comments', async () => {
		const r = await callTool(tokens.owner, 'search', { trip: seed.trips.current, query: seed.commentText.split(' ').pop()! });
		expect(r.structured.cards).toHaveLength(0);
	});

	test('skips AI-off trips and says so', async () => {
		const r = await callTool(tokens.owner, 'search', { query: seed.offSecretText });
		expect(r.structured.cards).toHaveLength(0);
		// The heading echoes the query itself; the results must not carry it.
		expect(JSON.stringify(r.structured.skipped)).not.toContain(seed.offSecretText);
		expect(r.structured.skipped.map((s: { title: string }) => s.title)).toContain(`E2E MCP Private ${seed.suffix}`);
	});

	test('caps at 25 results and says how to narrow', async () => {
		// The seed's past trip has 30 "Museum visit N" items.
		const all = await callTool(tokens.owner, 'search', { trip: seed.trips.past, query: 'Museum visit' });
		expect(all.structured.total).toBeGreaterThan(25);
		expect(all.structured.cards).toHaveLength(25);
		expect(all.structured.heading).toMatch(/\+\d+ more — narrow by trip, type, or date/);
	});

	test('needs a query or a filter', async () => {
		const r = await callTool(tokens.owner, 'search', {});
		expect(r.isError).toBe(true);
	});
});

test.describe('get_item', () => {
	test('the full item: comments with author, codes, who is going', async () => {
		const r = await callTool(tokens.owner, 'get_item', { item: seed.items.overlapA });
		expect(r.text).toContain('Port cellar tour');
		expect(r.text).toContain(seed.commentText.replace(/\S+@\S+/, '[email removed]'));
		expect(r.text).toContain('Abby');
		const flight = await callTool(tokens.owner, 'get_item', { item: seed.items.flightWithCode });
		expect(flight.text).toContain('TAP9XZ');
	});

	test('an item on a foreign trip reveals nothing', async () => {
		const foreignItem = await callTool(tokens.outsider, 'get_item', { item: seed.items.overlapA });
		expect(foreignItem.isError).toBe(true);
		expect(foreignItem.text).not.toContain('Port cellar tour');
	});

	test('an item on an AI-off trip shows only the trip notice', async () => {
		const r = await callTool(tokens.owner, 'get_item', { item: seed.items.offSecret });
		expect(r.text).toContain('AI access is turned off');
		expect(JSON.stringify(r)).not.toContain(seed.offSecretText);
	});

	test('a viewer can read an item', async () => {
		const r = await callTool(tokens.viewer, 'get_item', { item: seed.items.overlapA });
		expect(r.isError).toBeFalsy();
		expect(r.text).toContain('Port cellar tour');
	});
});

test.describe('get_money', () => {
	test('balances and who owes whom, computed by Waypoint', async () => {
		const r = await callTool(tokens.owner, 'get_money', { trip: seed.trips.current });
		// $90 dinner split owner + Abby ($45 each), Abby paid back $15 → Abby owes $30.
		expect(r.text).toMatch(/Abby[^\n]*owes[^\n]*\$30/);
		expect(r.text).toContain('$90');
		expect(r.text).toMatch(/food[^\n]*\$90/i);
	});

	test('a viewer sees the same figures', async () => {
		const o = await callTool(tokens.owner, 'get_money', { trip: seed.trips.current });
		const v = await callTool(tokens.viewer, 'get_money', { trip: seed.trips.current });
		const strip = (cards: { title: string; lines: string[] }[]) => cards.filter((c) => c.title !== 'Your share');
		expect(strip(v.structured.cards)).toEqual(strip(o.structured.cards));
	});
});

test.describe('audit_trip', () => {
	test('lists what is missing on the current trip', async () => {
		const r = await callTool(tokens.owner, 'audit_trip', { trip: seed.trips.current });
		const t = r.text;
		expect(t).toContain('Train to Coimbra');
		expect(t).toContain('TP 456 home');
		expect(t).not.toMatch(/no confirmation code[^\n]*TP 123/);
		expect(t).toMatch(/Port cellar tour[^\n]*River cruise|River cruise[^\n]*Port cellar tour/);
		expect(t).toContain('Surf lesson in Matosinhos');
		expect(t).toContain('Adapter for');
		expect(t).not.toContain('Passports');
	});
});

test.describe('what_changed', () => {
	test('lists what was added since a time, then what was edited', async () => {
		const r = await callTool(tokens.owner, 'what_changed', { trip: seed.trips.current, since: seed.startedAt });
		const tc = r.structured.cards.find((c: { title: string }) => c.title === 'Train to Coimbra');
		expect(tc.tag).toMatch(/^added/);
		expect(r.structured.heading + r.text).toMatch(/deletions aren't tracked/i);

		const beforeEdit = new Date(Date.now() - 1000).toISOString();
		const bypass = await fetch(`${E2E_PB_BASE}/api/dev/auth-bypass`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: MCP_EMAILS.owner })
		}).then((x) => x.json());
		const patched = await fetch(`${E2E_PB_BASE}/api/collections/items/records/${seed.items.overlapB}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', Authorization: bypass.token },
			body: JSON.stringify({ description: 'Bring hats' })
		});
		expect(patched.ok).toBe(true);
		const r2 = await callTool(tokens.owner, 'what_changed', { trip: seed.trips.current, since: beforeEdit });
		const rc = r2.structured.cards.find((c: { title: string }) => c.title === 'River cruise');
		expect(rc.tag).toBe('edited');
		expect(r2.structured.cards.find((c: { title: string }) => c.title === 'Train to Coimbra')).toBeUndefined();
	});
});

test.describe('get_lists', () => {
	test('lists with tasks, open first, with assignee names', async () => {
		const r = await callTool(tokens.owner, 'get_lists', { trip: seed.trips.current });
		const packing = r.structured.cards.find((c: { title: string }) => c.title === 'Packing');
		expect(packing.lines[0]).toMatch(/^☐ Adapter for .* · Abby/);
		expect(packing.lines[1]).toBe('☑ Passports');
	});
});

test.describe('get_memories', () => {
	test('thoughts only, never the photo', async () => {
		const r = await callTool(tokens.owner, 'get_memories', { trip: seed.trips.current });
		expect(r.text).toContain('Sunset at the miradouro');
		const all = JSON.stringify(r);
		expect(all).not.toContain(seed.photoName);
		expect(all).not.toContain('/api/files/');
	});
});
