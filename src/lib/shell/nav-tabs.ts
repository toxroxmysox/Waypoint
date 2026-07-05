// src/lib/shell/nav-tabs.ts
import type { TripViewMode } from '$lib/trip-mode/activation';

export interface NavTab {
	id: string;
	label: string;
	href: string;
	icon: 'calendar' | 'dollar' | 'users' | 'more' | 'clock' | 'sun' | 'plus' | 'lock' | 'doc' | 'compass';
	oversized?: boolean;
	action?: 'add-sheet';
}

/**
 * Which chrome the nav renders. `forming` (#270/ADR-0022) is the dateless-trip
 * scope: Ideas + Members + Goals (+ settings via More — chrome, not a
 * capability). Never a UI label — it only picks the tab set.
 */
export type NavChrome = TripViewMode | 'forming';

export interface NavConfig {
	tabs: NavTab[];
	accent: 'moss' | 'clay';
	chrome: NavChrome;
}

export function getNavConfig(slug: string, mode: TripViewMode, forming = false): NavConfig {
	// #270 — a forming trip is never date-active, so `mode` is always 'planning'
	// here; the forming tab set replaces it wholesale. Day/phase/timeline, money,
	// and documents surfaces stay hidden until the trip is dated (the Overview
	// carries the prominent set-dates affordance).
	if (forming) {
		return {
			accent: 'moss',
			chrome: 'forming',
			tabs: [
				{ id: 'ideas', label: 'Ideas', href: `/trips/${slug}`, icon: 'sun' },
				{ id: 'members', label: 'Members', href: `/trips/${slug}/members`, icon: 'users' },
				{ id: 'goals', label: 'Goals', href: `/trips/${slug}/goals`, icon: 'compass' },
				{ id: 'more', label: 'More', href: `/trips/${slug}/more`, icon: 'more' }
			]
		};
	}
	if (mode === 'trip') {
		return {
			accent: 'clay',
			chrome: 'trip',
			tabs: [
				// Now absorbs Today (#244): one tab, sub-tabs Today (default, the weighted
				// view at /now) + Next 3 days (the existing /today/upcoming view). Merging
				// the two freed this slot for Money — 375px can't hold a 5th tab + the FAB.
				{ id: 'now', label: 'Now', href: `/trips/${slug}/now`, icon: 'clock' },
				// Money (#227) — the Trip-Mode money glance, lands in the slot #244 freed.
				{ id: 'money', label: 'Money', href: `/trips/${slug}/money`, icon: 'dollar' },
				{ id: 'add', label: 'Add', href: '', icon: 'plus', oversized: true, action: 'add-sheet' },
				// Documents (#71) — occupies the vacated Vault slot.
				{ id: 'documents', label: 'Docs', href: `/trips/${slug}/documents`, icon: 'doc' }
			]
		};
	}
	return {
		accent: 'moss',
		chrome: 'planning',
		tabs: [
			{ id: 'itinerary', label: 'Itinerary', href: `/trips/${slug}`, icon: 'calendar' },
			{ id: 'money', label: 'Money', href: `/trips/${slug}/expenses`, icon: 'dollar' },
			{ id: 'members', label: 'Members', href: `/trips/${slug}/members`, icon: 'users' },
			{ id: 'documents', label: 'Docs', href: `/trips/${slug}/documents`, icon: 'doc' },
			{ id: 'more', label: 'More', href: `/trips/${slug}/more`, icon: 'more' }
		]
	};
}

export function getActiveTab(pathname: string, mode: NavChrome): string {
	// #270 — forming chrome: Ideas is the home tab (the Overview doubles as the
	// idea list on a dateless trip); settings stays reachable under More.
	if (mode === 'forming') {
		if (pathname.includes('/members')) return 'members';
		if (pathname.includes('/goals')) return 'goals';
		if (pathname.includes('/more') || pathname.includes('/inbox') || pathname.includes('/settings'))
			return 'more';
		return 'ideas';
	}
	if (mode === 'trip') {
		if (pathname.includes('/documents')) return 'documents';
		// #244: Now absorbed Today. Both the weighted view (/now) and the "Next 3 days"
		// sub-tab (/today, /today/upcoming) highlight the single Now tab.
		if (pathname.includes('/now') || pathname.includes('/today')) return 'now';
		// Trip-Mode Money glance (#227) — now a real nav tab (#244 freed the slot).
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
