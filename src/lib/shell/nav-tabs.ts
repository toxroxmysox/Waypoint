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
		// Trip-Mode Money summary (#227). The nav *tab* lands once #166 frees the slot
		// (Now · Money · Add · Docs); mapping the active tab here is ready for it and is
		// harmless until then (no tab to highlight yet).
		if (pathname.includes('/money')) return 'money';
		// Non-tab trip surfaces (item detail reached from Trip Mode, etc.) get NO
		// active tab — don't false-highlight "Now" on a page that isn't Now (#197).
		return '';
	}
	if (pathname.includes('/documents')) return 'documents';
	if (pathname.includes('/expenses') || pathname.includes('/budget')) return 'money';
	if (pathname.includes('/members')) return 'members';
	if (pathname.includes('/more') || pathname.includes('/inbox') || pathname.includes('/settings')) return 'more';
	return 'itinerary';
}

/**
 * The chrome mode (nav + accent) a URL should render, given the trip's date-
 * active state and any in-memory user override. Trip Mode is only ever shown on
 * its own surfaces (`/now`, `/today`) and on the shared item surfaces when the
 * user is in Trip Mode; every planning surface — including the bare `/trips/[slug]`
 * Overview — renders planning chrome even on an active trip (#197 B-011). This
 * keeps the mode pill honest: you never see "Edit plan" while looking at the plan.
 */
export function resolveChromeMode(
	pathname: string,
	dateActive: boolean,
	override: TripViewMode | null
): TripViewMode {
	if (!dateActive) return 'planning';
	// Exclusive Trip-Mode surfaces. `/money` is the Trip-Mode Money summary (#227) — a
	// trip-mode glance distinct from the planning `/expenses` + `/budget` pages it deep-
	// links to (those deliberately stay planning chrome, #197 B-011). Tapping a deep-link
	// crosses to planning Money by design.
	if (/\/(now|today|money)(\/|$)/.test(pathname)) return 'trip';
	// Shared surfaces (item detail / new item, Documents — both navs carry a Docs
	// tab) follow the in-memory mode so a Trip-Mode drill-down keeps Trip chrome;
	// default to Trip on an active trip.
	if (/\/(items|documents)(\/|$)/.test(pathname)) return override ?? 'trip';
	// Everything else under the trip (Overview, expenses, members, phases, days,
	// lists, goals, more, settings) is a planning surface.
	return 'planning';
}

/** True when a page was reached from Trip Mode (explicit `?from=trip`). */
export function fromTrip(url: { searchParams: URLSearchParams }): boolean {
	return url.searchParams.get('from') === 'trip';
}
