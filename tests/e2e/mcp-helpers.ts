// #502 — drive Waypoint's OAuth server + MCP endpoint from specs, the way the
// Claude connector does. The emailed 6-digit code can't be read in a test, so
// connect() finishes the pending authorize request through the dev-only
// /oauth/authorize/dev route (WAYPOINT_DEV_MODE-gated, same redirect as verifyOTP).
import { createHash, randomBytes } from 'node:crypto';
import { E2E_BASE } from './e2e-env';

export const BASE = E2E_BASE;
export const CLIENT_ID = `${BASE}/api/dev/test-cimd`;
export const REDIRECT_URI = `${BASE}/api/dev/test-callback`;

export function pkcePair() {
	const verifier = randomBytes(32).toString('base64url');
	const challenge = createHash('sha256').update(verifier).digest('base64url');
	return { verifier, challenge };
}

export function authorizeUrl(params: Record<string, string>): string {
	const u = new URL(`${BASE}/oauth/authorize`);
	for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
	return u.toString();
}

/** The pending-request id the authorize page carries in its hidden `req` input. */
export function reqIdFrom(html: string): string {
	const m = html.match(/name="req"[^>]*value="([^"]+)"/) ?? html.match(/value="([^"]+)"[^>]*name="req"/);
	if (!m) throw new Error('no req input on authorize page');
	return m[1];
}

/**
 * Token endpoint call. `Origin: BASE` stands in for deploy/token-origin.mjs:
 * `vite preview` has no shim and SvelteKit 403s a form POST without Origin.
 */
export async function tokenRequest(body: Record<string, string>, headers: Record<string, string> = {}) {
	const res = await fetch(`${BASE}/oauth/token`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE, ...headers },
		body: new URLSearchParams(body).toString()
	});
	return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, string> };
}

/** authorize → (dev) code → callback. Returns the code and the verifier that goes with it. */
export async function authorizeCode(email: string): Promise<{ code: string; verifier: string; state: string }> {
	const { verifier, challenge } = pkcePair();
	const state = randomBytes(8).toString('hex');
	const page = await fetch(
		authorizeUrl({
			response_type: 'code',
			client_id: CLIENT_ID,
			redirect_uri: REDIRECT_URI,
			state,
			code_challenge: challenge,
			code_challenge_method: 'S256',
			resource: `${BASE}/mcp`
		})
	);
	if (page.status !== 200) throw new Error(`authorize ${page.status}: ${await page.text()}`);
	const req = reqIdFrom(await page.text());
	const done = await fetch(`${BASE}/oauth/authorize/dev?req=${encodeURIComponent(req)}&email=${encodeURIComponent(email)}`, {
		redirect: 'manual'
	});
	const loc = done.headers.get('location');
	if (done.status !== 303 || !loc) throw new Error(`dev authorize ${done.status}: ${await done.text()}`);
	const cb = new URL(loc);
	if (cb.searchParams.get('state') !== state) throw new Error('state not echoed');
	return { code: cb.searchParams.get('code')!, verifier, state };
}

export async function connect(email: string): Promise<{ access: string; refresh: string }> {
	const { code, verifier } = await authorizeCode(email);
	const t = await tokenRequest({
		grant_type: 'authorization_code',
		code,
		client_id: CLIENT_ID,
		redirect_uri: REDIRECT_URI,
		code_verifier: verifier
	});
	if (t.status !== 200) throw new Error(`token ${t.status}: ${JSON.stringify(t.json)}`);
	return { access: t.json.access_token, refresh: t.json.refresh_token };
}

let rpcId = 0;
export async function rpc(access: string, method: string, params: Record<string, unknown> = {}) {
	const res = await fetch(`${BASE}/mcp`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
			authorization: `Bearer ${access}`
		},
		body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params })
	});
	return { status: res.status, headers: res.headers, json: (await res.json().catch(() => ({}))) as any };
}

export async function callTool(
	access: string,
	name: string,
	args: Record<string, unknown> = {}
): Promise<{ text: string; structured: any; isError?: boolean }> {
	const r = await rpc(access, 'tools/call', { name, arguments: args });
	if (r.status !== 200 || r.json.error) throw new Error(`tools/call ${name} ${r.status}: ${JSON.stringify(r.json)}`);
	const res = r.json.result;
	return {
		text: (res.content ?? []).map((c: { text?: string }) => c.text ?? '').join('\n'),
		structured: res.structuredContent,
		isError: res.isError
	};
}
