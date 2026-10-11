import { describe, expect, it } from 'vitest';
import { pkceS256Ok, randomToken, sha256Hex } from './crypto';

describe('pkceS256Ok', () => {
	// Expected challenge computed independently with openssl:
	// printf %s VERIFIER | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | tr -d '='
	const verifier = 'waypoint-pkce-test-verifier-0123456789abcdefghijk';
	const challenge = 'warFXBCNp8LSgJ1waBrw-ncQinRfwaJYEbGiTM5NI9c';

	it('accepts a matching S256 pair', () => {
		expect(pkceS256Ok(verifier, challenge)).toBe(true);
	});

	it('rejects a wrong verifier', () => {
		expect(pkceS256Ok(verifier + 'x', challenge)).toBe(false);
	});
});

describe('sha256Hex', () => {
	it('is deterministic 64-char hex', () => {
		expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
		expect(sha256Hex('abc')).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe('randomToken', () => {
	it('is 43-char base64url and unique', () => {
		const a = randomToken();
		expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(randomToken()).not.toBe(a);
	});
});
