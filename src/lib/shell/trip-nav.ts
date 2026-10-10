import { formatCalendarDate } from '$lib/shell/format';
import { page } from '$app/state';

export type TripSection = 'itinerary' | 'money' | 'members' | 'documents' | 'more';

export function getActiveSection(pathname: string): TripSection {
	if (pathname.includes('/documents')) return 'documents';
	if (pathname.includes('/expenses') || pathname.includes('/budget')) return 'money';
	if (pathname.includes('/members')) return 'members';
	if (pathname.includes('/more') || pathname.includes('/inbox') || pathname.includes('/settings'))
		return 'more';
	return 'itinerary';
}

export function formatTripDate(dateStr: string, format: 'short' | 'full' = 'short'): string {
	if (format === 'full') {
		return formatCalendarDate(dateStr, { weekday: 'short', month: 'short', day: 'numeric' });
	}
	return formatCalendarDate(dateStr, { month: 'short', day: 'numeric' });
}
