import { test, expect } from '@playwright/test';
import { callTool, connect, rpc } from './mcp-helpers';
import { MCP_EMAILS, PLANTED_EMAILS, seedMcpTrips, type McpSeed } from './mcp-seed';

// #502 — the ADR-0024 guarantees, swept over EVERY tool tools/list returns: no
// email and no photo in any output, an outsider learns nothing, an AI-off trip
// shows only its name and dates, a viewer can read everything. A tool added
// without an entry in argsFor fails the sweep rather than skipping it.

test.describe.configure({ mode: 'serial' });

let seed: McpSeed;
let toolNames: string[] = [];
const tokens: Record<'owner' | 'viewer' | 'outsider', string> = {} as never;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const AI_OFF = 'AI access is turned off for this trip by its owner.';

/**
 * Valid args for each tool, aimed at `trip`. `scoped` = takes a trip. `mutates`
 * (#503 write tools) = refused, not served, on an AI-off trip and for a viewer.
 */
function argsFor(name: string, trip: string): { args: Record<string, unknown>; scoped: boolean; mutates?: true; errors?: true } {
	const table: Record<string, { args: Record<string, unknown>; scoped: boolean; mutates?: true; errors?: true }> = {
		list_trips: { args: {}, scoped: false },
		get_trip: { args: { trip }, scoped: true },
		get_day: { args: { trip, date: 'today' }, scoped: true },
		search: { args: { trip, query: 'a' }, scoped: true },
		get_item: { args: { item: seed.items.overlapA }, scoped: false },
		get_money: { args: { trip }, scoped: true },
		audit_trip: { args: { trip }, scoped: true },
		what_changed: { args: { trip, since: seed.startedAt }, scoped: true },
		get_lists: { args: { trip }, scoped: true },
		get_memories: { args: { trip }, scoped: true },
		trip_brief: { args: { trip }, scoped: true },
		describe: { args: { trip }, scoped: true },
		// Proposes only (writes nothing); its preview shows a planted email's old value, which must be scrubbed.
		propose_changes: {
			args: { trip, quote: 'tidy the note', ops: [{ action: 'update', collection: 'items', id: seed.items.overlapA, data: { description: 'Booked' } }] },
			scoped: true,
			mutates: true
		},
		// No real proposal: refused ("expired"), and the refusal must leak nothing.
		commit_changes: { args: { proposal_id: 'no-such-proposal' }, scoped: false, errors: true },
		// A bogus id, never "latest": parallel specs share these users, and a sweep must not undo their changes.
		revert_change: { args: { change_id: 'nosuchchange123' }, scoped: false, errors: true }
	};
	const row = table[name];
	if (!row) throw new Error(`mcp-isolation: no sweep args for new tool "${name}"`);
	return row;
}

const dump = (r: { text: string; structured: unknown }) => `${r.text}\n${JSON.stringify(r.structured ?? {})}`;

test.beforeAll(async () => {
	seed = await seedMcpTrips();
	for (const who of ['owner', 'viewer', 'outsider'] as const) tokens[who] = (await connect(MCP_EMAILS[who])).access;
	const r = await rpc(tokens.owner, 'tools/list');
	toolNames = (r.json.result.tools as { name: string }[]).map((t) => t.name);
});

/** Every tool on the current trip, plus searches aimed at each planted shape, as the owner. */
async function ownerSweep(): Promise<string> {
	const out: string[] = [];
	for (const name of toolNames) out.push(dump(await callTool(tokens.owner, name, argsFor(name, seed.trips.current).args)));
	for (const id of Object.values(seed.items)) out.push(dump(await callTool(tokens.owner, 'get_item', { item: id })));
	for (const q of ['example', 'mailto', 'villa', 'bistro', 'pack', 'chat', 'mem', 'aim', 'tap', 'Abby', 'Kim', 'miradouro', 'pdf', 'files']) {
		out.push(dump(await callTool(tokens.owner, 'search', { query: q })));
	}
	out.push(dump(await callTool(tokens.owner, 'get_day', { trip: seed.trips.current, date: seed.dates.start })));
	out.push(dump(await callTool(tokens.owner, 'get_memories', { trip: seed.trips.current, date: seed.dates.start })));
	return out.join('\n');
}

