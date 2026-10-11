// #502 — Connections and their tokens, in PB (0077). Access tokens last an hour,
// refresh tokens 30 days, and every refresh rotates. A rotated refresh token is
// kept, expired, so a second use is recognisable as replay: that revokes the
// whole connection (RFC 9700 §4.14.2).
import type { RecordModel } from 'pocketbase';
import { env } from '$env/dynamic/private';
import { adminPb } from '../admin-pb';
import { pkceS256Ok, randomToken, sha256Hex } from './crypto';
import { takeCode, type OAuthClient } from './pending';

export interface TokenSet {
	access_token: string;
	refresh_token: string;
	token_type: 'Bearer';
	expires_in: number;
}

export interface OAuthError {
	error: 'invalid_grant' | 'invalid_request' | 'unsupported_grant_type';
	error_description?: string;
}

const REFRESH_TTL_S = 30 * 24 * 3600;
const accessTtlS = () => Number(env.MCP_ACCESS_TTL_S) || 3600;
const TOUCH_EVERY_MS = 60_000;

const grantError = (error_description: string): OAuthError => ({ error: 'invalid_grant', error_description });
const pbDate = (ms: number) => new Date(ms).toISOString().replace('T', ' ');

async function findToken(hash: string, kind: 'access' | 'refresh'): Promise<RecordModel | null> {
	const pb = await adminPb();
	return pb
		.collection('mcp_tokens')
		.getFirstListItem(pb.filter('hash = {:hash} && kind = {:kind}', { hash, kind }), {
			expand: 'connection',
			requestKey: null
		})
		.catch(() => null);
}

async function mint(connectionId: string): Promise<TokenSet> {
	const pb = await adminPb();
	const access_token = randomToken();
	const refresh_token = randomToken();
	const now = Date.now();
	const ttl = accessTtlS();
	await Promise.all([
		pb.collection('mcp_tokens').create(
			{ connection: connectionId, kind: 'access', hash: sha256Hex(access_token), expires_at: pbDate(now + ttl * 1000) },
			{ requestKey: null }
		),
		pb.collection('mcp_tokens').create(
			{ connection: connectionId, kind: 'refresh', hash: sha256Hex(refresh_token), expires_at: pbDate(now + REFRESH_TTL_S * 1000) },
			{ requestKey: null }
		)
	]);
	return { access_token, refresh_token, token_type: 'Bearer', expires_in: ttl };
}

/** One connection per (user, client): reconnecting reuses it. The unique index
 *  settles a concurrent first connect; the loser re-reads the winner's row. */
async function connectionFor(userId: string, client: OAuthClient): Promise<string> {
	const pb = await adminPb();
	const find = () =>
		pb
			.collection('mcp_connections')
			.getFirstListItem(pb.filter('user = {:u} && client_id = {:c}', { u: userId, c: client.client_id }), { requestKey: null })
			.catch(() => null);
	const existing = await find();
	if (existing) return existing.id;
	try {
		const created = await pb.collection('mcp_connections').create(
			{ user: userId, client_id: client.client_id, client_name: client.client_name ?? '' },
			{ requestKey: null }
		);
		return created.id;
	} catch (err) {
		const winner = await find();
		if (winner) return winner.id;
		throw err;
	}
}

async function revokeConnectionTokens(connectionId: string): Promise<void> {
	const pb = await adminPb();
	const rows = await pb
		.collection('mcp_tokens')
		.getFullList({ filter: pb.filter('connection = {:c}', { c: connectionId }), fields: 'id', requestKey: null });
	await Promise.all(rows.map((r) => pb.collection('mcp_tokens').delete(r.id, { requestKey: null })));
}

export async function exchangeCode(p: {
	code: string;
	client_id: string;
	redirect_uri: string;
	code_verifier: string;
}): Promise<TokenSet | OAuthError> {
	if (!p.code || !p.code_verifier) return { error: 'invalid_request', error_description: 'code and code_verifier required' };
	const rec = takeCode(p.code);
	if (!rec) return grantError('code unknown, used or expired');
	if (rec.client.client_id !== p.client_id) return grantError('client mismatch');
	if (rec.redirect_uri !== p.redirect_uri) return grantError('redirect_uri mismatch');
	if (!pkceS256Ok(p.code_verifier, rec.code_challenge)) return grantError('PKCE verification failed');
	return mint(await connectionFor(rec.userId, rec.client));
}

export async function rotateRefresh(p: { refresh_token: string; client_id: string }): Promise<TokenSet | OAuthError> {
	if (!p.refresh_token) return { error: 'invalid_request', error_description: 'refresh_token required' };
	const row = await findToken(sha256Hex(p.refresh_token), 'refresh');
	if (!row) return grantError('refresh token unknown');
	if (new Date(row.expires_at).getTime() <= Date.now()) {
		await revokeConnectionTokens(row.connection);
		return grantError('refresh token already used or expired');
	}
	const conn = row.expand?.connection as RecordModel | undefined;
	if (!conn || conn.client_id !== p.client_id) return grantError('client mismatch');
	const pb = await adminPb();
	await pb.collection('mcp_tokens').update(row.id, { expires_at: pbDate(Date.now()) }, { requestKey: null });
	return mint(conn.id);
}

export async function lookupAccess(token: string): Promise<{ connectionId: string; userId: string } | null> {
	if (!token) return null;
	const row = await findToken(sha256Hex(token), 'access');
	if (!row || new Date(row.expires_at).getTime() <= Date.now()) return null;
	const conn = row.expand?.connection as RecordModel | undefined;
	if (!conn) return null;
	const last = conn.last_used_at ? new Date(conn.last_used_at).getTime() : 0;
	if (Date.now() - last > TOUCH_EVERY_MS) {
		const pb = await adminPb();
		pb.collection('mcp_connections').update(conn.id, { last_used_at: pbDate(Date.now()) }, { requestKey: null }).catch(() => {});
	}
	return { connectionId: conn.id, userId: conn.user };
}
