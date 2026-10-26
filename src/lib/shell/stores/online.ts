import { readable, type Readable } from 'svelte/store';
import { GET_NETWORK_STATE, isNetworkStateMessage } from '$lib/offline/network-state';

// Reactive connectivity (#255, #533). Drives the offline banner + write-guard.
// Two signals, ANDed:
// - `navigator.onLine` + the `online`/`offline` window events. False reliably
//   means offline, but true only means "has a network interface".
// - The service worker's NETWORK_STATE reports. On weak signal ("lie-fi")
//   onLine stays true while requests stall; the SW sees its network-first
//   requests time out or fail and reports `degraded` until one gets through.
// An `online` event clears `degraded`: a fresh link gets a fresh chance.
// SSR-safe — with no `window` it reports online (true) and the client store
// takes over on hydration.

/** The slice of the browser this needs — so tests can drive it without a DOM. */
export interface OnlineEnv {
	window: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
	navigator: {
		onLine: boolean;
		serviceWorker?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & {
			controller: { postMessage(message: unknown): void } | null;
		};
	};
}

function browserEnv(): OnlineEnv | null {
	if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
	return { window, navigator };
}

export function createOnlineStore(env?: OnlineEnv): Readable<boolean> {
	return readable(true, (set) => {
		const e = env ?? browserEnv();
		if (!e) return;

		let interfaceUp = e.navigator.onLine;
		let degraded = false;
		const update = () => set(interfaceUp && !degraded);
		update();

		const goOnline = () => {
			interfaceUp = true;
			degraded = false;
			update();
		};
		const goOffline = () => {
			interfaceUp = false;
			update();
		};
		const onMessage = (event: Event) => {
			const data = (event as MessageEvent).data;
			if (!isNetworkStateMessage(data)) return;
			degraded = data.degraded;
			update();
		};

		e.window.addEventListener('online', goOnline);
		e.window.addEventListener('offline', goOffline);
		const sw = e.navigator.serviceWorker;
		sw?.addEventListener('message', onMessage);
		sw?.controller?.postMessage({ type: GET_NETWORK_STATE });

		return () => {
			e.window.removeEventListener('online', goOnline);
			e.window.removeEventListener('offline', goOffline);
			sw?.removeEventListener('message', onMessage);
		};
	});
}

export const online = createOnlineStore();
