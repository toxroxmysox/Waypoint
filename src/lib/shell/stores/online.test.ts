import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { createOnlineStore, type OnlineEnv } from './online';
import { GET_NETWORK_STATE, NETWORK_STATE } from '$lib/offline/network-state';

// A fake page: window events, navigator.onLine, and a service-worker container
// that records what the page posts and lets the test deliver SW messages.
function fakeEnv(onLine = true) {
	const win = new EventTarget();
	const sw = new EventTarget();
	const posted: unknown[] = [];
	const env: OnlineEnv = {
		window: win,
		navigator: {
			onLine,
			serviceWorker: Object.assign(sw, {
				controller: { postMessage: (m: unknown) => posted.push(m) }
			})
		}
	};
	const fromSW = (data: unknown) => sw.dispatchEvent(new MessageEvent('message', { data }));
	return { env, win, posted, fromSW };
}

/** Subscribe (starting the store) and return a live reader. */
function start(env: OnlineEnv) {
	const store = createOnlineStore(env);
	const unsub = store.subscribe(() => {});
	return { read: () => get(store), unsub };
}

describe('online store (#255, #533)', () => {
	it('seeds from navigator.onLine', () => {
		expect(start(fakeEnv(true).env).read()).toBe(true);
		expect(start(fakeEnv(false).env).read()).toBe(false);
	});

	it('follows the window online/offline events', () => {
		const { env, win } = fakeEnv(true);
		const { read } = start(env);
		win.dispatchEvent(new Event('offline'));
		expect(read()).toBe(false);
		win.dispatchEvent(new Event('online'));
		expect(read()).toBe(true);
	});

	it('goes offline when the SW reports degraded, even with navigator.onLine true (lie-fi)', () => {
		const { env, fromSW } = fakeEnv(true);
		const { read } = start(env);
		fromSW({ type: NETWORK_STATE, degraded: true });
		expect(read()).toBe(false);
	});

	it('recovers when the SW reports a later fetch got through', () => {
		const { env, fromSW } = fakeEnv(true);
		const { read } = start(env);
		fromSW({ type: NETWORK_STATE, degraded: true });
		fromSW({ type: NETWORK_STATE, degraded: false });
		expect(read()).toBe(true);
	});

	it('an online event clears degraded (a fresh link gets a fresh chance)', () => {
		const { env, win, fromSW } = fakeEnv(true);
		const { read } = start(env);
		fromSW({ type: NETWORK_STATE, degraded: true });
		win.dispatchEvent(new Event('online'));
		expect(read()).toBe(true);
	});

	it('asks the SW for its current state on start (cold launch served from cache)', () => {
		const { env, posted } = fakeEnv(true);
		start(env);
		expect(posted).toContainEqual({ type: GET_NETWORK_STATE });
	});

	it('ignores unrelated SW messages', () => {
		const { env, fromSW } = fakeEnv(true);
		const { read } = start(env);
		fromSW({ type: 'SOMETHING_ELSE', degraded: true });
		expect(read()).toBe(true);
	});

	it('works with no service worker (unsupported / first visit)', () => {
		const win = new EventTarget();
		const { read } = start({ window: win, navigator: { onLine: true } });
		expect(read()).toBe(true);
	});

	it('stops listening once unsubscribed', () => {
		const { env, win } = fakeEnv(true);
		const store = createOnlineStore(env);
		const seen: boolean[] = [];
		const unsub = store.subscribe((v) => seen.push(v));
		unsub();
		win.dispatchEvent(new Event('offline'));
		expect(seen).toEqual([true]);
	});
});
