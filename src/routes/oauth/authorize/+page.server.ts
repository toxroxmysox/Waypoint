// #502 / ADR-0024 — OAuth authorize = Waypoint's email + 6-digit code login, no
// consent screen: identity is the login. Plain form posts (no `enhance`) so the
// final 303 to the client's callback is a real top-level navigation inside
// Claude's in-app browser. Logs in with a fresh PB client, so it never sets the
// web app's session cookie.
import { error, fail, redirect } from '@sveltejs/kit';
import { createPb } from '$lib/shell/pb';
import { resolveClient } from '$lib/server/mcp/oauth/clients';
import { createPending, getPending } from '$lib/server/mcp/oauth/pending';
import { appNameOf, completeAuthorize } from '$lib/server/mcp/oauth/authorize';
import type { Actions, PageServerLoad } from './$types';

const EXPIRED = 'This sign-in link expired. Start again from your AI app.';

export const load: PageServerLoad = async ({ url }) => {
	// After a form action SvelteKit re-runs load on the action URL (`?/requestOTP`),
	// which has no OAuth query. The forms carry `req`; nothing to validate here.
	if (url.search.startsWith('?/')) return { req: '', appName: '' };

	const q = url.searchParams;
	const client_id = q.get('client_id') ?? '';
	const redirect_uri = q.get('redirect_uri') ?? '';
	if (!client_id) error(400, 'Start connecting from your AI app.');
	const client = await resolveClient(client_id);
	// Bad client or redirect_uri: show an error, never redirect (open-redirect rule).
	if ('error' in client) error(400, `Unknown app: ${client.error}`);
	if (!client.redirect_uris.includes(redirect_uri)) error(400, 'This app sent an unregistered redirect address.');

	const back = (err: string, desc: string): never => {
		const u = new URL(redirect_uri);
		u.searchParams.set('error', err);
		u.searchParams.set('error_description', desc);
		if (q.get('state')) u.searchParams.set('state', q.get('state')!);
		redirect(303, u.toString());
	};
	if (q.get('response_type') !== 'code') back('unsupported_response_type', 'code only');
	if (q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge')) back('invalid_request', 'PKCE S256 required');

	const pending = createPending({
		client,
		redirect_uri,
		state: q.get('state') ?? '',
		code_challenge: q.get('code_challenge')!,
		resource: q.get('resource') ?? ''
	});
	return { req: pending.id, appName: appNameOf(pending) };
};

export const actions: Actions = {
	requestOTP: async ({ request }) => {
		const data = await request.formData();
		const req = data.get('req')?.toString() ?? '';
		const email = data.get('email')?.toString().trim().toLowerCase() ?? '';
		const pending = getPending(req);
		if (!pending) return fail(400, { req, error: EXPIRED });
		const appName = appNameOf(pending);
		if (!email) return fail(400, { req, appName, error: 'Email is required.' });
		try {
			const { otpId } = await createPb().collection('users').requestOTP(email);
			return { req, appName, otpId, email };
		} catch {
			return fail(500, { req, appName, email, error: 'Failed to send code. Please try again.' });
		}
	},

	verifyOTP: async ({ request, url }) => {
		const data = await request.formData();
		const req = data.get('req')?.toString() ?? '';
		const otpId = data.get('otpId')?.toString() ?? '';
		const email = data.get('email')?.toString() ?? '';
		const code = data.get('code')?.toString().trim() ?? '';
		const pending = getPending(req);
		if (!pending) return fail(400, { req, error: EXPIRED });
		const appName = appNameOf(pending);

		const pb = createPb();
		try {
			await pb.collection('users').authWithOTP(otpId, code);
		} catch {
			return fail(400, { req, appName, otpId, email, error: 'Invalid or expired code. Try again.' });
		}
		redirect(303, completeAuthorize(pending, pb.authStore.record!.id, url.origin));
	}
};
