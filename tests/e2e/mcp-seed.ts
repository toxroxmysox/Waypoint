// #502 — seed for the MCP tool specs, over PB REST (seed via API, never the UI).
// Content is created with real member tokens (the hooks gate on membership);
// the e2e superuser only adds members. Every text field carries an email-shaped
// string so the isolation sweep can prove none reaches tool output, and the
// current trip has a memory photo and a document file for the photo sweep.
//
// Each call makes a fresh set of trips (unique slug suffix), so spec files and
// retries never share or tear down each other's data.
import { E2E_PB_BASE } from './e2e-env';

const PB = E2E_PB_BASE;

export const MCP_EMAILS = {
	owner: 'rules-owner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	outsider: 'rules-nonmember@e2e.test'
};

/** Email-shaped strings planted in the seed; none may appear in tool output. */
export const PLANTED_EMAILS = [
	'Abby@Example.COM',
	'kim@x.io',
	'ana@example.com',
	'host@villa.pt',
	'pay@bistro.pt',
	'sam@pack.io',
	'zed@chat.io',
	'bea@mem.pt',
	'goal@aim.io',
	'code@tap.pt'
];

export interface McpSeed {
	suffix: string;
	/** ISO instant just before anything was created. */
	startedAt: string;
	trips: { current: string; past: string; off: string; foreign: string };
	tripIds: { current: string; past: string; off: string; foreign: string };
	members: { owner: string; traveler: string; viewer: string };
	items: {
		lodging: string;
		flightWithCode: string;
		flightNoCode: string;
		overlapA: string;
		overlapB: string;
		unbooked: string;
		idea: string;
		untimedMeal: string;
		hotelLucerne: string;
		restaurantLisbon: string;
		offSecret: string;
	};
	dates: { start: string; today: string; tomorrow: string; last: string };
	photoName: string;
	commentText: string;
	offSecretText: string;
}

type Json = Record<string, any>;

