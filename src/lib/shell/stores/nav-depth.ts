import { writable, derived } from 'svelte/store';

/** Number of in-app navigations since the last cold load (enter). */
const navDepth = writable(0);

/** True when the user has at least one in-app history entry to pop. */
export const canGoBack = derived(navDepth, ($d) => $d > 0);

/**
 * One-shot flag: the NEXT forward navigation will use `replaceState` and so
 * adds NO new history entry. `afterNavigate` cannot tell a `replaceState` goto
 * from a normal one (the `goto(url, { replaceState })` flag is not surfaced on
 * the navigation event — verified against @sveltejs/kit 2.57), so the call site
 * that performs the replace must announce it. Consumed by the next
 * `updateNavDepth` call. (#235)
 */
let pendingReplace = false;

/**
 * Call IMMEDIATELY before a `goto(url, { replaceState: true })` so the depth
 * counter does not count that navigation. Edit-form and wizard saves replace
 * the transient screen in place; counting them inflated the depth, so back
 * believed there was an extra entry to pop and `history.back()` landed on the
 * replaced (duplicate) entry — the screen flashed but stayed put (#235).
 */
export function markReplaceNavigation(): void {
	pendingReplace = true;
}

/**
 * Update the depth based on a SvelteKit `afterNavigate` event.
 *
 * - `enter`   → cold load / hard reload → reset to 0 (also clears any pending replace)
 * - `popstate` → browser back/forward → apply delta (default -1)
 * - `link` / `goto` / `form` → forward navigation → +1, UNLESS it was flagged as
 *   a `replaceState` navigation (markReplaceNavigation), in which case the depth
 *   is unchanged because no history entry was added.
 *
 * Clamped to >= 0 so a popstate on depth 0 never goes negative.
 */
export function updateNavDepth(type: string, delta?: number | null): void {
	// A replace navigation adds no history entry — consume the flag and leave
	// the depth untouched. Guard to forward types only so a stray popstate/enter
	// can't accidentally swallow the flag.
	if (pendingReplace && (type === 'goto' || type === 'link' || type === 'form')) {
		pendingReplace = false;
		return;
	}

	navDepth.update((d) => {
		if (type === 'enter') {
			pendingReplace = false; // cold load resets everything
			return 0;
		}
		if (type === 'popstate') return Math.max(0, d + (delta ?? -1));
		return d + 1; // link | goto | form (a real push)
	});
}
