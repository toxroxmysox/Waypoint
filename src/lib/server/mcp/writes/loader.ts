// #503 — the write layer's reads, as the connected user (PB rules = their Role):
// the RecordLoader compile uses, the cascade snapshot, and the names a preview
// shows instead of ids.
import type PocketBase from 'pocketbase';
import type { Trip } from '$lib/types';
import { loadMembers, memberName } from '../tools/get-trip';
import type { McpContext } from '../context';
import type { RecordLoader } from './compile';
import type { CascadeSnapshot } from './cascade';
import type { Labels } from './preview';
import { WRITABLE } from './registry';

/** Which collection a tripPath's first hop points at. */
const PARENT: Record<string, string> = {
	item: 'items',
	checklist: 'checklists',
	goal: 'trip_goals',
	scenario: 'scenarios',
	suggestion: 'suggestions'
};

export function pbLoader(pb: PocketBase): RecordLoader {
	const get = (collection: string, id: string) =>
		id ? pb.collection(collection).getOne(id, { requestKey: null }).then((r) => r as Record<string, unknown>).catch(() => null) : Promise.resolve(null);
	return {
		get,
		async tripIdOf(collection, record) {
			const path = WRITABLE[collection]?.tripPath ?? 'trip';
			if (path === 'id') return String(record.id ?? '');
			if (path === 'trip') return String(record.trip ?? '');
			const [hop] = path.split('.');
			const parent = await get(PARENT[hop], String(record[hop] ?? ''));
			return String(parent?.trip ?? '');
		},
		async days(tripId) {
			return pb.collection('days').getFullList<{ id: string; date: string }>({
				filter: pb.filter('trip = {:t}', { t: tripId }),
				fields: 'id,date',
				requestKey: null
			});
		}
	};
}

export async function loadSnapshot(pb: PocketBase, trip: Trip): Promise<CascadeSnapshot> {
	const byTrip = { filter: pb.filter('trip = {:t}', { t: trip.id }), requestKey: null };
	const [phases, days, items] = await Promise.all([
		pb.collection('phases').getFullList({ ...byTrip, fields: 'id,name,start_date,end_date' }),
		pb.collection('days').getFullList({ ...byTrip, fields: 'id,date' }),
		pb.collection('items').getFullList({ ...byTrip, fields: 'id,title,phase,day' })
	]);
	return {
		trip: { id: trip.id, start_date: trip.start_date ?? '', end_date: trip.end_date ?? '' },
		phases: phases as unknown as CascadeSnapshot['phases'],
		days: days as unknown as CascadeSnapshot['days'],
		items: items as unknown as CascadeSnapshot['items']
	};
}

export async function loadLabels(ctx: McpContext, tripId: string, snapshot?: CascadeSnapshot): Promise<Labels> {
	const pb = ctx.pb;
	const byTrip = { filter: pb.filter('trip = {:t}', { t: tripId }), requestKey: null };
	const [members, phases, days] = await Promise.all([
		loadMembers(ctx, tripId),
		snapshot ? snapshot.phases : pb.collection('phases').getFullList({ ...byTrip, fields: 'id,name' }),
		snapshot ? snapshot.days : pb.collection('days').getFullList({ ...byTrip, fields: 'id,date' })
	]);
	return {
		members: new Map(members.map((m) => [m.id, memberName(m)])),
		phases: new Map((phases as { id: string; name: string }[]).map((p) => [p.id, p.name])),
		days: new Map((days as { id: string; date: string }[]).map((d) => [d.id, d.date]))
	};
}
