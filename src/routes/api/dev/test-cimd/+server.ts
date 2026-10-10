// #502 — dev-only CIMD document for the e2e OAuth client (tests/e2e/mcp-helpers.ts).
import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	if (env.WAYPOINT_DEV_MODE !== 'true') error(404, 'Not found');
	return json({
		client_id: `${url.origin}/api/dev/test-cimd`,
		client_name: 'E2E Test Client',
		redirect_uris: [`${url.origin}/api/dev/test-callback`],
		token_endpoint_auth_method: 'none'
	});
};
