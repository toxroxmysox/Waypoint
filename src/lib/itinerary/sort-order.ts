export const GAP = 100;

export function nextSortOrder(existing: number[]): number {
	if (existing.length === 0) return GAP;
	return Math.max(...existing) + GAP;
}

export function insertBetween(before: number | null, after: number | null): number | null {
	if (before === null && after === null) return GAP;
	if (before === null) return Math.floor(after! / 2);
	if (after === null) return before + GAP;

	const mid = Math.floor((before + after) / 2);
	if (mid <= before) return null;
	return mid;
}

export function rebalance(ids: string[]): { id: string; sort_order: number }[] {
	return ids.map((id, i) => ({ id, sort_order: (i + 1) * GAP }));
}
