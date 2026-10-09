import type PocketBase from 'pocketbase';

/**
 * Attached FILES per item, for the Card strip's documents count (#420, #429).
 * Codes are Documents too (ADR-0016) but get their own chip, so they are excluded.
 * A failed fetch yields no counts rather than failing the page.
 */
export async function docCountsForItems(
	pb: PocketBase,
	tripId: string,
	itemIds: string[]
): Promise<Record<string, number>> {
	const out: Record<string, number> = {};
	if (itemIds.length === 0) return out;
	const wanted = new Set(itemIds);
	const docs = await pb
		.collection('documents')
		.getFullList<{ item: string }>({
			filter: pb.filter('trip = {:trip} && item != "" && kind != "code"', { trip: tripId }),
			fields: 'id,item'
		})
		.catch(() => []);
	for (const d of docs) if (wanted.has(d.item)) out[d.item] = (out[d.item] ?? 0) + 1;
	return out;
}
