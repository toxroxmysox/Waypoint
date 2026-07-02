import PocketBase from 'pocketbase';
import { browser } from '$app/environment';
import { PUBLIC_PB_URL } from '$env/static/public';

// Resolve the PB base URL. The BROWSER always uses the public URL. On the
// SERVER, prefer PB_INTERNAL_URL (a runtime env, e.g. http://localhost:8080/pb)
// so SSR calls stay on-box instead of round-tripping out through the public
// Cloudflare Tunnel and back. That round-trip added latency to every SSR PB
// call and — on a cold tunnel connection — intermittently reset with EOF,
// which surfaced as auth-refresh failures that wiped a just-created session
// (login "succeeded" then immediately bounced back to the code screen).
function pbBaseUrl(): string {
	if (!browser && typeof process !== 'undefined' && process.env.PB_INTERNAL_URL) {
		return process.env.PB_INTERNAL_URL;
	}
	return PUBLIC_PB_URL;
}

// Create a PocketBase client instance.
// On the server, pass the auth cookie to restore the session.
// On the client, authStore auto-syncs with the cookie.
export function createPb(authCookie?: string): PocketBase {
	const pb = new PocketBase(pbBaseUrl());

	if (authCookie) {
		pb.authStore.loadFromCookie(authCookie);
	}

	return pb;
}
