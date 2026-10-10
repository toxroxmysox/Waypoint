// #502 — dev-only: finish a pending authorize request as a bypass-whitelisted
// user, skipping the emailed code (tests/e2e/mcp-helpers.ts). 404 unless
// WAYPOINT_DEV_MODE=true, like /api/dev/login.
import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { PUBLIC_PB_URL } from '$env/static/public';
import { getPending } from '$lib/server/mcp/oauth/pending';
import { completeAuthorize } from '$lib/server/mcp/oauth/authorize';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	if (env.WAYPOINT_DEV_MODE !== 'true') error(404, 'Not found');
	const pending = getPending(url.searchParams.get('req') ?? '');
	if (!pending) error(400, 'pending request unknown or expired');
	const res = await fetch(`${PUBLIC_PB_URL}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: url.searchParams.get('email') ?? '' })
	});
	if (!res.ok) error(res.status, `bypass failed: ${await res.text()}`);
	const { record } = (await res.json()) as { record: { id: string } };
	redirect(303, completeAuthorize(pending, record.id, url.origin));
};
