// #502 — the remote MCP endpoint the Claude connector talks to. Streamable HTTP,
// stateless, JSON responses. Bearer = Waypoint's opaque OAuth access token; each
// request runs as that user through a server-side PB token (admin-pb.ts).
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { lookupAccess } from '$lib/server/mcp/oauth/store';
import { userPb } from '$lib/server/mcp/admin-pb';
import { buildServer } from '$lib/server/mcp/server';
import type { RequestHandler } from './$types';

function unauthorized(origin: string, desc: string) {
	return new Response(JSON.stringify({ error: 'invalid_token', error_description: desc }), {
		status: 401,
		headers: {
			'content-type': 'application/json',
			'www-authenticate': `Bearer error="invalid_token", resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`
		}
	});
}

const handle: RequestHandler = async ({ request, url }) => {
	const auth = request.headers.get('authorization') ?? '';
	const grant = auth.startsWith('Bearer ') ? await lookupAccess(auth.slice(7)) : null;
	if (!grant) return unauthorized(url.origin, auth ? 'token unknown or expired' : 'missing token');
	if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });

	const pb = await userPb(grant.userId);
	const user = await pb
		.collection('users')
		.getOne(grant.userId, { fields: 'id,name', requestKey: null })
		.catch(() => ({ id: grant.userId, name: '' }));
	const server = buildServer({ pb, user: { id: user.id, name: (user.name as string) || 'member' }, now: new Date() });
	const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
	await server.connect(transport);
	return transport.handleRequest(request);
};

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
