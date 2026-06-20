import { get } from 'svelte/store';
import { online } from '$lib/shell/stores/online';
import { toast } from '$lib/shell/stores/toast';

// App-wide offline write-guard (#255). The offline promise is READ-ONLY: any
// attempt to MUTATE while offline is short-circuited with a toast rather than
// failing silently or 503-ing. Read navigation (GET links/forms) is untouched.
//
// Implemented as a single capture-phase `submit` listener on `document` instead
// of wrapping all ~43 `use:enhance` call sites: capture runs BEFORE SvelteKit's
// own submit handler, so `preventDefault` + `stopImmediatePropagation` stops the
// enhance action (and the native POST) from ever firing. One install point, every
// current and future mutation form covered.

const OFFLINE_TOAST = "You're offline — reconnect to make changes";

/** True for a state-changing form submit (a POST). A submitter's `formMethod`
 * overrides the form's `method` (HTML spec), so honor it. GET forms (search,
 * read navigation) are not mutations and pass through. */
function isMutation(form: HTMLFormElement, submitter: HTMLElement | null): boolean {
	const submitterMethod = (submitter as HTMLButtonElement | null)?.formMethod;
	const method = (submitterMethod || form.method || 'get').toLowerCase();
	return method === 'post';
}

/**
 * Install the guard. Returns a teardown fn (mirrors svelte store/effect cleanup).
 * Call once from the root layout's `onMount`. No-op under SSR.
 */
export function installOfflineWriteGuard(): () => void {
	if (typeof document === 'undefined') return () => {};

	const onSubmit = (event: SubmitEvent) => {
		// Live read each submit — `online` reflects the latest online/offline event.
		if (get(online)) return;
		const form = event.target as HTMLFormElement | null;
		if (!form || !isMutation(form, event.submitter)) return;

		// Block the mutation: stop the native POST AND SvelteKit's enhance handler.
		event.preventDefault();
		event.stopImmediatePropagation();
		toast.show(OFFLINE_TOAST, 'error');
	};

	// Capture phase so this runs before the form's own (bubbling) enhance listener.
	document.addEventListener('submit', onSubmit, true);
	return () => document.removeEventListener('submit', onSubmit, true);
}
