// Service worker ⇄ page protocol for degraded connectivity (#533).
//
// `navigator.onLine` only says "has a network interface". On weak signal it stays
// true while every request stalls, so the SW — which sees each network-first
// request time out or fail — is the one that knows. It reports a change with
// NETWORK_STATE; a page that loaded after the change (a cold launch served from
// cache) asks with GET_NETWORK_STATE and gets the same reply.

export const NETWORK_STATE = 'NETWORK_STATE';
export const GET_NETWORK_STATE = 'GET_NETWORK_STATE';

export interface NetworkStateMessage {
	type: typeof NETWORK_STATE;
	degraded: boolean;
}

export function isNetworkStateMessage(data: unknown): data is NetworkStateMessage {
	return (
		typeof data === 'object' &&
		data !== null &&
		(data as { type?: unknown }).type === NETWORK_STATE &&
		typeof (data as { degraded?: unknown }).degraded === 'boolean'
	);
}
