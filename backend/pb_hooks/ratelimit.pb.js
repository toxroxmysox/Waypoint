/// <reference path="../pb_data/types.d.ts" />
// Enable PocketBase's built-in per-IP rate limiter for OTP issuance on every
// boot (issue #284 / audit SECRET-1). The request-otp route is unauthenticated
// and auto-creates a `users` row per call, then emails a 6-digit code via
// Resend — so an attacker can script arbitrary emails to inbox-bomb a victim
// and burn Resend quota/cost while flooding the users table. PB's rate limiter
// is off by default and nothing else enables it.
//
// Mechanism: settings.rateLimits, configured here (NOT the admin UI) so the
// value is version-controlled. Mirrors the boot pattern in smtp.pb.js exactly.
//
// PB keys rate limits on the CLIENT (IP / auth identifier), not on the request
// body — so this is the per-IP half of #284. A true per-EMAIL throttle (one
// victim's address spammed from many rotating IPs) is NOT natively expressible
// in settings.rateLimits; it would need a hook-level counter in auth.pb.js and
// is deferred (see PM report).
//
// When WAYPOINT_DEV_MODE=true (dev + E2E), rate limiting stays OFF — otherwise
// the E2E suite, which hammers request-otp, would 429. Same early-return as
// smtp.pb.js.

onBootstrap((e) => {
	e.next();

	if ($os.getenv('WAYPOINT_DEV_MODE') === 'true') {
		console.log('ratelimit.pb.js: dev mode — rate limits disabled');
		return;
	}

	const settings = e.app.settings();

	// Trusted proxy: in production this origin is reachable ONLY via the
	// Cloudflare Tunnel (public) + tailnet — there is no other path to it. The
	// tunnel terminates the client connection and forwards the real client IP in
	// the CF-Connecting-IP header. Without trusting it, every request would carry
	// the tunnel's single internal IP and the per-IP limiter would bucket ALL
	// users together (one global counter) — useless. Because the ONLY way to
	// reach this origin is through that tunnel, the header is attacker-controlled
	// only if the tunnel itself is bypassed, which the network topology forbids,
	// so trusting CF-Connecting-IP here is safe. useLeftmostIP=false: CF appends a
	// single, trustworthy value (not a client-prependable X-Forwarded-For list),
	// so we take the right-most (the value CF set).
	settings.trustedProxy.headers = ['CF-Connecting-IP'];
	settings.trustedProxy.useLeftmostIP = false;

	// Per-IP cap on the OTP-issuance action. Label `users:requestOTP` is PB's
	// route tag (`{collection}:{action}`) for POST /api/collections/users/
	// request-otp — more robust than a path string. audience '' = applies to
	// guests + auth (OTP issuance is unauthenticated, so the relevant clients are
	// guests). 5 requests / 60s per IP: a legit human fumbling (wrong email,
	// re-send, retry) stays well under 5/min, but a scripted bomber is capped at
	// ~5 emails/min/IP instead of thousands — kills the cost-burn / volume vector
	// without locking out legitimate retry.
	settings.rateLimits.enabled = true;
	settings.rateLimits.rules = [
		{
			label: 'users:requestOTP',
			audience: '',
			duration: 60,
			maxRequests: 5,
		},
	];

	e.app.save(settings);
	console.log('ratelimit.pb.js: OTP rate limit enabled — 5 req/60s per IP on users:requestOTP');
});