async function req(token: string, method: string, path: string, body?: unknown): Promise<Json> {
	const isForm = body instanceof FormData;
	const res = await fetch(`${PB}${path}`, {
		method,
		headers: {
			...(isForm ? {} : { 'Content-Type': 'application/json' }),
			...(token ? { Authorization: token } : {})
		},
		body: body === undefined ? undefined : isForm ? body : JSON.stringify(body)
	});
	const json = (await res.json().catch(() => ({}))) as Json;
	if (!res.ok) throw new Error(`seed ${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
	return json;
}

async function bypass(email: string): Promise<{ token: string; id: string }> {
	const r = await req('', 'POST', '/api/dev/auth-bypass', { email });
	return { token: r.token, id: r.record.id };
}

async function superuser(): Promise<string> {
	const r = await req('', 'POST', '/api/collections/_superusers/auth-with-password', {
		identity: process.env.PB_ADMIN_EMAIL ?? 'admin@e2e.test',
		password: process.env.PB_ADMIN_PASSWORD ?? 'e2eAdminPass123'
	});
	return r.token;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
	const d = new Date(s + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + n);
	return ymd(d);
};
const pbDay = (s: string) => `${s} 00:00:00.000Z`;
const at = (day: string, hm: string) => `${day} ${hm}:00.000Z`;

const create = (t: string, col: string, body: unknown) => req(t, 'POST', `/api/collections/${col}/records`, body);

async function makeTrip(t: string, userId: string, slug: string, title: string, start: string, end: string, tz: string) {
	const trip = await create(t, 'trips', {
		slug,
		title,
		start_date: pbDay(start),
		end_date: pbDay(end),
		timezone: tz,
		created_by: userId
	});
	const [owner] = (
		await req(t, 'GET', `/api/collections/trip_members/records?filter=${encodeURIComponent(`trip="${trip.id}"`)}`)
	).items;
	const days = (
		await req(t, 'GET', `/api/collections/days/records?perPage=200&sort=date&filter=${encodeURIComponent(`trip="${trip.id}"`)}`)
	).items as Json[];
	const [phase] = (
		await req(t, 'GET', `/api/collections/phases/records?filter=${encodeURIComponent(`trip="${trip.id}"`)}`)
	).items as Json[];
	const dayId = (d: string) => days.find((x) => String(x.date).startsWith(d))!.id as string;
	return { trip, ownerMember: owner.id as string, phase: phase.id as string, dayId };
}

export async function seedMcpTrips(): Promise<McpSeed> {
	const startedAt = new Date(Date.now() - 1000).toISOString();
	const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
	const su = await superuser();
	const owner = await bypass(MCP_EMAILS.owner);
	const traveler = await bypass(MCP_EMAILS.traveler);
	const viewer = await bypass(MCP_EMAILS.viewer);
	const outsider = await bypass(MCP_EMAILS.outsider);
	const T = owner.token;

	// ── current trip: today is day 2 of 4 (3 nights) ───────────────────────────
	const today = ymd(new Date());
	const start = addDays(today, -1);
	const last = addDays(today, 2);
	const tomorrow = addDays(today, 1);
	const cur = await makeTrip(T, owner.id, `e2e-mcp-current-${suffix}`, `E2E MCP Porto ${suffix}`, start, last, 'UTC');
	await req(T, 'PATCH', `/api/collections/phases/records/${cur.phase}`, { name: 'Porto', location: 'Porto', country_code: 'PT' });

	const travelerMember = (
		await create(su, 'trip_members', { trip: cur.trip.id, user: traveler.id, role: 'traveler', display_name: 'Abby (Abby@Example.COM)' })
	).id as string;
	const viewerMember = (await create(su, 'trip_members', { trip: cur.trip.id, user: viewer.id, role: 'viewer', display_name: 'Vic' }))
		.id as string;
	await create(su, 'trip_members', {
		trip: cur.trip.id,
		role: 'traveler',
		placeholder_name: 'Kim mailto:kim@x.io',
		display_name: 'Kim mailto:kim@x.io'
	});

	const item = (body: Json) =>
		create(T, 'items', { trip: cur.trip.id, phase: cur.phase, status: 'planned', created_by: cur.ownerMember, ...body }).then(
			(r) => r.id as string
		);
	const lodging = await item({
		day: cur.dayId(start),
		type: 'lodging',
		title: 'Casa do Rio',
		location_address: 'Rua Nova 1, Porto',
		end_date: pbDay(last),
		booked: true,
		sort_order: 0
	});
	const flightWithCode = await item({
		day: cur.dayId(today),
		type: 'flight',
		title: 'TP 123 to Lisbon',
		start_time: at(today, '10:00'),
		end_time: at(today, '11:00'),
		requires_booking: true,
		booked: true,
		sort_order: 1
	});
	const overlapA = await item({
		day: cur.dayId(today),
		type: 'activity',
		title: 'Port cellar tour',
		description: 'Booked by ana@example.com',
		start_time: at(today, '14:00'),
		end_time: at(today, '16:00'),
		sort_order: 2
	});
	const overlapB = await item({
		day: cur.dayId(today),
		type: 'activity',
		title: 'River cruise',
		start_time: at(today, '15:00'),
		end_time: at(today, '17:00'),
		sort_order: 3
	});
	// Untimed, sort_order after the day's anchors → orderDayItems puts it last.
	const untimedMeal = await item({ day: cur.dayId(today), type: 'meal', title: 'Picnic lunch', sort_order: 9 });
	const unbooked = await item({
		day: cur.dayId(tomorrow),
		type: 'transportation',
		title: 'Train to Coimbra',
		start_time: at(tomorrow, '09:00'),
		requires_booking: true,
		booked: false,
		cost_estimate_usd: 40,
		sort_order: 0
	});
	const flightNoCode = await item({
		day: cur.dayId(last),
		type: 'flight',
		title: 'TP 456 home',
		start_time: at(last, '18:00'),
		requires_booking: true,
		booked: true,
		sort_order: 0
	});
	const idea = await item({ day: '', type: 'activity', title: 'Surf lesson in Matosinhos', status: 'considered', sort_order: 0 });
	await create(T, 'votes', { trip: cur.trip.id, item: idea, member: cur.ownerMember, value: 'love' });
	await create(traveler.token, 'votes', { trip: cur.trip.id, item: idea, member: travelerMember, value: 'like' });

	await create(T, 'documents', {
		trip: cur.trip.id,
		item: flightWithCode,
		uploaded_by: cur.ownerMember,
		kind: 'code',
		code_label: 'Booking ref',
		code_value: 'TAP9XZ code@tap.pt'
	});
	const doc = new FormData();
	doc.set('trip', cur.trip.id);
	doc.set('item', lodging);
	doc.set('uploaded_by', cur.ownerMember);
	doc.set('kind', 'file');
	doc.set('caption', 'Booking confirmation');
	doc.set('file', new Blob([new Uint8Array([37, 80, 68, 70, 45, 49])], { type: 'application/pdf' }), 'casa-confirmation.pdf');
	await create(T, 'documents', doc);

	await req(T, 'PATCH', `/api/collections/days/records/${cur.dayId(today)}`, {
		notes: '<p>Call the <a href="mailto:host@villa.pt">host</a> before 9.</p>'
	});
	await create(T, 'trip_goals', {
		trip: cur.trip.id,
		title: 'Eat a francesinha',
		description: 'Tip from goal@aim.io',
		created_by: cur.ownerMember,
		manual_status: 'unplanned',
		sort_order: 0
	});
	await create(T, 'expenses', {
		trip: cur.trip.id,
		paid_by: cur.ownerMember,
		amount_usd: 90,
		description: 'Dinner, receipt to pay@bistro.pt',
		date: pbDay(start),
		category: 'food',
		split_mode: 'equal',
		split_data: { members: [cur.ownerMember, travelerMember] },
		created_by: cur.ownerMember
	});
	await create(T, 'settlements', {
		trip: cur.trip.id,
		from_member: travelerMember,
		to_member: cur.ownerMember,
		amount_usd: 15,
		date: pbDay(today),
		note: '',
		created_by: cur.ownerMember
	});
	const list = await create(T, 'checklists', { trip: cur.trip.id, title: 'Packing', kind: 'manual', order: 0 });
	await create(T, 'tasks', { checklist: list.id, title: 'Adapter for sam@pack.io', assignee: travelerMember, checked: false, order: 0 });
	await create(T, 'tasks', { checklist: list.id, title: 'Passports', checked: true, order: 1 });

	const commentText = `Meet at the dock, ping zed@chat.io ${suffix}`;
	await req(traveler.token, 'POST', '/api/comments/add', { item_id: overlapA, comment_text: commentText });

	const photoName = `miradouro-${suffix}.png`;
	const mem = new FormData();
	mem.set('trip', cur.trip.id);
	mem.set('day', cur.dayId(start));
	mem.set('author', cur.ownerMember);
	mem.set('thought', 'Sunset at the miradouro, thanks bea@mem.pt');
	// 1×1 PNG
	const png = Uint8Array.from(
		atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
		(c) => c.charCodeAt(0)
	);
	mem.set('photo', new Blob([png], { type: 'image/png' }), photoName);
	await create(T, 'memories', mem);

	// ── past trip: Lucerne hotel + a Lisbon restaurant ─────────────────────────
	const pStart = addDays(today, -400);
	const pLast = addDays(pStart, 3);
	const past = await makeTrip(T, owner.id, `e2e-mcp-past-${suffix}`, `E2E MCP Alps and Lisbon ${suffix}`, pStart, pLast, 'Europe/Zurich');
	await req(T, 'PATCH', `/api/collections/phases/records/${past.phase}`, { name: 'Lucerne', location: 'Lucerne', country_code: 'CH' });
	const lisbonPhase = await create(T, 'phases', {
		trip: past.trip.id,
		name: 'Lisbon',
		location: 'Lisbon',
		country_code: 'PT',
		start_date: pbDay(addDays(pStart, 2)),
		end_date: pbDay(pLast),
		order: 1
	}).catch(() => null);
	const pItem = (body: Json) =>
		create(T, 'items', { trip: past.trip.id, status: 'done', created_by: past.ownerMember, ...body }).then((r) => r.id as string);
	const hotelLucerne = await pItem({
		phase: past.phase,
		day: past.dayId(pStart),
		type: 'lodging',
		title: 'Hotel Schweizerhof',
		location_name: 'Hotel Schweizerhof Luzern',
		end_date: pbDay(addDays(pStart, 2)),
		booked: true,
		sort_order: 0
	});
	const restaurantLisbon = await pItem({
		phase: lisbonPhase?.id ?? past.phase,
		day: past.dayId(pLast),
		type: 'meal',
		title: `Taberna da Rua restaurant ${suffix}`,
		location_name: 'Taberna da Rua, Lisbon',
		sort_order: 0
	});

	// Volume for search's 25-result cap.
	for (let i = 0; i < 30; i++) {
		await pItem({ phase: past.phase, day: past.dayId(addDays(pStart, i % 3)), type: 'activity', title: `Museum visit ${i + 1}`, sort_order: 10 + i });
	}

	// ── off trip: AI Access off ────────────────────────────────────────────────
	const offSecretText = `Secret hideaway ${suffix}`;
	const off = await makeTrip(T, owner.id, `e2e-mcp-off-${suffix}`, `E2E MCP Private ${suffix}`, addDays(today, 30), addDays(today, 32), 'UTC');
	const offSecret = (
		await create(T, 'items', {
			trip: off.trip.id,
			phase: off.phase,
			day: off.dayId(addDays(today, 30)),
			type: 'lodging',
			title: offSecretText,
			status: 'planned',
			created_by: off.ownerMember,
			sort_order: 0
		})
	).id as string;
	await req(T, 'PATCH', `/api/collections/trips/records/${off.trip.id}`, { ai_access: false });

	// ── foreign trip: the outsider's ───────────────────────────────────────────
	const foreign = await makeTrip(
		outsider.token,
		outsider.id,
		`e2e-mcp-foreign-${suffix}`,
		`E2E MCP Not Yours ${suffix}`,
		addDays(today, 10),
		addDays(today, 11),
		'UTC'
	);

	return {
		suffix,
		startedAt,
		trips: { current: cur.trip.slug, past: past.trip.slug, off: off.trip.slug, foreign: foreign.trip.slug },
		tripIds: { current: cur.trip.id, past: past.trip.id, off: off.trip.id, foreign: foreign.trip.id },
		members: { owner: cur.ownerMember, traveler: travelerMember, viewer: viewerMember },
		items: {
			lodging,
			flightWithCode,
			flightNoCode,
			overlapA,
			overlapB,
			unbooked,
			idea,
			untimedMeal,
			hotelLucerne,
			restaurantLisbon,
			offSecret
		},
		dates: { start, today, tomorrow, last },
		photoName,
		commentText,
		offSecretText
	};
}
