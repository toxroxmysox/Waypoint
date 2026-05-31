import { page } from '$app/state';

export type TripSection = 'itinerary' | 'money' | 'members' | 'more';

export function getActiveSection(pathname: string): TripSection {
	if (pathname.includes('/expenses') || pathname.includes('/budget')) return 'money';
	if (pathname.includes('/members')) return 'members';
	if (pathname.includes('/more') || pathname.includes('/inbox') || pathname.includes('/settings'))
		return 'more';
	return 'itinerary';
}

export function formatTripDate(dateStr: string, format: 'short' | 'full' = 'short'): string {
	const d = new Date(dateStr.split(/[T ]/)[0] + 'T00:00:00Z');
	if (format === 'full') {
		return d.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
