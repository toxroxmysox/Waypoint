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
		const propose = tools.find((t) => t.name === 'propose_changes');
		expect(propose, 'propose_changes listed').toBeTruthy();
		expect(propose!.annotations?.readOnlyHint).toBe(false);
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

let proposalId = '';
const RENAME = 'Lunch at Taberna';
const QUOTE = 'call it Lunch at Taberna';

test.describe('propose_changes', () => {
	test('owner proposes a rename: preview with the change and their words, nothing written yet', async () => {
		const r = await callTool(tokens.owner, 'propose_changes', {
			trip: seed.trips.current,
			quote: QUOTE,
			ops: [{ action: 'update', collection: 'items', id: seed.items.untimedMeal, data: { title: RENAME } }]
		});
		expect(r.isError, r.text).toBeFalsy();
		proposalId = r.structured.proposal.id;
		expect(proposalId).toBeTruthy();
		expect(r.structured.proposal.quote).toBe(QUOTE);
		expect(r.structured.proposal.outcome).toBe('Saved');
		const card = r.structured.cards.find((c: { changes?: unknown[] }) => c.changes);
		expect(card.changes).toContainEqual({ field: 'Title', from: 'Picnic lunch', to: RENAME });
		expect(r.text).toContain(QUOTE);
		const owner = await pbAs(MCP_EMAILS.owner);
		expect((await owner('GET', `/api/collections/items/records/${seed.items.untimedMeal}`)).json.title).toBe('Picnic lunch');
	});

	test('a viewer is refused', async () => {
		const r = await callTool(tokens.viewer, 'propose_changes', {
			trip: seed.trips.current,
			quote: 'rename it',
			ops: [{ action: 'update', collection: 'items', id: seed.items.untimedMeal, data: { title: 'x' } }]
		});
		expect(r.isError).toBe(true);
		expect(r.text).toBe("Viewers can't change this trip.");
	});

	test('a trip with AI changes off is refused', async () => {
		const r = await callTool(tokens.owner, 'propose_changes', {
			trip: seed.trips.noWrite,
			quote: 'rename the trip',
			ops: [{ action: 'update', collection: 'trips', id: seed.tripIds.noWrite, data: { title: 'x' } }]
		});
		expect(r.isError).toBe(true);
		expect(r.text).toBe('AI changes are turned off for this trip by its owner.');
	});

	test("the can't-list is refused: members, AI settings, authorship", async () => {
		const ask = (ops: unknown[]) => callTool(tokens.owner, 'propose_changes', { trip: seed.trips.current, quote: 'do it', ops });
		expect((await ask([{ action: 'update', collection: 'trip_members', id: seed.members.traveler, data: { role: 'viewer' } }])).text).toBe(
			"I can't change a trip's members."
		);
		expect((await ask([{ action: 'update', collection: 'trips', id: seed.tripIds.current, data: { ai_access: false } }])).text).toContain(
			"I can't change AI settings"
		);
		expect((await ask([{ action: 'update', collection: 'items', id: seed.items.untimedMeal, data: { created_by: seed.members.traveler } }])).isError).toBe(true);
	});
});

async function myAiChanges(email: string) {
	const pb = await pbAs(email);
	const rows = (await pb('GET', '/api/collections/ai_changes/records?perPage=200&sort=-created')).json.items as {
		id: string;
		quote: string;
		user: string;
		trip: string;
		reverted_at: string;
		changes: unknown[];
	}[];
	// Only this seed's trips: a retry re-seeds and re-runs with the same quotes.
	const mine = new Set(Object.values(seed.tripIds));
	return rows.filter((r) => mine.has(r.trip));
}
const propose = (who: keyof typeof tokens, trip: string, quote: string, ops: unknown[]) =>
	callTool(tokens[who], 'propose_changes', { trip, quote, ops });
const commit = (who: keyof typeof tokens, id: string) => callTool(tokens[who], 'commit_changes', { proposal_id: id });

