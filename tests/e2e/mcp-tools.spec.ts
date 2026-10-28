import { test, expect } from '@playwright/test';
import { BASE, callTool, connect, rpc } from './mcp-helpers';
import { MCP_EMAILS, seedMcpTrips, superuser, type McpSeed } from './mcp-seed';
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
		const off = r.structured.cards.find(
			(c: { title: string }) => c.title === `E2E MCP Private ${seed.suffix}`
		);
		expect(off.tag).toContain('AI access off');
		const cur = r.structured.cards.find(
			(c: { title: string }) => c.title === `E2E MCP Porto ${seed.suffix}`
		);
		expect(cur.tag).toBe('owner');
		expect(cur.lines.join(' ')).toContain(seed.trips.current);
	});

	test('viewer sees the trip with their role', async () => {
		const r = await callTool(tokens.viewer, 'list_trips');
		const cur = r.structured.cards.find(
			(c: { title: string }) => c.title === `E2E MCP Porto ${seed.suffix}`
		);
		expect(cur.tag).toBe('viewer');
	});

	test('every read tool is listed read-only', async () => {
		const r = await rpc(tokens.owner, 'tools/list');
		const tools = r.json.result.tools as {
			name: string;
			annotations?: { readOnlyHint?: boolean };
		}[];
		expect(tools.map((t) => t.name)).toContain('list_trips');
		// #503: the write tools (propose/commit/revert) are the only non-read-only ones.
		const writes = new Set(['propose_changes', 'commit_changes', 'revert_change']);
		for (const t of tools) expect(t.annotations?.readOnlyHint, t.name).toBe(!writes.has(t.name));
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
	const titles = (r: { structured: { cards: { title: string }[] } }) =>
		r.structured.cards.map((c) => c.title);

	test('today: the stay first, then the day in app order, then day notes', async () => {
		const r = await callTool(tokens.owner, 'get_day', { trip: seed.trips.current, date: 'today' });
		const t = titles(r);
		expect(t[0]).toBe('Casa do Rio');
		expect(r.structured.cards[0].lines.join(' ')).toContain('Night 2 of 3');
		expect(t.slice(1, 6)).toEqual([
			'TP 123 to Lisbon',
			'Port cellar tour',
			'River cruise',
			'Picnic lunch',
			'Day notes'
		]);
		expect(r.structured.cards[1].lines.join(' ')).toContain('10:00a');
		expect(r.structured.cards[1].tag).toBe('booked');
		expect(r.text).toContain('Call the host before 9.');
	});

	test('the last day shows the stay as check-out', async () => {
		const r = await callTool(tokens.owner, 'get_day', {
			trip: seed.trips.current,
			date: seed.dates.last
		});
		const stay = r.structured.cards.find((c: { title: string }) => c.title === 'Casa do Rio');
		expect(stay.lines.join(' ')).toMatch(/Check-out/);
	});

	test('a date outside the trip is a note, not an error', async () => {
		const r = await callTool(tokens.owner, 'get_day', {
			trip: seed.trips.current,
			date: '2001-01-01'
		});
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
		// #512: a run of nights at one place is one card; all three nights at Casa do Rio.
		const nights = r.structured.cards.filter(
			(c: { tag?: string }) => c.tag === 'night' || c.tag === 'nights'
		);
		expect(nights).toHaveLength(1);
		expect(nights[0].lines.join(' ')).toContain('Casa do Rio · 3 nights');
		expect(text).toContain('Vic');
		expect(text).toContain('Abby');
		expect(text).toContain('Eat a francesinha');
		// A member with no display name reads as the app shows them (account name), never "member".
		const membersCard = r.structured.cards.find((c: { title: string }) => c.title === 'Members');
		expect(membersCard.lines.join('\n')).not.toMatch(/^member ·/m);
		expect(text).toMatch(/Surf lesson in Matosinhos[\s\S]*2 votes/);
	});

	test('a night with no lodging says so', async () => {
		const r = await callTool(tokens.owner, 'get_trip', { trip: seed.trips.off });
		expect(r.text).toContain('AI access is turned off');
		const p = await callTool(tokens.owner, 'get_trip', { trip: seed.trips.past });
		const nights = p.structured.cards.filter(
			(c: { tag?: string }) => c.tag === 'night' || c.tag === 'nights'
		);
		expect(nights.some((n: { lines: string[] }) => n.lines.join(' ').includes('no lodging'))).toBe(
			true
		);
	});

	test('viewer gets the same overview', async () => {
		const o = await callTool(tokens.owner, 'get_trip', { trip: seed.trips.current });
		const v = await callTool(tokens.viewer, 'get_trip', { trip: seed.trips.current });
		expect(v.structured.cards).toEqual(o.structured.cards);
	});

	// #567 — goal, scenario and suggestion votes: each caller gets their own vote id.
	test("each caller's own goal, scenario and suggestion vote, as your_vote", async () => {
		const su = await superuser();
		const pb = async (token: string, method: string, path: string, body?: unknown) => {
			const res = await fetch(`${E2E_PB_BASE}${path}`, {
				method,
				headers: { 'content-type': 'application/json', Authorization: token },
				body: body === undefined ? undefined : JSON.stringify(body)
			});
			const json = await res.json();
			expect(res.ok, `${method} ${path}: ${JSON.stringify(json)}`).toBe(true);
			return json;
		};
		const auth = (email: string) =>
			fetch(`${E2E_PB_BASE}/api/dev/auth-bypass`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email })
			}).then((r) => r.json());
		const [owner, traveler] = [await auth(MCP_EMAILS.owner), await auth(MCP_EMAILS.traveler)];
		const add = (token: string, col: string, body: unknown) =>
			pb(token, 'POST', `/api/collections/${col}/records`, body);

		const slug = `e2e-mcp-dateless-${seed.suffix}`;
		const trip = await add(owner.token, 'trips', {
			slug,
			title: `E2E MCP Someday ${seed.suffix}`,
			created_by: owner.record.id
		});
		const ownerMember = (
			await pb(
				owner.token,
				'GET',
				`/api/collections/trip_members/records?filter=${encodeURIComponent(`trip="${trip.id}"`)}`
			)
		).items[0].id;
		const travelerMember = (
			await add(su, 'trip_members', {
				trip: trip.id,
				user: traveler.record.id,
				role: 'traveler',
				display_name: 'Abby'
			})
		).id;
		// Nobody may vote on their own goal, scenario or suggestion: a third member makes them.
		const kim = (
			await add(su, 'trip_members', {
				trip: trip.id,
				role: 'traveler',
				placeholder_name: 'Kim',
				display_name: 'Kim'
			})
		).id;
		const goal = await add(su, 'trip_goals', {
			trip: trip.id,
			title: 'See the aurora',
			created_by: kim,
			manual_status: 'unplanned',
			sort_order: 0
		});
		const scenario = await add(su, 'scenarios', {
			trip: trip.id,
			title: 'Tromsø in March',
			pitch: 'Dark skies',
			champion: kim,
			status: 'candidate'
		});
		const suggestion = await add(su, 'suggestions', {
			trip: trip.id,
			author: kim,
			target_type: 'new_item',
			payload: { title: 'Dog sledding', type: 'activity' },
			status: 'pending'
		});
		const ownerGoalVote = await add(owner.token, 'goal_votes', {
			goal: goal.id,
			member: ownerMember,
			value: 'love'
		});
		const travelerGoalVote = await add(traveler.token, 'goal_votes', {
			goal: goal.id,
			member: travelerMember,
			value: 'dislike'
		});
		const ownerScenarioVote = await add(owner.token, 'scenario_votes', {
			scenario: scenario.id,
			member: ownerMember,
			value: 'like'
		});
		const ownerSuggestionVote = await add(owner.token, 'suggestion_votes', {
			suggestion: suggestion.id,
			member: ownerMember,
			value: 'flexible'
		});

		const o = await callTool(tokens.owner, 'get_trip', { trip: slug });
		expect(o.structured.goals).toEqual([
			{ id: goal.id, your_vote: { id: ownerGoalVote.id, value: 'love' } }
		]);
		expect(o.structured.scenarios).toEqual([
			{ id: scenario.id, your_vote: { id: ownerScenarioVote.id, value: 'like' } }
		]);
		expect(o.structured.suggestions).toEqual([
			{ id: suggestion.id, your_vote: { id: ownerSuggestionVote.id, value: 'flexible' } }
		]);
		expect(o.text).toContain(`Your vote: love (vote id ${ownerGoalVote.id})`);
		expect(o.text).toContain('2 votes: 1 love, 1 dislike');
		expect(o.text).toContain('Dog sledding');
		expect(o.text).toContain('Suggested by Kim');
		expect(JSON.stringify(o)).not.toContain(travelerGoalVote.id);

		// Someone else's vote, and no vote: no your_vote.
		const t = await callTool(tokens.traveler, 'get_trip', { trip: slug });
		expect(t.structured.goals).toEqual([
			{ id: goal.id, your_vote: { id: travelerGoalVote.id, value: 'dislike' } }
		]);
		expect(t.structured.scenarios).toEqual([{ id: scenario.id }]);
		expect(t.structured.suggestions).toEqual([{ id: suggestion.id }]);
		expect(JSON.stringify(t)).not.toContain(ownerGoalVote.id);
	});
});

