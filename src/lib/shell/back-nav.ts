/**
 * #361 — where the in-app back chevron goes.
 *
 * THE MODEL, decided with Scott scenario-by-scenario on 2026-08-26:
 *
 *   Chevron  = the screen you drilled in FROM, carried per-screen in `?from=`.
 *   Peers    = day→day and tab→tab moves do NOT re-parent; they add no `?from=`.
 *   Cold     = no `?from=` (deep link, invite email, reload) → the declared
 *              fallback, which is the trip's itinerary overview.
 *   OS back  = edge-swipe / browser back stays CHRONOLOGICAL and is untouched.
 *
 * THE CHEVRON AND THE EDGE-SWIPE DELIBERATELY DIVERGE. That is the feature, not
 * an inconsistency to reconcile. Browse days 1→5 and the chevron takes you out
 * to the trip in one tap while the edge-swipe still walks back day by day —
 * both were asked for explicitly, and only this split delivers both.
 *
 * WHY NOT THE DATA PARENT. #361's original sketch said "up" = the item's place
 * in the trip (item → its day). That was tested and rejected: move an item from
 * Day 3 to Day 5 and the chevron should still return to Day 3, and Docs → item
 * should return to Docs, not to the item's day. "Up" means where you came from.
 *
 * WHY THE ORIGIN LIVES IN THE URL rather than in a module-level stack: a single
 * remembered value breaks on Docs → item → edit → chevron → chevron (the second
 * chevron has lost Docs), so it would have to be a stack — and a stack is a
 * second history to keep in sync with the browser's own. This codebase has been
 * bitten three separate times by exactly that (#235, #365, #383). Riding along
 * in the URL needs no stack, survives reload, and is inert.
 */

/** Query key carrying the drill-in origin. */
export const ORIGIN_PARAM = 'from';

/**
 * Is this a safe same-origin path to hand to `goto()`?
 *
 * SECURITY, not hygiene: `?from=` is user-controllable and feeds a navigation,
 * so an unvalidated value is an open redirect. Everything that is not a plain
 * absolute path inside the app is rejected, and the caller falls back to the
 * declared parent — `?from=https://evil.com` and `?from=//evil.com` navigate
 * nowhere.
 */
export function isSafeOrigin(value: string | null | undefined): value is string {
	if (typeof value !== 'string') return false;
	if (value.length === 0 || value.length > 512) return false;

	// Must be an absolute path. `//evil.com` is protocol-relative — a HOST, not
	// a path — and is the classic bypass for a naive `startsWith('/')` check.
	if (!value.startsWith('/') || value.startsWith('//')) return false;

	// Backslashes are normalised to slashes by some parsers, so `/\evil.com` can
	// become protocol-relative after the check. Traversal is meaningless here.
	if (value.includes('\\') || value.includes('..')) return false;

	// Control characters — browsers STRIP tab/CR/LF from a URL before resolving
	// it, so a smuggled scheme can survive a naive check and mean something else
	// afterwards. Reject them outright rather than reason about which survive.
	// (Ordinary hyphens are fine and common — slugs are full of them.)
	// eslint-disable-next-line no-control-regex
	if (/[\u0000-\u001F\u007F]/.test(value)) return false;

	// An origin is a bare pathname. Anything carrying its own query or fragment
	// is either smuggling or a bug; either way it is not something we navigate to.
	if (/[?#]/.test(value)) return false;

	// Allowlist, not denylist: only the app's own trees.
	return value === '/trips' || value === '/account' || value.startsWith('/trips/');
}

/**
 * Tag a DRILL-IN link with the screen it is being followed from, so the chevron
 * on the destination can come back here.
 *
 * Only for drill-downs. Peer and tab links (day→day, Money→Docs) must NOT call
 * this: moving sideways does not create a level to come back up from, and
 * tagging them would make the chevron retrace a browse instead of exiting it.
 *
 * `originPath` is a pathname — pass `page.url.pathname`, never `page.url.href`.
 */
export function withOrigin(href: string, originPath: string | null | undefined): string {
	if (!isSafeOrigin(originPath)) return href;
	const sep = href.includes('?') ? '&' : '?';
	return `${href}${sep}${ORIGIN_PARAM}=${encodeURIComponent(originPath)}`;
}

/**
 * Where the chevron should go from the current screen: the validated origin if
 * this screen was drilled into, otherwise the screen's declared fallback.
 */
export function resolveBack(url: { searchParams: URLSearchParams }, fallbackHref: string): string {
	const raw = url.searchParams.get(ORIGIN_PARAM);
	return isSafeOrigin(raw) ? raw : fallbackHref;
}

/**
 * Drop `?from=` from a URL meant to leave this device.
 *
 * A link copied out of the address bar otherwise carries the sharer's browsing
 * origin, which is both noise and a small privacy leak — the recipient can see
 * which screen the sharer happened to be on.
 *
 * NO CURRENT CONSUMER, deliberately kept: today's only share affordance emits a
 * server-computed absolute `/archive/<token>` URL, which never carries `?from=`.
 * This exists so the next share surface — "copy link to this screen" — cannot
 * ship the leak by omission. Delete it if that never arrives.
 */
export function stripOrigin(href: string): string {
	if (!href.includes(`${ORIGIN_PARAM}=`)) return href;
	try {
		const u = new URL(href, 'http://x');
		u.searchParams.delete(ORIGIN_PARAM);
		return `${u.pathname}${u.search}${u.hash}`;
	} catch {
		return href;
	}
}
