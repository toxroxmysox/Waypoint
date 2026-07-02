import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { createPb } from '$lib/shell/pb';
import type { User } from '$lib/types';

export const handle: Handle = async ({ event, resolve }) => {
	const pb = createPb(event.request.headers.get('cookie') || '');

	// Refresh auth if valid. Only DROP the session on a genuine auth rejection
	// (401/403 — token actually invalid/revoked). A transient failure (network
	// EOF, 5xx, timeout) must NOT log the user out: the existing token is still
	// valid, so keep it and retry on the next request. Clearing on any error was
	// wiping just-created sessions when authRefresh hit an intermittent EOF.
	if (pb.authStore.isValid) {
		try {
			await pb.collection('users').authRefresh();
		} catch (err) {
			const status = (err as { status?: number })?.status ?? 0;
			if (status === 401 || status === 403) {
				pb.authStore.clear();
			}
		}
	}

	event.locals.pb = pb;
	event.locals.user = pb.authStore.isValid ? (pb.authStore.record as unknown as User) : null;

	const response = await resolve(event);

	// Sync auth cookie back to browser. #291: httpOnly so the JWT is unreadable by
	// page JS (no XSS → session-theft escalation). Safe — auth is restored server-side
	// from the request cookie header each request (createPb in this hook); no client
	// reads the cookie.
	const cookie = pb.authStore.exportToCookie({ httpOnly: true, sameSite: 'lax', secure: !dev });
	response.headers.append('set-cookie', cookie);

	return response;
};
