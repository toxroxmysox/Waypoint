import { test, expect } from '@playwright/test';
import {
	BASE,
	CLIENT_ID,
	REDIRECT_URI,
	authorizeCode,
	authorizeUrl,
	connect,
	pkcePair,
	reqIdFrom,
	rpc,
	tokenRequest
} from './mcp-helpers';
import { E2E_PB_BASE } from './e2e-env';

// #502 / ADR-0024 — Waypoint as a minimal OAuth 2.1 authorization server for the
// Claude connector: CIMD clients, PKCE S256, email-code login, no consent
// screen, refresh rotation with replay revocation. The test client is a CIMD
// document the preview serves at /api/dev/test-cimd (dev-mode only).

const EMAIL = 'rules-owner@e2e.test';

test.describe.configure({ mode: 'serial' });

test('metadata advertises CIMD + S256 and no dynamic registration', async () => {
	const as = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json();
	expect(as.issuer).toBe(BASE);
	expect(as.authorization_endpoint).toBe(`${BASE}/oauth/authorize`);
	expect(as.token_endpoint).toBe(`${BASE}/oauth/token`);
	expect(as.client_id_metadata_document_supported).toBe(true);
	expect(as.code_challenge_methods_supported).toEqual(['S256']);
	expect(as.registration_endpoint).toBeUndefined();

	const pr = await (await fetch(`${BASE}/.well-known/oauth-protected-resource/mcp`)).json();
	expect(pr.resource).toBe(`${BASE}/mcp`);
	expect(pr.authorization_servers).toEqual([BASE]);
});

test('authorize rejects an unregistered redirect_uri without redirecting', async () => {
	const { challenge } = pkcePair();
	const res = await fetch(
		authorizeUrl({
			response_type: 'code',
			client_id: CLIENT_ID,
			redirect_uri: 'https://evil.example/cb',
			state: 's',
			code_challenge: challenge,
			code_challenge_method: 'S256'
		}),
		{ redirect: 'manual' }
	);
	expect(res.status).toBe(400);
	expect(res.headers.get('location')).toBeNull();
});

test('authorize without PKCE redirects back with invalid_request', async () => {
	const res = await fetch(
		authorizeUrl({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, state: 's' }),
		{ redirect: 'manual' }
	);
	expect(res.status).toBe(303);
	const loc = new URL(res.headers.get('location')!);
	expect(`${loc.origin}${loc.pathname}`).toBe(REDIRECT_URI);
	expect(loc.searchParams.get('error')).toBe('invalid_request');
	expect(loc.searchParams.get('state')).toBe('s');
});

test('email step: code field pattern, carried req, no web session cookie', async () => {
	const { challenge } = pkcePair();
	const page = await fetch(
		authorizeUrl({
			response_type: 'code',
			client_id: CLIENT_ID,
			redirect_uri: REDIRECT_URI,
			state: 's',
			code_challenge: challenge,
			code_challenge_method: 'S256'
		})
	);
	const html = await page.text();
	expect(html).toContain('Connect E2E Test Client to Waypoint');
	expect(html).toMatch(/name="email"/);
	const req = reqIdFrom(html);
	// hooks.server.ts always re-exports pb_auth; with no session it's an empty
	// token on an expired cookie. A session would carry a token.
	const sessionCookie = (h: Headers) =>
		h.getSetCookie().some((c) => {
			const v = c.match(/^pb_auth=([^;]*)/)?.[1];
			if (!v) return false;
			try {
				return !!JSON.parse(decodeURIComponent(v)).token;
			} catch {
				return true;
			}
		});
	expect(sessionCookie(page.headers)).toBe(false);

	const res = await fetch(`${BASE}/oauth/authorize?/requestOTP`, {
		method: 'POST',
		// A browser's plain form post accepts HTML; SvelteKit answers JSON otherwise.
		headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE, accept: 'text/html' },
		body: new URLSearchParams({ req, email: `oauth-probe-${Date.now().toString(36)}@e2e.test` }).toString()
	});
	const step2 = await res.text();
	expect(res.status).toBe(200);
	expect(step2).toContain('pattern="[0-9]{6}"');
	expect(reqIdFrom(step2)).toBe(req);
	expect(sessionCookie(res.headers)).toBe(false);
});

test('full flow: code → tokens → MCP → refresh rotation → replay revokes', async () => {
	// Wrong verifier, then a used code, both fail.
	const a = await authorizeCode(EMAIL);
	const bad = await tokenRequest({
		grant_type: 'authorization_code',
		code: a.code,
		client_id: CLIENT_ID,
		redirect_uri: REDIRECT_URI,
		code_verifier: 'wrong-verifier-wrong-verifier-wrong-verifier'
	});
	expect(bad.status).toBe(400);
	expect(bad.json.error).toBe('invalid_grant');
	const reused = await tokenRequest({
		grant_type: 'authorization_code',
		code: a.code,
		client_id: CLIENT_ID,
		redirect_uri: REDIRECT_URI,
		code_verifier: a.verifier
	});
	expect(reused.json.error).toBe('invalid_grant');

	// A good exchange.
	const { access, refresh } = await connect(EMAIL);
	expect(access).toBeTruthy();
	const init = await rpc(access, 'initialize', {
		protocolVersion: '2025-06-18',
		capabilities: {},
		clientInfo: { name: 'e2e', version: '0' }
	});
	expect(init.status).toBe(200);
	expect(init.json.result.serverInfo.name).toBe('waypoint');

	// Refresh rotates.
	const r1 = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh, client_id: CLIENT_ID });
	expect(r1.status).toBe(200);
	expect(r1.json.token_type).toBe('Bearer');
	expect(r1.json.refresh_token).not.toBe(refresh);
	expect((await rpc(r1.json.access_token, 'tools/list')).status).toBe(200);

	// Replaying the old refresh token revokes the connection's tokens.
	const replay = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh, client_id: CLIENT_ID });
	expect(replay.json.error).toBe('invalid_grant');
	expect((await rpc(r1.json.access_token, 'tools/list')).status).toBe(401);
});

test('token endpoint ignores the web session cookie', async () => {
	const bypass = await fetch(`${E2E_PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: EMAIL })
	});
	const { token, record } = await bypass.json();
	const cookie = `pb_auth=${encodeURIComponent(JSON.stringify({ token, model: record }))}`;
	const res = await tokenRequest(
		{ grant_type: 'authorization_code', code: 'nope', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, code_verifier: 'x'.repeat(43) },
		{ cookie }
	);
	expect(res.status).toBe(400);
	expect(res.json.error).toBe('invalid_grant');
});
