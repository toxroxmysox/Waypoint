import type { Handle } from '@sveltejs/kit';
import { createPb } from '$lib/pb';
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

	// Sync auth cookie back to browser
	const cookie = pb.authStore.exportToCookie({ httpOnly: false, sameSite: 'lax', secure: false });
	response.headers.append('set-cookie', cookie);

	return response;
};
