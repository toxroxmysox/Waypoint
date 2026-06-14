// Open-redirect guard for the auth flow's `?redirect=` param.
//
// Deep links that hit the (app) guard while logged out are preserved as
// `/login?redirect=<path>` and threaded through requestOTP → verifyOTP →
// claim. The value is attacker-influencable (it rides in the URL), so it must
// be validated to a same-origin, path-only destination before any redirect()
// consumes it — otherwise `?redirect=https://evil.test` or `//evil.test`
// would bounce a freshly-authenticated user off-site.
//
// Rules: must be a non-empty string that starts with a single "/" and is not
// a protocol-relative ("//") or backslash-smuggled ("/\") URL. Everything else
// falls back to `/trips`.

const DEFAULT_DESTINATION = '/trips';

export function safeRedirect(
	target: string | null | undefined,
	fallback: string = DEFAULT_DESTINATION
): string {
	if (!target) return fallback;
	// Must be an absolute path on this origin.
	if (target[0] !== '/') return fallback;
	// Reject protocol-relative ("//host") and backslash variants ("/\host",
	// "/\\host") that browsers normalise to a cross-origin navigation.
	if (target[1] === '/' || target[1] === '\\') return fallback;
	return target;
}
