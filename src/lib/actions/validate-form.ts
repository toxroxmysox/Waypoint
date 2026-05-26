import type { Action } from 'svelte/action';

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
		if (first) {
			first.focus();
			first.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
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
