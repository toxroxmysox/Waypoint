// #364 — optimistic `use:enhance` for high-frequency toggles (task checkbox,
// votes). The form stays a real progressive-enhancement form; this only
// changes what JS does around the round-trip:
//
//   submit  → `apply()` flips the component's local override at once
//   success → `update({ reset: false })` pulls fresh server data, THEN `settle()`
//             drops the override (so the UI never blinks back mid-invalidation)
//   failure → `settle()` drops the override (= revert) + an error toast; no
//             `update()`, so an `error` result never swaps in the error page
//   double-tap while in flight → the second submit is cancelled, so it can't
//             fire a second toggle that silently reverts the first
//
// State lives in the calling component (not keyed by id globally): AppShell
// renders every page twice, and each copy must own its own override.
import type { SubmitFunction } from '@sveltejs/kit';
import { toast } from '$lib/shell/stores/toast';

export interface OptimisticSubmitOptions {
	/** True while this control's previous submit is still in flight. */
	busy: () => boolean;
	/** Set the local override + mark busy. Runs synchronously on submit. */
	apply: () => void;
	/** Clear the local override + busy. Runs after the round-trip, always. */
	settle: () => void;
	/** Shown when the action fails — the override is already reverted. */
	errorMessage: string;
	/** Injectable for tests; defaults to the app toast. */
	notifyError?: (message: string) => void;
}

export function optimisticSubmit(opts: OptimisticSubmitOptions): SubmitFunction {
	const notify = opts.notifyError ?? ((m: string) => toast.show(m, 'error'));
	return ({ cancel }) => {
		if (opts.busy()) {
			cancel();
			return;
		}
		opts.apply();
		return async ({ result, update }) => {
			try {
				if (result.type === 'success' || result.type === 'redirect') {
					await update({ reset: false });
				} else {
					notify(opts.errorMessage);
				}
			} finally {
				opts.settle();
			}
		};
	};
}

/** The vote a tap on `option` produces: tapping your current vote clears it. */
export function nextVote<T extends string>(current: T | null, option: T): T | null {
	return current === option ? null : option;
}
