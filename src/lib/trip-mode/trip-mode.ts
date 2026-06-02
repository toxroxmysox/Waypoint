import type { Item, Day } from '$lib/types';
import type { DayGroup, TripModeState } from './types';

function parseDateTime(dt: string): Date {
	if (!dt) return new Date(0);
	return new Date(dt.replace(' ', 'T'));
}

function sortBySortOrder(items: Item[]): Item[] {
	return [...items].sort((a, b) => {
		const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
		if (orderDiff !== 0) return orderDiff;
		return parseDateTime(a.start_time).getTime() - parseDateTime(b.start_time).getTime();
	});
}

function findToday(days: Day[], now: Date): Day | null {
	const todayStr = now.toISOString().split('T')[0];
	return days.find((d) => d.date.split(/[T ]/)[0] === todayStr) ?? null;
}

function findNextItem(items: Item[], now: Date): Item | null {
	const timed = items
		.filter((i) => i.start_time)
		.sort((a, b) => parseDateTime(a.start_time).getTime() - parseDateTime(b.start_time).getTime());
	return timed.find((i) => parseDateTime(i.start_time).getTime() > now.getTime()) ?? null;
}

function findTomorrow(days: Day[], now: Date): Day | null {
	const tomorrow = new Date(now);
	tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
	const tomorrowStr = tomorrow.toISOString().split('T')[0];
	return days.find((d) => d.date.split(/[T ]/)[0] === tomorrowStr) ?? null;
}

function findUpcomingDays(days: Day[], now: Date, count: number): Day[] {
	const result: Day[] = [];
	for (let i = 1; i <= count; i++) {
		const d = new Date(now);
		d.setUTCDate(d.getUTCDate() + i);
		const ds = d.toISOString().split('T')[0];
		const found = days.find((day) => day.date.split(/[T ]/)[0] === ds);
		if (found) result.push(found);
	}
	return result;
}

function groupItemsByDay(items: Item[], days: Day[]): DayGroup[] {
	const dayMap = new Map<string, Item[]>();
	for (const item of items) {
		if (!item.day) continue;
		const existing = dayMap.get(item.day) ?? [];
		existing.push(item);
		dayMap.set(item.day, existing);
	}
	return days
		.filter((d) => dayMap.has(d.id))
		.map((d) => ({ day: d, items: sortBySortOrder(dayMap.get(d.id)!) }));
}

export function getTripModeState(items: Item[], days: Day[], now: Date): TripModeState {
	const today = findToday(days, now);
	const todayItems = today
		? sortBySortOrder(items.filter((i) => i.day === today.id))
		: [];

	const tomorrowDay = findTomorrow(days, now);
	const tomorrowItems = tomorrowDay
		? sortBySortOrder(items.filter((i) => i.day === tomorrowDay.id))
		: [];

	const upcomingDaysList = findUpcomingDays(days, now, 3);
	const upcomingDayGroups = groupItemsByDay(items, upcomingDaysList);

	return {
		now: {
			today,
			todayItems,
			nextItem: findNextItem(todayItems, now),
			isPast: (item: Item) => {
				if (!item.end_time) return false;
				return parseDateTime(item.end_time).getTime() < now.getTime();
			}
		},
		upNext: {
			tomorrowDay,
			tomorrowItems
		},
		timeline: {
			upcomingDays: upcomingDayGroups
		}
	};
}
