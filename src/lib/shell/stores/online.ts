import { readable } from 'svelte/store';

// Reactive connectivity (#255). Mirrors `reduced-motion`: a readable seeded from
// `navigator.onLine` and kept live by the `online`/`offline` window events, so
// the offline banner + write-guard flip automatically with no manual toggle.
// SSR-safe — under SSR there's no `navigator`, so it reports online (true) and
// the client store takes over on hydration. `navigator.onLine` is a coarse
// signal (true can mean "has a network interface", not "reaches the server"),
// but it's the right trigger for the banner/guard: false reliably means offline.
export const online = readable(true, (set) => {
	if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

	set(navigator.onLine);

	const goOnline = () => set(true);
	const goOffline = () => set(false);

	window.addEventListener('online', goOnline);
	window.addEventListener('offline', goOffline);
	return () => {
		window.removeEventListener('online', goOnline);
		window.removeEventListener('offline', goOffline);
	};
});
