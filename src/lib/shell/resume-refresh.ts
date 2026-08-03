import { get } from 'svelte/store';
import { invalidateAll } from '$app/navigation';
import { online } from '$lib/shell/stores/online';

/**
 * Resume revalidation (#372).
 *
 * Waypoint has no realtime sync by design, so a PWA left open on a trip page
 * shows whatever was loaded when you last looked at it. Backgrounding the app
 * for an hour and coming back to yesterday's itinerary is the failure that
 * causes — "no realtime" is about live-sync UX, not about serving stale data on
 * resume.
 *
 * DECIDED (Scott, 2026-08-03): on `visibilitychange` → visible, if the document
 * was hidden longer than 60s, call `invalidateAll()`. SILENT — no spinner, no
 * scroll jump, no gesture, no toast. Under 60s (an app-switch blink, a glance
 * at a notification) do nothing. Pull-to-refresh was explicitly rejected.
 *
 * `invalidateAll()` re-runs the CURRENT route's server `load`s only. That is the
 * intent: no polling, no subscriptions. SvelteKit does not reset scroll on
 * invalidation, so the page updates in place. #363's navigation progress bar
 * keys off `navigating`, not invalidation, so it correctly stays silent.
 */

/** How long the document must have been hidden before resuming revalidates. */
export const RESUME_REFRESH_MS = 60_000;

/**
 * The whole decision, pure. `hiddenAt` is null when we never saw the document
 * go hidden (nothing to compare against — don't refresh).
 *
 * Offline is skipped: invalidating with no network re-runs loads that can only
 * fail, churning the service worker's fallback paths for nothing. The next
 * resume while online picks it up.
 */
export function shouldRefreshOnResume(
	hiddenAt: number | null,
	now: number,
	isOnline: boolean
): boolean {
	if (hiddenAt === null) return false;
	if (!isOnline) return false;
	return now - hiddenAt > RESUME_REFRESH_MS;
}

/** The slice of `document` this needs — so tests can drive it without a DOM. */
export interface VisibilityDoc {
	readonly visibilityState: string;
	addEventListener(type: 'visibilitychange', listener: () => void): void;
	removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface ResumeRefreshDeps {
	doc?: VisibilityDoc;
	now?: () => number;
	revalidate?: () => unknown;
	isOnline?: () => boolean;
}

/**
 * Install the listener. Returns a teardown fn (mirrors `installOfflineWriteGuard`).
 * Call once from the root layout's `onMount`. No-op under SSR.
 */
export function installResumeRefresh(deps: ResumeRefreshDeps = {}): () => void {
	const doc = deps.doc ?? (typeof document === 'undefined' ? null : document);
	if (!doc) return () => {};

	const now = deps.now ?? (() => Date.now());
	const revalidate = deps.revalidate ?? (() => invalidateAll());
	const isOnline = deps.isOnline ?? (() => get(online));

	// Mounting while already hidden (a backgrounded launch, or a headless/preview
	// tab) counts as hidden from now — otherwise the first foreground after a
	// long background start would never revalidate.
	let hiddenAt: number | null = doc.visibilityState === 'hidden' ? now() : null;

	const onVisibilityChange = () => {
		if (doc.visibilityState === 'hidden') {
			hiddenAt = now();
			return;
		}
		if (doc.visibilityState !== 'visible') return;
		const wasHiddenAt = hiddenAt;
		hiddenAt = null;
		if (shouldRefreshOnResume(wasHiddenAt, now(), isOnline())) void revalidate();
	};

	doc.addEventListener('visibilitychange', onVisibilityChange);
	return () => doc.removeEventListener('visibilitychange', onVisibilityChange);
}
