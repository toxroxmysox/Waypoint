import { writable, derived } from 'svelte/store';

/** Number of in-app navigations since the last cold load (enter). */
const navDepth = writable(0);

/** True when the user has at least one in-app history entry to pop. */
export const canGoBack = derived(navDepth, ($d) => $d > 0);

/**
 * Update the depth based on a SvelteKit `afterNavigate` event.
 *
 * - `enter`   → cold load / hard reload → reset to 0
 * - `popstate` → browser back/forward → apply delta (default -1)
 * - `link` / `goto` / `form` → forward navigation → +1
 *
 * Clamped to >= 0 so a popstate on depth 0 never goes negative.
 */
export function updateNavDepth(type: string, delta?: number | null): void {
	navDepth.update((d) => {
		if (type === 'enter') return 0;
		if (type === 'popstate') return Math.max(0, d + (delta ?? -1));
		return d + 1; // link | goto | form
	});
}
