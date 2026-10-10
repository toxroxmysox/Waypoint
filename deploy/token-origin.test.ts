import { describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { fillTokenOrigin } from './token-origin.mjs';

const req = (method: string, url: string, headers: Record<string, string>) =>
	({ method, url, headers: { ...headers } }) as unknown as IncomingMessage;

// The filled Origin must equal what adapter-node computes as url.origin, or
// SvelteKit's CSRF check still 403s: ORIGIN env if set, else
// (PROTOCOL_HEADER value || 'https') + '://' + (HOST_HEADER value || host).
describe('fillTokenOrigin', () => {
	it('defaults to https + host, as adapter-node does with no ORIGIN/PROTOCOL_HEADER (prod)', () => {
		const r = req('POST', '/oauth/token', { host: 'app.example', 'x-forwarded-proto': 'http' });
		fillTokenOrigin(r, {});
		expect(r.headers.origin).toBe('https://app.example');
	});

	it('uses the PROTOCOL_HEADER / HOST_HEADER headers when configured', () => {
		const r = req('POST', '/oauth/token', { host: 'localhost:3000', 'x-forwarded-proto': 'http', 'x-forwarded-host': 'tunnel.example' });
		fillTokenOrigin(r, { PROTOCOL_HEADER: 'x-forwarded-proto', HOST_HEADER: 'x-forwarded-host' });
		expect(r.headers.origin).toBe('http://tunnel.example');
	});

	it('uses ORIGIN when set', () => {
		const r = req('POST', '/oauth/token', { host: 'localhost:3000' });
		fillTokenOrigin(r, { ORIGIN: 'https://app.vandenwarsen.com' });
		expect(r.headers.origin).toBe('https://app.vandenwarsen.com');
	});

	it('leaves a foreign Origin alone, so SvelteKit still rejects it', () => {
		const r = req('POST', '/oauth/token', { origin: 'https://evil.example', host: 'app.example' });
		fillTokenOrigin(r, {});
		expect(r.headers.origin).toBe('https://evil.example');
	});

	it('never touches other paths', () => {
		const r = req('POST', '/login', { host: 'app.example' });
		fillTokenOrigin(r, {});
		expect(r.headers.origin).toBeUndefined();
	});

	it('never touches GET', () => {
		const r = req('GET', '/oauth/token', { host: 'app.example' });
		fillTokenOrigin(r, {});
		expect(r.headers.origin).toBeUndefined();
	});
});
