import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPending, getPending, issueCode, takeCode, type OAuthClient } from './pending';

const client: OAuthClient = {
	client_id: 'https://claude.ai/oauth/mcp-oauth-client-metadata',
	client_name: 'Claude',
	redirect_uris: ['https://claude.ai/api/mcp/auth_callback']
};
const base = {
	client,
	redirect_uri: client.redirect_uris[0],
	state: 's',
	code_challenge: 'c',
	resource: 'https://app.example/mcp'
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('pending authorization requests', () => {
	it('expire after 15 minutes', () => {
		const p = createPending(base);
		expect(getPending(p.id)?.client.client_name).toBe('Claude');
		vi.advanceTimersByTime(15 * 60_000 + 1);
		expect(getPending(p.id)).toBeUndefined();
	});

	it('are consumed by issueCode', () => {
		const p = createPending(base);
		issueCode(p, 'user1');
		expect(getPending(p.id)).toBeUndefined();
	});
});

describe('authorization codes', () => {
	it('are single use', () => {
		const code = issueCode(createPending(base), 'user1');
		const rec = takeCode(code);
		expect(rec?.userId).toBe('user1');
		expect(rec?.redirect_uri).toBe(base.redirect_uri);
		expect(rec?.code_challenge).toBe('c');
		expect(takeCode(code)).toBeUndefined();
	});

	it('expire after 5 minutes', () => {
		const code = issueCode(createPending(base), 'user1');
		vi.advanceTimersByTime(5 * 60_000 + 1);
		expect(takeCode(code)).toBeUndefined();
	});
});
