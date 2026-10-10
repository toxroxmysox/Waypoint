// #502 — token + PKCE primitives for Waypoint's OAuth server. Tokens are opaque
// random strings; only their SHA-256 is ever stored.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function randomToken(): string {
	return randomBytes(32).toString('base64url');
}

export function sha256Hex(s: string): string {
	return createHash('sha256').update(s).digest('hex');
}

/** RFC 7636 S256: BASE64URL(SHA256(verifier)) === challenge. */
export function pkceS256Ok(verifier: string, challenge: string): boolean {
	const a = Buffer.from(createHash('sha256').update(verifier).digest('base64url'));
	const b = Buffer.from(challenge);
	return a.length === b.length && timingSafeEqual(a, b);
}
