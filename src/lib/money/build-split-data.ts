export function buildSplitData(
	mode: 'equal' | 'by_amount',
	members: Set<string>,
	amounts: Record<string, string>
): string {
	if (mode === 'equal') {
		return JSON.stringify({ members: [...members] });
	}
	const parsed: Record<string, number> = {};
	for (const [id, val] of Object.entries(amounts)) {
		const n = parseFloat(val);
		if (n > 0) parsed[id] = n;
	}
	return JSON.stringify({ amounts: parsed });
}
