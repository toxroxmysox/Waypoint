// src/lib/shell/nav-tabs.ts
import type { TripViewMode } from '$lib/trip-mode/activation';

export interface NavTab {
	id: string;
	label: string;
	href: string;
	icon: 'calendar' | 'dollar' | 'users' | 'more' | 'clock' | 'sun' | 'plus' | 'lock' | 'doc';
	oversized?: boolean;
	action?: 'add-sheet';
}

export interface NavConfig {
	tabs: NavTab[];
	accent: 'moss' | 'clay';
}

export function getNavConfig(slug: string, mode: TripViewMode): NavConfig {
	if (mode === 'trip') {
		return {
			accent: 'clay',
			tabs: [
				{ id: 'now', label: 'Now', href: `/trips/${slug}/now`, icon: 'clock' },
				{ id: 'today', label: 'Today', href: `/trips/${slug}/today`, icon: 'sun' },
				{ id: 'add', label: 'Add', href: '', icon: 'plus', oversized: true, action: 'add-sheet' },
				// Documents (#71) — occupies the vacated Vault slot.
				{ id: 'documents', label: 'Docs', href: `/trips/${slug}/documents`, icon: 'doc' }
			]
		};
	}
	return {
		accent: 'moss',
		tabs: [
			{ id: 'itinerary', label: 'Itinerary', href: `/trips/${slug}`, icon: 'calendar' },
			{ id: 'money', label: 'Money', href: `/trips/${slug}/expenses`, icon: 'dollar' },
			{ id: 'members', label: 'Members', href: `/trips/${slug}/members`, icon: 'users' },
			{ id: 'documents', label: 'Docs', href: `/trips/${slug}/documents`, icon: 'doc' },
			{ id: 'more', label: 'More', href: `/trips/${slug}/more`, icon: 'more' }
		]
	};
}

export function getActiveTab(pathname: string, mode: TripViewMode): string {
	if (mode === 'trip') {
		if (pathname.includes('/documents')) return 'documents';
		if (pathname.includes('/now')) return 'now';
		if (pathname.includes('/today')) return 'today';
		return 'now';
	}
	if (pathname.includes('/documents')) return 'documents';
	if (pathname.includes('/expenses') || pathname.includes('/budget')) return 'money';
	if (pathname.includes('/members')) return 'members';
	if (pathname.includes('/more') || pathname.includes('/inbox') || pathname.includes('/settings')) return 'more';
	return 'itinerary';
}
