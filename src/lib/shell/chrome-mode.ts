import { getContext, setContext } from 'svelte';
import type { TripViewMode } from '$lib/trip-mode/activation';

// #416 — the mode the user is looking at, for pages rendered inside AppShell.
//
// AppShell resolves the chrome mode (`resolveChromeMode`: URL + date-active +
// the in-memory mode-pill override) and is the only thing that knows it; the
// override never reaches page data. A page that must act differently by mode —
// Skip lands on Now in Trip Mode and stays put in Planning Mode — reads it here
// instead of re-deriving it from dates, which would ignore the mode pill.

const KEY = Symbol('chrome-mode');

/** AppShell only. The getter keeps the value live as the mode changes. */
export function provideChromeMode(get: () => TripViewMode): void {
	setContext(KEY, get);
}

/**
 * The current chrome mode. Call during component init. Outside AppShell it
 * reads Planning Mode, the mode that never navigates anyone anywhere.
 */
export function useChromeMode(): () => TripViewMode {
	return getContext<(() => TripViewMode) | undefined>(KEY) ?? (() => 'planning');
}
