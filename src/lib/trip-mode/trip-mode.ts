import type { Item, Day } from '$lib/types';

export function parseDateTime(dt: string): Date {
	if (!dt) return new Date(0);
	return new Date(dt.replace(' ', 'T'));
}

export function isToday(dateStr: string, now: Date): boolean {
	const d = parseDateTime(dateStr);
	return (
		d.getUTCFullYear() === now.getUTCFullYear() &&
		d.getUTCMonth() === now.getUTCMonth() &&
		d.getUTCDate() === now.getUTCDate()
	);
}

export function findNextItem(items: Item[], now: Date): Item | null {
	const timed = items
		.filter((i) => i.start_time)
		.sort((a, b) => parseDateTime(a.start_time).getTime() - parseDateTime(b.start_time).getTime());

	return timed.find((i) => parseDateTime(i.start_time).getTime() > now.getTime()) ?? null;
}

export interface DayGroup {
	day: Day;
	items: Item[];
}

export function groupItemsByDay(items: Item[], days: Day[]): DayGroup[] {
	const dayMap = new Map<string, Item[]>();
	for (const item of items) {
		if (!item.day) continue;
		const existing = dayMap.get(item.day) ?? [];
		existing.push(item);
		dayMap.set(item.day, existing);
	}

	return days
		.filter((d) => dayMap.has(d.id))
		.map((d) => ({ day: d, items: dayMap.get(d.id)! }));
}
