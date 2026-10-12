import { writable } from 'svelte/store';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
	id: number;
	message: string;
	variant: ToastVariant;
	duration: number;
	/** #401 — one inline action (Undo). Running it dismisses the toast. */
	action?: ToastAction;
}

export interface ToastAction {
	label: string;
	run: () => void;
}

let nextId = 0;

function createToastStore() {
	const { subscribe, update } = writable<Toast | null>(null);
	let timeout: ReturnType<typeof setTimeout> | undefined;

	let current: Toast | null = null;
	subscribe((t) => (current = t));

	function show(message: string, variant: ToastVariant = 'success', opts: { action?: ToastAction } = {}) {
		const duration = opts.action ? 6000 : variant === 'error' ? 5000 : variant === 'info' ? 4000 : 3000;
		const id = ++nextId;

		if (timeout) clearTimeout(timeout);

		update(() => ({ id, message, variant, duration, ...(opts.action ? { action: opts.action } : {}) }));

		timeout = setTimeout(() => {
			update((current) => (current?.id === id ? null : current));
			timeout = undefined;
		}, duration);
	}

	function dismiss() {
		if (timeout) clearTimeout(timeout);
		timeout = undefined;
		update(() => null);
	}

	/** Run the current toast's action once, then dismiss it. */
	function runAction() {
		const action = current?.action;
		dismiss();
		action?.run();
	}

	return { subscribe, show, dismiss, runAction };
}

export const toast = createToastStore();