test('every tool is covered by the sweep', () => {
	expect(toolNames.length).toBeGreaterThanOrEqual(13);
	for (const n of toolNames) argsFor(n, 'x');
});

test('no email and no photo in any output', async () => {
	const all = await ownerSweep();
	expect(all.match(EMAIL)?.[0] ?? null).toBeNull();
	for (const e of PLANTED_EMAILS) expect(all.toLowerCase()).not.toContain(e.toLowerCase().split('@')[1]);
	expect(all).not.toContain('/api/files/');
	expect(all).not.toContain(seed.photoName);
	expect(all).not.toContain('casa-confirmation');
	expect(all).not.toMatch(/"(cover_image|avatar|photo|file)"\s*:/);
	// The sweep did see the content around them.
	expect(all).toContain('Casa do Rio');
	expect(all).toContain('Sunset at the miradouro');
});

test('an outsider gets nothing from the trip', async () => {
	for (const name of toolNames) {
		const { args, scoped } = argsFor(name, seed.trips.current);
		if (!scoped && name !== 'get_item') continue;
		const r = await callTool(tokens.outsider, name, args);
		expect(r.isError, name).toBe(true);
		expect(r.text, name).not.toContain('Porto');
		expect(r.text, name).not.toContain('Casa do Rio');
		expect(r.text, name).not.toContain('Port cellar');
	}
	const all = dump(await callTool(tokens.outsider, 'search', { query: 'Casa' }));
	expect(all).not.toContain('Casa do Rio');
});

test('an AI-off trip shows only its name, dates and the notice', async () => {
	for (const name of toolNames) {
		const { args, scoped, mutates } = argsFor(name, seed.trips.off);
		if (!scoped) continue;
		const r = await callTool(tokens.owner, name, args);
		if (mutates) {
			expect(r.isError, name).toBe(true);
			expect(r.text, name).toBe(AI_OFF);
			continue;
		}
		expect(r.isError, name).toBeFalsy();
		expect(r.text, name).toContain(AI_OFF);
		expect(r.structured.cards, name).toHaveLength(1);
		expect(dump(r), name).not.toContain(seed.offSecretText);
	}
	const item = await callTool(tokens.owner, 'get_item', { item: seed.items.offSecret });
	expect(item.text).toContain(AI_OFF);
	expect(dump(item)).not.toContain(seed.offSecretText);
});

test('a viewer can use every read tool, and no write tool', async () => {
	for (const name of toolNames) {
		const { args, mutates, errors } = argsFor(name, seed.trips.current);
		const r = await callTool(tokens.viewer, name, args);
		if (mutates) expect(r.text, name).toBe("Viewers can't change this trip.");
		else if (errors) expect(r.isError, name).toBe(true);
		else expect(r.isError, `${name}: ${r.text}`).toBeFalsy();
	}
});

test("trip_brief: tonight's lodging and address, today's next item, today's code", async () => {
	const r = await callTool(tokens.owner, 'trip_brief', { trip: seed.trips.current });
	expect(r.isError).toBeFalsy();
	expect(r.text).toContain('Tonight: Casa do Rio');
	expect(r.text).toContain('Rua Nova 1, Porto');
	// Seeded today in UTC: flight 10–11, tour 14–16, cruise 15–17. The brief names
	// whichever hasn't ended yet, as now or next; after 17:00 none is left.
	const hour = new Date().getUTCHours();
	const live = [
		['TP 123 to Lisbon', 11],
		['Port cellar tour', 16],
		['River cruise', 17]
	].filter(([, end]) => hour < (end as number));
	for (const [title] of live) expect(r.text).toContain(title as string);
	expect(r.text).toContain('Picnic lunch');
	expect(r.text).toContain('TAP9XZ');
});

test('trip_brief without a trip briefs the trip happening now', async () => {
	const r = await callTool(tokens.viewer, 'trip_brief');
	expect(r.isError).toBeFalsy();
	// Other spec files seed their own "now" trips into the same PB; any of them is right.
	expect(r.structured.heading).toContain("E2E MCP Porto");
});
