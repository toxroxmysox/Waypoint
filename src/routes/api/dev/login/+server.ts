import { redirect, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { PUBLIC_PB_URL } from '$env/static/public';
import type { RequestHandler } from './$types';

// Dev-only: hits the PB bypass endpoint, saves the token onto locals.pb's
// authStore so hooks.server.ts exports it as the response cookie. Env-gated so
// this route 404s in production.
//
// Flow: GET /api/dev/login?email=foo@bar → PB /api/dev/auth-bypass → authStore → /trips
export const GET: RequestHandler = async ({ url, locals }) => {
	if (env.WAYPOINT_DEV_MODE !== 'true') {
		error(404, 'Not found');
	}

	const email = url.searchParams.get('email') ?? env.E2E_TEST_EMAIL;
	if (!email) {
		error(400, 'email query param or E2E_TEST_EMAIL env required');
	}

	const res = await fetch(`${PUBLIC_PB_URL}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});

	if (!res.ok) {
		const body = await res.text();
		error(res.status, `Bypass failed: ${body}`);
	}

	const { token, record } = await res.json();

	// Writing to locals.pb.authStore is what the server hook reads when it
	// exports the cookie back to the browser. A fresh PB instance here would
	// be stomped by the hook's empty cookie.
	locals.pb.authStore.save(token, record);

	throw redirect(303, '/claim');
};
