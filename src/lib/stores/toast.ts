import { writable } from 'svelte/store';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
	id: number;
	message: string;
	variant: ToastVariant;
	duration: number;
}

let nextId = 0;

function createToastStore() {
	const { subscribe, update } = writable<Toast | null>(null);
	let timeout: ReturnType<typeof setTimeout> | undefined;

	function show(message: string, variant: ToastVariant = 'success') {
		const duration = variant === 'error' ? 5000 : variant === 'info' ? 4000 : 3000;
		const id = ++nextId;

		if (timeout) clearTimeout(timeout);

		update(() => ({ id, message, variant, duration }));

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

	return { subscribe, show, dismiss };
}

export const toast = createToastStore();
