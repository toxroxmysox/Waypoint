// #502 — the last hop of /oauth/authorize: once the member has proved their email
// code, turn the pending request into an authorization code and send the browser
// back to the client's registered redirect_uri.
import { issueCode, type PendingAuth } from './pending';

export function completeAuthorize(pending: PendingAuth, userId: string, issuer: string): string {
	const code = issueCode(pending, userId);
	const u = new URL(pending.redirect_uri);
	u.searchParams.set('code', code);
	if (pending.state) u.searchParams.set('state', pending.state);
	u.searchParams.set('iss', issuer);
	return u.toString();
}

export const appNameOf = (p: Pick<PendingAuth, 'client' | 'redirect_uri'>) =>
	p.client.client_name || new URL(p.redirect_uri).host;
