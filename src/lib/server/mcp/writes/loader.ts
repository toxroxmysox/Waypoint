// #503 — the write layer's reads, as the connected user (PB rules = their Role):
// the RecordLoader compile uses, the cascade snapshot, and the names a preview
// shows instead of ids.
import type PocketBase from 'pocketbase';
import type { Trip } from '$lib/types';
import { loadMembers, memberName } from '../tools/get-trip';
import type { McpContext } from '../context';
import type { RecordLoader } from './compile';
import type { CascadeSnapshot } from './cascade';
import { RECORD_FIELDS, type Labels } from './preview';
import type { PlannedChange } from './types';
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
		id
			? pb
					.collection(collection)
					.getOne(id, { requestKey: null })
					.then((r) => r as Record<string, unknown>)
					.catch(() => null)
			: Promise.resolve(null);
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
			return pb.collection('days').getFullList<{ id: string; date: string; phases: string[] }>({
				filter: pb.filter('trip = {:t}', { t: tripId }),
				fields: 'id,date,phases',
				requestKey: null
			});
		},
		async phases(tripId) {
			return pb
				.collection('phases')
				.getFullList<{ id: string; name: string; start_date: string; order: number }>({
					filter: pb.filter('trip = {:t}', { t: tripId }),
					fields: 'id,name,start_date,order',
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

/** #520 — titles for the parent records changes point at: this proposal's own creates first, then PB (as the user). */
async function loadRecordNames(
	pb: PocketBase,
	changes: PlannedChange[]
): Promise<Map<string, string>> {
	const names = new Map(changes.filter((c) => c.action === 'create').map((c) => [c.id, c.title]));
	const wanted = new Map<string, Set<string>>();
	for (const c of changes)
		for (const [f, v] of Object.entries(c.after)) {
			const rel = RECORD_FIELDS[f];
			if (!rel) continue;
			for (const id of Array.isArray(v) ? v : [v])
				if (id && !names.has(String(id)))
					wanted.set(rel.collection, (wanted.get(rel.collection) ?? new Set()).add(String(id)));
		}
	await Promise.all(
		[...wanted].map(async ([collection, ids]) => {
			const rows = await pb
				.collection(collection)
				.getFullList({
					filter: [...ids].map((id) => pb.filter('id = {:id}', { id })).join(' || '),
					fields: collection === 'suggestions' ? 'id,payload' : 'id,title',
					requestKey: null
				})
				.catch(() => []);
			for (const r of rows) {
				const title =
					collection === 'suggestions'
						? (r.payload as { title?: string } | null)?.title
						: (r.title as string);
				if (title) names.set(r.id, title);
			}
		})
	);
	return names;
}

export async function loadLabels(
	ctx: McpContext,
	tripId: string,
	snapshot?: CascadeSnapshot,
	changes: PlannedChange[] = []
): Promise<Labels> {
	const pb = ctx.pb;
	const byTrip = { filter: pb.filter('trip = {:t}', { t: tripId }), requestKey: null };
	const [members, phases, days, records] = await Promise.all([
		loadMembers(ctx, tripId),
		snapshot
			? snapshot.phases
			: pb.collection('phases').getFullList({ ...byTrip, fields: 'id,name' }),
		snapshot ? snapshot.days : pb.collection('days').getFullList({ ...byTrip, fields: 'id,date' }),
		loadRecordNames(pb, changes)
	]);
	return {
		members: new Map(members.map((m) => [m.id, memberName(m)])),
		phases: new Map((phases as { id: string; name: string }[]).map((p) => [p.id, p.name])),
		days: new Map((days as { id: string; date: string }[]).map((d) => [d.id, d.date])),
		records
	};
}