test.describe('search', () => {
	const titles = (r: { structured: { cards: { title: string }[] } }) =>
		r.structured.cards.map((c) => c.title);

	test('finds the Lucerne hotel across trips, tagged with its trip', async () => {
		const r = await callTool(tokens.owner, 'search', { query: 'Lucerne', type: 'lodging' });
		const card = r.structured.cards.find(
			(c: { title: string; tag: string }) =>
				c.title === 'Hotel Schweizerhof' && c.tag === `E2E MCP Alps and Lisbon ${seed.suffix}`
		);
		expect(card).toBeTruthy();
		expect(card.lines.join(' ')).toContain(`id: ${seed.items.hotelLucerne}`);
	});

	test('a multi-word query matches each word, not one phrase', async () => {
		// "hotel" is in the item title, "Lucerne" in its phase: no field holds the phrase.
		const r = await callTool(tokens.owner, 'search', {
			query: 'Lucerne hotel',
			trip: seed.trips.past
		});
		expect(titles(r)).toContain('Hotel Schweizerhof');
	});

	test('filters by country', async () => {
		const r = await callTool(tokens.owner, 'search', {
			query: `restaurant ${seed.suffix}`,
			country: 'PT'
		});
		expect(titles(r)).toContain(`Taberna da Rua restaurant ${seed.suffix}`);
		const ch = await callTool(tokens.owner, 'search', {
			query: `restaurant ${seed.suffix}`,
			country: 'CH'
		});
		expect(titles(ch)).not.toContain(`Taberna da Rua restaurant ${seed.suffix}`);
	});

	test('covers day notes, codes, expenses and goals', async () => {
		const trip = seed.trips.current;
		expect((await callTool(tokens.owner, 'search', { trip, query: 'before 9' })).text).toContain(
			'Call the host'
		);
		expect((await callTool(tokens.owner, 'search', { trip, query: 'TAP9XZ' })).text).toContain(
			'TP 123 to Lisbon'
		);
		expect((await callTool(tokens.owner, 'search', { trip, query: 'Dinner' })).text).toContain(
			'$90'
		);
		expect((await callTool(tokens.owner, 'search', { trip, query: 'francesinha' })).text).toContain(
			'Eat a francesinha'
		);
	});

	test('never searches comments', async () => {
		const r = await callTool(tokens.owner, 'search', {
			trip: seed.trips.current,
			query: seed.commentText.split(' ').pop()!
		});
		expect(r.structured.cards).toHaveLength(0);
	});

	test('skips AI-off trips and says so', async () => {
		const r = await callTool(tokens.owner, 'search', { query: seed.offSecretText });
		expect(r.structured.cards).toHaveLength(0);
		// The heading echoes the query itself; the results must not carry it.
		expect(JSON.stringify(r.structured.skipped)).not.toContain(seed.offSecretText);
		expect(r.structured.skipped.map((s: { title: string }) => s.title)).toContain(
			`E2E MCP Private ${seed.suffix}`
		);
	});

	test('caps at 25 results and says how to narrow', async () => {
		// The seed's past trip has 30 "Museum visit N" items.
		const all = await callTool(tokens.owner, 'search', {
			trip: seed.trips.past,
			query: 'Museum visit'
		});
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
		const strip = (cards: { title: string; lines: string[] }[]) =>
			cards.filter((c) => c.title !== 'Your share');
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
		const r = await callTool(tokens.owner, 'what_changed', {
			trip: seed.trips.current,
			since: seed.startedAt
		});
		const tc = r.structured.cards.find((c: { title: string }) => c.title === 'Train to Coimbra');
		expect(tc.tag).toMatch(/^added/);
		expect(r.structured.heading + r.text).toMatch(/deletions aren't tracked/i);

		const beforeEdit = new Date(Date.now() - 1000).toISOString();
		const bypass = await fetch(`${E2E_PB_BASE}/api/dev/auth-bypass`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: MCP_EMAILS.owner })
		}).then((x) => x.json());
		const patched = await fetch(
			`${E2E_PB_BASE}/api/collections/items/records/${seed.items.overlapB}`,
			{
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json', Authorization: bypass.token },
				body: JSON.stringify({ description: 'Bring hats' })
			}
		);
		expect(patched.ok).toBe(true);
		const r2 = await callTool(tokens.owner, 'what_changed', {
			trip: seed.trips.current,
			since: beforeEdit
		});
		const rc = r2.structured.cards.find((c: { title: string }) => c.title === 'River cruise');
		expect(rc.tag).toBe('edited');
		expect(
			r2.structured.cards.find((c: { title: string }) => c.title === 'Train to Coimbra')
		).toBeUndefined();
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

// #512 — e2e gaps from the v3.1 review.
test.describe('membership + overnight', () => {
	test('a member removed from a trip no longer sees it in list_trips', async () => {
		const su = await superuser();
		const pb = (method: string, path: string, body?: unknown) =>
			fetch(`${E2E_PB_BASE}${path}`, {
				method,
				headers: { 'content-type': 'application/json', Authorization: su },
				body: body === undefined ? undefined : JSON.stringify(body)
			}).then((r) => r.json());
		const viewer = await fetch(`${E2E_PB_BASE}/api/dev/auth-bypass`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: MCP_EMAILS.viewer })
		}).then((r) => r.json());
		const m = await pb('POST', '/api/collections/trip_members/records', {
			trip: seed.tripIds.past,
			user: viewer.record.id,
			role: 'viewer',
			display_name: 'Vic'
		});
		const title = `E2E MCP Alps and Lisbon ${seed.suffix}`;
		const titles = async () =>
			(await callTool(tokens.viewer, 'list_trips')).structured.cards.map(
				(c: { title: string }) => c.title
			);
		expect(await titles()).toContain(title);
		await pb('PATCH', `/api/collections/trip_members/records/${m.id}`, {
			removed_at: new Date().toISOString().replace('T', ' ')
		});
		expect(await titles()).not.toContain(title);
	});

	test('a red-eye that lands today shows in get_day today', async () => {
		const owner = await fetch(`${E2E_PB_BASE}/api/dev/auth-bypass`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: MCP_EMAILS.owner })
		}).then((r) => r.json());
		const days = await fetch(
			`${E2E_PB_BASE}/api/collections/days/records?perPage=50&filter=${encodeURIComponent(`trip = "${seed.tripIds.current}"`)}`,
			{ headers: { Authorization: owner.token } }
		).then((r) => r.json());
		const phases = await fetch(
			`${E2E_PB_BASE}/api/collections/phases/records?filter=${encodeURIComponent(`trip = "${seed.tripIds.current}"`)}`,
			{ headers: { Authorization: owner.token } }
		).then((r) => r.json());
		const startDay = days.items.find((d: { date: string }) => d.date.startsWith(seed.dates.start));
		const title = `Red-eye from Toronto ${seed.suffix}`;
		const res = await fetch(`${E2E_PB_BASE}/api/collections/items/records`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', Authorization: owner.token },
			body: JSON.stringify({
				trip: seed.tripIds.current,
				phase: phases.items[0].id,
				day: startDay.id,
				type: 'flight',
				title,
				status: 'planned',
				start_time: `${seed.dates.start} 23:30:00.000Z`,
				end_time: `${seed.dates.today} 06:10:00.000Z`,
				end_date: `${seed.dates.today} 00:00:00.000Z`,
				created_by: seed.members.owner
			})
		});
		expect(res.ok, await res.clone().text()).toBe(true);
		const r = await callTool(tokens.owner, 'get_day', {
			trip: seed.trips.current,
			date: seed.dates.today
		});
		expect(r.text).toContain(title);
	});
});
