import type { Action } from 'svelte/action';

/** Bring a control into view and put the caret in it. Shared by the client-side
 *  constraint path (below) and the server-failure path (#375) so both land the
 *  user in the same place. */
function reveal(el: HTMLElement) {
	el.focus({ preventScroll: true });
	el.scrollIntoView({
		block: 'center',
		behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
	});
}

/** An element the browser is actually laying out. AppShell renders every page
 *  twice (mobile + desktop, one CSS-hidden), so a naive query can resolve to the
 *  invisible twin — which would scroll and focus nothing. */
function isRendered(el: Element): boolean {
	return el.getClientRects().length > 0;
}

/**
 * Svelte action: adds blur-validation (`.touched` class) to form controls
 * and focuses the first invalid field on submit.
 */
export const validateForm: Action<HTMLFormElement> = (form) => {
	function onBlur(e: Event) {
		const el = e.target;
		if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
			el.classList.add('touched');
		}
	}

	function onSubmit() {
		const controls = form.querySelectorAll('input, select, textarea');
		controls.forEach((el) => el.classList.add('touched'));
		const first = form.querySelector<HTMLElement>(':invalid');
		if (first) reveal(first);
	}

	form.addEventListener('focusout', onBlur);
	form.addEventListener('submit', onSubmit);

	return {
		destroy() {
			form.removeEventListener('focusout', onBlur);
			form.removeEventListener('submit', onSubmit);
		}
	};
};

/**
 * #375 — the server-failure counterpart to `validateForm`'s first-invalid focus.
 *
 * A server action's `fail()` renders one `role="alert"` banner at the top of the
 * page. On a long form with a fixed bottom SaveBar the user taps Save at the
 * bottom and the explanation appears off-screen, so nothing seems to happen.
 * Call this from an `$effect` keyed on `form?.error`:
 *
 *   $effect(() => { if (error) revealServerError(alertEl, errorField(form)); });
 *
 * When the action names the offending field it wins — the user lands on the
 * control they have to fix. Otherwise the alert itself is scrolled to and
 * focused (it carries `tabindex="-1"` so it can hold focus for screen readers).
 */
export function revealServerError(alert: HTMLElement | null | undefined, field?: string): void {
	if (!alert || !isRendered(alert)) return;

	const scope: ParentNode = alert.closest('main') ?? document;
	const target = field
		? Array.from(scope.querySelectorAll<HTMLElement>(`[name="${CSS.escape(field)}"]`)).find(isRendered)
		: undefined;

	if (target) {
		reveal(target);
		return;
	}

	if (!alert.hasAttribute('tabindex')) alert.setAttribute('tabindex', '-1');
	reveal(alert);
}

/**
 * Read the optional `field` hint off a form-action result.
 *
 * SvelteKit types `ActionData` as the union of every `fail()` shape in the file,
 * and only the branches that can name a control carry `field` — so a direct
 * `form.field` does not type-check on any page with a second, fieldless failure.
 * Narrowing here keeps that hint opt-in per branch instead of forcing every
 * `fail()` in the app to declare a property it has no use for.
 */
export function errorField(form: unknown): string | undefined {
	const value = (form as { field?: unknown } | null | undefined)?.field;
	return typeof value === 'string' ? value : undefined;
}
