import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { createPb } from '$lib/shell/pb';
import type { User } from '$lib/types';

export const handle: Handle = async ({ event, resolve }) => {
	const pb = createPb(event.request.headers.get('cookie') || '');

	// Refresh auth if valid
	if (pb.authStore.isValid) {
		try {
			await pb.collection('users').authRefresh();
		} catch {
			pb.authStore.clear();
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
