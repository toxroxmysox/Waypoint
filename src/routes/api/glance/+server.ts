// Dashboard tile feed: GET /api/glance, Bearer WAYPOINT_GLANCE_TOKEN only.
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { adminPb } from '$lib/server/mcp/admin-pb';
import { checkGlanceToken, computeGlance, type GlanceTrip } from '$lib/server/glance';
import type { RequestHandler } from './$types';

const NO_STORE = { 'cache-control': 'no-store' };
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export const GET: RequestHandler = async ({ request }) => {
	if (!checkGlanceToken(request.headers.get('authorization'), env.WAYPOINT_GLANCE_TOKEN)) {
		return json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
	}
	const emails = (env.WAYPOINT_GLANCE_EMAILS ?? '')
		.split(',')
		.map((e) => e.trim())
		.filter(Boolean);
	const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit' }).format(
		new Date()
	);
	// Misconfigured people = error, never a confident wrong number.
	const misconfigured = () =>
		json({ error: 'glance misconfigured' }, { status: 503, headers: NO_STORE });
	if (!emails.length) return misconfigured();

	const pb = await adminPb();
	const users = await pb.collection('users').getFullList({
		filter: emails.map((e) => `email = "${esc(e)}"`).join(' || '),
		fields: 'id',
		requestKey: null
	});
	if (users.length !== emails.length) return misconfigured();
	const members = await pb.collection('trip_members').getFullList({
		filter: `(${users.map((u) => `user = "${u.id}"`).join(' || ')}) && role != "viewer"`,
		fields: 'trip',
		requestKey: null
	});
	const tripIds = [...new Set(members.map((m) => m.trip as string))];

	const trips: GlanceTrip[] = [];
	const counts = new Map<string, number>();
	await Promise.all(
		tripIds.map(async (id) => {
			const t = await pb
				.collection('trips')
				.getOne(id, { fields: 'id,start_date,end_date', requestKey: null })
				.catch((e: { status?: number }) => {
					if (e?.status === 404) return null; // deleted between queries: skip
					throw e; // 5xx/network: surface an error, never a silently low count
				});
			if (!t?.start_date || !t?.end_date) return;
			trips.push({
				id,
				start: String(t.start_date).slice(0, 10),
				end: String(t.end_date).slice(0, 10)
			});
			const r = await pb
				.collection('items')
				.getList(1, 1, { filter: `trip = "${id}"`, fields: 'id', requestKey: null });
			counts.set(id, r.totalItems);
		})
	);
	return json(computeGlance(trips, counts, today), { headers: NO_STORE });
};
