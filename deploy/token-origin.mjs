// #502 — the one CSRF exemption Waypoint needs. SvelteKit rejects any
// form-urlencoded POST whose Origin is missing or foreign, and OAuth's token
// request (RFC 6749 §4.1.3) is exactly that: form-urlencoded, sent server-to-
// server by Claude, with no Origin. For POST /oauth/token ONLY, an ABSENT Origin
// is filled with our own. A foreign Origin is left alone (still 403); browsers
// always send Origin on cross-site POSTs, so every form action keeps its CSRF
// check. The token endpoint reads no cookies; PKCE + single-use codes protect it.

/**
 * The filled value must equal adapter-node's own url.origin, or the CSRF check
 * still fails: ORIGIN if set, else (PROTOCOL_HEADER value || 'https') + '://' +
 * (HOST_HEADER value || host). Prod sets neither, so it's https://<host>.
 * @param {import('node:http').IncomingMessage} req
 * @param {Record<string, string | undefined>} [env]
 */
export function fillTokenOrigin(req, env = process.env) {
	if (req.method !== 'POST' || req.headers.origin) return;
	if ((req.url ?? '').split('?')[0] !== '/oauth/token') return;
	if (env.ORIGIN) {
		req.headers.origin = env.ORIGIN;
		return;
	}
	const header = (name) => (name ? req.headers[name.toLowerCase()] : undefined);
	const proto = header(env.PROTOCOL_HEADER) || 'https';
	const host = header(env.HOST_HEADER) || req.headers.host;
	req.headers.origin = `${proto}://${host}`;
}
