// #502 — RFC 9728 protected-resource metadata. /mcp's 401 points here; MCP
// clients also probe the bare path, so any suffix answers.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) =>
	json({
		resource: `${url.origin}/mcp`,
		authorization_servers: [url.origin],
		bearer_methods_supported: ['header']
	});
