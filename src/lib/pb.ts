import PocketBase from 'pocketbase';
import { PUBLIC_PB_URL } from '$env/static/public';

// Create a PocketBase client instance.
// On the server, pass the auth cookie to restore the session.
// On the client, authStore auto-syncs with the cookie.
export function createPb(authCookie?: string): PocketBase {
	const pb = new PocketBase(PUBLIC_PB_URL);

	if (authCookie) {
		pb.authStore.loadFromCookie(authCookie);
	}

	return pb;
}