test.describe('commit_changes', () => {
	test('commit writes the change and a private AI Change with the user\'s words', async () => {
		const r = await commit('owner', proposalId);
		expect(r.isError, r.text).toBeFalsy();
		expect(r.text).toContain('Saved');
		const owner = await pbAs(MCP_EMAILS.owner);
		expect((await owner('GET', `/api/collections/items/records/${seed.items.untimedMeal}`)).json.title).toBe(RENAME);
		const rows = (await myAiChanges(MCP_EMAILS.owner)).filter((x) => x.quote === QUOTE);
		expect(rows).toHaveLength(1);
		expect((await myAiChanges(MCP_EMAILS.traveler)).filter((x) => x.quote === QUOTE)).toHaveLength(0);
	});

	test('a double commit saves once (Review Focus 2)', async () => {
		const r = await commit('owner', proposalId);
		expect(r.isError).toBeFalsy();
		expect(r.text).toContain('Already saved');
		expect((await myAiChanges(MCP_EMAILS.owner)).filter((x) => x.quote === QUOTE)).toHaveLength(1);
	});

	test('a stale preview is refused and writes nothing', async () => {
		const p = await propose('owner', seed.trips.current, 'rename the train', [
			{ action: 'update', collection: 'items', id: seed.items.unbooked, data: { title: 'Train to Aveiro' } }
		]);
		const owner = await pbAs(MCP_EMAILS.owner);
		await owner('PATCH', `/api/collections/items/records/${seed.items.unbooked}`, { title: 'Train to Braga' });
		const r = await commit('owner', p.structured.proposal.id);
		expect(r.isError).toBe(true);
		expect(r.text).toContain('changed since the preview (title)');
		expect((await owner('GET', `/api/collections/items/records/${seed.items.unbooked}`)).json.title).toBe('Train to Braga');
	});

	test('someone else cannot commit your proposal (Review Focus 3)', async () => {
		const p = await propose('owner', seed.trips.current, 'rename the cruise', [
			{ action: 'update', collection: 'items', id: seed.items.overlapB, data: { title: 'Douro cruise' } }
		]);
		const r = await commit('traveler', p.structured.proposal.id);
		expect(r.isError).toBe(true);
		const owner = await pbAs(MCP_EMAILS.owner);
		expect((await owner('GET', `/api/collections/items/records/${seed.items.overlapB}`)).json.title).toBe('River cruise');
	});

	test('AI changes switched off after the preview refuses the commit (Review Focus 4)', async () => {
		const p = await propose('owner', seed.trips.current, 'rename the cruise', [
			{ action: 'update', collection: 'items', id: seed.items.overlapB, data: { title: 'Douro cruise' } }
		]);
		const owner = await pbAs(MCP_EMAILS.owner);
		await owner('PATCH', `/api/collections/trips/records/${seed.tripIds.current}`, { ai_write: false });
		const r = await commit('owner', p.structured.proposal.id);
		await owner('PATCH', `/api/collections/trips/records/${seed.tripIds.current}`, { ai_write: true });
		expect(r.isError).toBe(true);
		expect(r.text).toBe('AI changes are turned off for this trip by its owner.');
		expect((await owner('GET', `/api/collections/items/records/${seed.items.overlapB}`)).json.title).toBe('River cruise');
	});

	test('all-or-nothing: one bad op and nothing is written', async () => {
		const p = await propose('owner', seed.trips.current, 'rename the cruise and end the stay on arrival', [
			{ action: 'update', collection: 'items', id: seed.items.overlapB, data: { title: 'Douro cruise' } },
			{ action: 'update', collection: 'items', id: seed.items.lodging, data: { end_date: seed.dates.start } }
		]);
		expect(p.isError, p.text).toBeFalsy();
		const r = await commit('owner', p.structured.proposal.id);
		expect(r.isError).toBe(true);
		expect(r.text).toMatch(/end date/i);
		// Says which change PB refused.
		expect(r.text).toContain('Casa do Rio');
		const owner = await pbAs(MCP_EMAILS.owner);
		expect((await owner('GET', `/api/collections/items/records/${seed.items.overlapB}`)).json.title).toBe('River cruise');
	});

	test('a traveler adding an item sends it to the owners as a suggestion', async () => {
		const title = `Cooking class ${seed.suffix}`;
		const p = await propose('traveler', seed.trips.current, 'add the cooking class tomorrow', [
			{ action: 'create', collection: 'items', data: { type: 'activity', title, date: seed.dates.tomorrow } }
		]);
		expect(p.isError, p.text).toBeFalsy();
		expect(p.structured.proposal.outcome).toBe('Sent to the owners as a suggestion');
		const r = await commit('traveler', p.structured.proposal.id);
		expect(r.isError, r.text).toBeFalsy();
		const owner = await pbAs(MCP_EMAILS.owner);
		const items = (await owner('GET', `/api/collections/items/records?filter=${encodeURIComponent(`title = "${title}"`)}`)).json.items;
		expect(items).toHaveLength(0);
		const sug = await owner('GET', `/api/suggestions/list?trip_id=${seed.tripIds.current}&status=pending`);
		expect(JSON.stringify(sug.json)).toContain(title);
	});

	test('a trip-date shrink commits the phases the preview showed', async () => {
		const owner = await pbAs(MCP_EMAILS.owner);
		const trip = (await owner('GET', `/api/collections/trips/records/${seed.tripIds.past}`)).json;
		const start = String(trip.start_date).slice(0, 10);
		const newEnd = new Date(Date.parse(`${start}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10);
		const p = await propose('owner', seed.trips.past, 'cut the last day', [
			{ action: 'update', collection: 'trips', id: seed.tripIds.past, data: { end_date: newEnd } }
		]);
		expect(p.isError, p.text).toBeFalsy();
		expect(p.text).toContain('removed');
		expect(p.text).toContain('Lisbon merges into the phase before it');
		expect(p.text).toMatch(/1 item becomes an idea in Lucerne: Taberna da Rua/);
		expect(p.structured.proposal.calendar.after).toEqual([start, newEnd]);
		const r = await commit('owner', p.structured.proposal.id);
		expect(r.isError, r.text).toBeFalsy();
		const phases = (
			await owner('GET', `/api/collections/phases/records?sort=start_date&filter=${encodeURIComponent(`trip = "${seed.tripIds.past}"`)}`)
		).json.items.map((x: { name: string; start_date: string; end_date: string }) => [x.name, x.start_date.slice(0, 10), x.end_date.slice(0, 10)]);
		expect(phases).toEqual([['Lucerne', start, newEnd]]);
		const restaurant = (await owner('GET', `/api/collections/items/records/${seed.items.restaurantLisbon}`)).json;
		expect(restaurant.day).toBe('');
	});
});

test.describe('revert_change', () => {
	test('the traveler cannot undo the owner\'s change', async () => {
		const [row] = (await myAiChanges(MCP_EMAILS.owner)).filter((x) => x.quote === QUOTE);
		const r = await callTool(tokens.traveler, 'revert_change', { change_id: row.id });
		expect(r.isError).toBe(true);
		const owner = await pbAs(MCP_EMAILS.owner);
		expect((await owner('GET', `/api/collections/items/records/${seed.items.untimedMeal}`)).json.title).toBe(RENAME);
	});

	test('"undo that" restores the rename by id and marks the change undone; twice says Already undone', async () => {
		const [row] = (await myAiChanges(MCP_EMAILS.owner)).filter((x) => x.quote === QUOTE);
		const r = await callTool(tokens.owner, 'revert_change', { change_id: row.id });
		expect(r.isError, r.text).toBeFalsy();
		const owner = await pbAs(MCP_EMAILS.owner);
		expect((await owner('GET', `/api/collections/items/records/${seed.items.untimedMeal}`)).json.title).toBe('Picnic lunch');
		const [after] = (await myAiChanges(MCP_EMAILS.owner)).filter((x) => x.quote === QUOTE);
		expect(after.reverted_at).toBeTruthy();
		expect((await callTool(tokens.owner, 'revert_change', { change_id: row.id })).text).toContain('Already undone');
	});

	test('with no id it undoes my latest change: the traveler\'s pending suggestion is withdrawn', async () => {
		const r = await callTool(tokens.traveler, 'revert_change', {});
		expect(r.isError, r.text).toBeFalsy();
		const owner = await pbAs(MCP_EMAILS.owner);
		const sug = await owner('GET', `/api/suggestions/list?trip_id=${seed.tripIds.current}&status=pending`);
		expect(JSON.stringify(sug.json)).not.toContain(`Cooking class ${seed.suffix}`);
	});
});

test.describe('final review fixes', () => {
	test('a PB field modifier cannot slip past the can\'t-list (review C1)', async () => {
		for (const key of ['created_by+', 'trip+']) {
			const r = await propose('owner', seed.trips.current, 'x', [
				{ action: 'update', collection: 'items', id: seed.items.overlapA, data: { [key]: seed.members.traveler } }
			]);
			expect(r.isError, key).toBe(true);
		}
	});

	test('undo from chat honours "AI can make changes" (review I2)', async () => {
		const quote = `rename the tour ${seed.suffix}`;
		const p = await propose('owner', seed.trips.current, quote, [
			{ action: 'update', collection: 'items', id: seed.items.overlapA, data: { title: 'Cellar tour' } }
		]);
		expect((await commit('owner', p.structured.proposal.id)).isError).toBeFalsy();
		const [row] = (await myAiChanges(MCP_EMAILS.owner)).filter((x) => x.quote === quote);
		const owner = await pbAs(MCP_EMAILS.owner);
		await owner('PATCH', `/api/collections/trips/records/${seed.tripIds.current}`, { ai_write: false });
		const r = await callTool(tokens.owner, 'revert_change', { change_id: row.id });
		await owner('PATCH', `/api/collections/trips/records/${seed.tripIds.current}`, { ai_write: true });
		expect(r.isError).toBe(true);
		expect(r.text).toBe('AI changes are turned off for this trip by its owner.');
		expect((await owner('GET', `/api/collections/items/records/${seed.items.overlapA}`)).json.title).toBe('Cellar tour');
	});

	test('Confirm and "yes" at the same moment save once (review I3)', async () => {
		const quote = `call it Cellar tour and tasting ${seed.suffix}`;
		const p = await propose('owner', seed.trips.current, quote, [
			{ action: 'update', collection: 'items', id: seed.items.overlapA, data: { title: 'Cellar tour and tasting' } }
		]);
		const [a, b] = await Promise.all([commit('owner', p.structured.proposal.id), commit('owner', p.structured.proposal.id)]);
		expect([a.text, b.text].filter((t) => t.includes('Already saved'))).toHaveLength(1);
		expect((await myAiChanges(MCP_EMAILS.owner)).filter((x) => x.quote === quote)).toHaveLength(1);
	});

	test('a very long quote still saves with its undo record (review I4)', async () => {
		const quote = `long ${seed.suffix} ` + 'x'.repeat(2500);
		const p = await propose('owner', seed.trips.current, quote, [
			{ action: 'update', collection: 'items', id: seed.items.overlapA, data: { title: 'Cellar tour' } }
		]);
		expect(p.isError, p.text).toBeFalsy();
		const r = await commit('owner', p.structured.proposal.id);
		expect(r.isError, r.text).toBeFalsy();
		const rows = (await myAiChanges(MCP_EMAILS.owner)).filter((x) => x.quote.startsWith(`long ${seed.suffix}`));
		expect(rows).toHaveLength(1);
		expect(rows[0].quote.length).toBeLessThanOrEqual(2000);
	});

	test('undoing an add leaves it when another member has commented on it (review I5)', async () => {
		const quote = `add a wine bar ${seed.suffix}`;
		const title = `Wine bar ${seed.suffix}`;
		const p = await propose('owner', seed.trips.current, quote, [
			{ action: 'create', collection: 'items', data: { type: 'activity', title, date: seed.dates.tomorrow } }
		]);
		expect((await commit('owner', p.structured.proposal.id)).isError).toBeFalsy();
		const owner = await pbAs(MCP_EMAILS.owner);
		const item = (await owner('GET', `/api/collections/items/records?filter=${encodeURIComponent(`title = "${title}"`)}`)).json.items[0];
		const traveler = await pbAs(MCP_EMAILS.traveler);
		const c = await traveler('POST', '/api/comments/add', { item_id: item.id, comment_text: 'Count me in' });
		expect(c.status, JSON.stringify(c.json)).toBe(200);
		const [row] = (await myAiChanges(MCP_EMAILS.owner)).filter((x) => x.quote === quote);
		const r = await callTool(tokens.owner, 'revert_change', { change_id: row.id });
		expect(r.text).toContain('remove it in the app');
		expect((await owner('GET', `/api/collections/items/records/${item.id}`)).status).toBe(200);
	});
});
