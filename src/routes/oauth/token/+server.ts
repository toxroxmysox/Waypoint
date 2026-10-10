// #502 — OAuth token endpoint. Claude calls it server-to-server, form-urlencoded,
// without an Origin header; deploy/token-origin.mjs lets that past SvelteKit's
// CSRF check for this path only. Public clients (PKCE), no client secret. Reads
// no cookies.
import { json } from '@sveltejs/kit';
import { exchangeCode, rotateRefresh, type OAuthError } from '$lib/server/mcp/oauth/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const ct = request.headers.get('content-type') ?? '';
	const f = ct.includes('application/json')
		? new URLSearchParams((await request.json().catch(() => ({}))) as Record<string, string>)
		: new URLSearchParams(await request.text());

	// Tolerate client_secret_basic-style headers by reading client_id from them.
	let client_id = f.get('client_id') ?? '';
	const basic = request.headers.get('authorization');
	if (!client_id && basic?.startsWith('Basic ')) {
		client_id = decodeURIComponent(atob(basic.slice(6)).split(':')[0] ?? '');
	}

	const grant = f.get('grant_type');
	const r =
		grant === 'authorization_code'
			? await exchangeCode({
					code: f.get('code') ?? '',
					client_id,
					redirect_uri: f.get('redirect_uri') ?? '',
					code_verifier: f.get('code_verifier') ?? ''
				})
			: grant === 'refresh_token'
				? await rotateRefresh({ refresh_token: f.get('refresh_token') ?? '', client_id })
				: ({ error: 'unsupported_grant_type' } satisfies OAuthError);

	return json(r, {
		status: 'error' in r ? 400 : 200,
		headers: { 'cache-control': 'no-store', pragma: 'no-cache' }
	});
};
