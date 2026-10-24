// #502 — resolve an OAuth client by Client ID Metadata Document (CIMD): the
// client_id IS an https URL serving the client's metadata. Claude uses this
// (spike: "Use Claude's published identity"); there is no dynamic registration.
import { env } from '$env/dynamic/private';
import type { OAuthClient } from './pending';

const TTL_MS = 3600_000;
const UNREADABLE = "Couldn't read this app's connection details. Try again from the app.";
const MAX_DOC_BYTES = 16_384;

// Only these hosts may identify a client. With no consent screen (ADR-0024 §1),
// the login must only ever hand a code to the user's own assistant, never to a
// look-alike metadata document; it also keeps the fetch off arbitrary hosts.
const clientHosts = () =>
	(env.MCP_CLIENT_HOSTS ?? 'claude.ai')
		.split(',')
		.map((h) => h.trim().toLowerCase())
		.filter(Boolean);
const cache = new Map<string, { client: OAuthClient; at: number }>();

function allowedUrl(id: string): boolean {
	let u: URL;
	try {
		u = new URL(id);
	} catch {
		return false;
	}
	if (u.protocol === 'https:') return clientHosts().includes(u.hostname.toLowerCase());
	// The e2e test client is served by the preview itself over plain http.
	return (
		env.WAYPOINT_DEV_MODE === 'true' &&
		u.protocol === 'http:' &&
		['localhost', '127.0.0.1'].includes(u.hostname)
	);
}

export async function resolveClient(client_id: string): Promise<OAuthClient | { error: string }> {
	if (!allowedUrl(client_id)) return { error: "This app isn't allowed to connect to Waypoint." };
	const hit = cache.get(client_id);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.client;
	try {
		const res = await fetch(client_id, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(5000),
			redirect: 'error'
		});
		if (!res.ok) return { error: UNREADABLE };
		const body = await res.text();
		if (body.length > MAX_DOC_BYTES) return { error: UNREADABLE };
		const doc = JSON.parse(body) as {
			client_id?: string;
			client_name?: string;
			redirect_uris?: unknown;
		};
		if (doc.client_id !== client_id) return { error: UNREADABLE };
		if (
			!Array.isArray(doc.redirect_uris) ||
			!doc.redirect_uris.length ||
			!doc.redirect_uris.every((r) => typeof r === 'string')
		)
			return { error: UNREADABLE };
		const client: OAuthClient = {
			client_id,
			client_name: typeof doc.client_name === 'string' ? doc.client_name.slice(0, 100) : undefined,
			redirect_uris: doc.redirect_uris as string[]
		};
		cache.set(client_id, { client, at: Date.now() });
		return client;
	} catch (err) {
		console.error('[oauth] client metadata fetch failed', client_id, (err as Error).message);
		return { error: UNREADABLE };
	}
}
