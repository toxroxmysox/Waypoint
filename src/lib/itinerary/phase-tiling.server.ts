import type PocketBase from 'pocketbase';
import { retilePhases, type PhaseStart } from './phase-tiling';

/**
 * Recompute and persist the tiled layout for a trip's phases (ADR-0021, #323).
 * Fetches all phases, computes the boundary-model end_date + order for each, and
 * updates only the records whose end or order changed. Call after any phase
 * create, start-edit, or delete. The phases.pb.js update hook re-buckets days off
 * the new ranges, so day membership follows automatically.
 *
 * `tripEnd` is the trip's end_date (PB datetime or 'YYYY-MM-DD').
 */
export async function applyRetile(pb: PocketBase, tripId: string, tripEnd: string): Promise<void> {
	const phases = await pb.collection('phases').getFullList({
		filter: `trip = "${tripId}"`,
		fields: 'id,start_date,end_date,order'
	});
	const tiled = retilePhases(phases as unknown as PhaseStart[], tripEnd);
	const byId = new Map(phases.map((p) => [p.id, p]));
	for (const t of tiled) {
		const cur = byId.get(t.id);
		if (!cur) continue;
		const curEnd = String(cur.end_date).slice(0, 10);
		const curOrder = Number(cur.order);
		if (curEnd === t.end && curOrder === t.order) continue; // already correct
		await pb.collection('phases').update(t.id, {
			end_date: t.end + ' 00:00:00.000Z',
			order: t.order
		});
	}
}
