// #502 — in-flight authorization state: pending /oauth/authorize requests (until
// the member enters their email code) and the authorization codes they turn into
// (until Claude exchanges them, seconds later). Kept in memory on purpose: both
// live minutes at most, and a restart only fails a login that is mid-way. Codes
// are keyed by hash. Long-lived state (connections, tokens) is in PB: store.ts.
import { randomToken, sha256Hex } from './crypto';

export interface OAuthClient {
	client_id: string;
	client_name?: string;
	redirect_uris: string[];
}

export interface PendingAuth {
	id: string;
	client: OAuthClient;
	redirect_uri: string;
	state: string;
	code_challenge: string;
	resource: string;
	created: number;
}

export interface CodeRecord {
	userId: string;
	client: OAuthClient;
	redirect_uri: string;
	code_challenge: string;
	expires: number;
}

const PENDING_TTL_MS = 15 * 60_000;
const CODE_TTL_MS = 5 * 60_000;

// globalThis-anchored so Vite HMR in dev doesn't drop in-flight logins.
const g = globalThis as unknown as {
	__waypointOAuth?: { pending: Map<string, PendingAuth>; codes: Map<string, CodeRecord> };
};
const s = (g.__waypointOAuth ??= { pending: new Map(), codes: new Map() });

export function createPending(p: Omit<PendingAuth, 'id' | 'created'>): PendingAuth {
	const pending: PendingAuth = { ...p, id: randomToken(), created: Date.now() };
	s.pending.set(pending.id, pending);
	return pending;
}

export function getPending(id: string): PendingAuth | undefined {
	const p = s.pending.get(id);
	if (p && Date.now() - p.created > PENDING_TTL_MS) {
		s.pending.delete(id);
		return undefined;
	}
	return p;
}

export function issueCode(pending: PendingAuth, userId: string): string {
	s.pending.delete(pending.id);
	const code = randomToken();
	s.codes.set(sha256Hex(code), {
		userId,
		client: pending.client,
		redirect_uri: pending.redirect_uri,
		code_challenge: pending.code_challenge,
		expires: Date.now() + CODE_TTL_MS
	});
	return code;
}

/** Single use: the code is gone after the first call, valid or not. */
export function takeCode(code: string): CodeRecord | undefined {
	const key = sha256Hex(code);
	const rec = s.codes.get(key);
	s.codes.delete(key);
	if (!rec || rec.expires < Date.now()) return undefined;
	return rec;
}
