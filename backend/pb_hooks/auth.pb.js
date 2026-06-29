/// <reference path="../pb_data/types.d.ts" />

// Trip-creator auto-membership used to live here. Consolidated into
// trips.pb.js's onRecordAfterCreateSuccess along with generateDays so we have
// a single hook for the collection — registering the same hook in two files
// caused PB 0.27 to only fire one handler, which ate the day generation.

// Auto-create user on first OTP request so "enter email, get code" works
// regardless of whether the user already exists.
//
// PER-EMAIL OTP THROTTLE (issue #311 — complements the per-IP limiter in
// ratelimit.pb.js / #284). PB's built-in rate limiter keys on the client IP and
// cannot see the request-body email, so it can't stop a single victim address
// being inbox-bombed from many rotating IPs (proxy pools / botnets). This hook
// closes that gap by counting OTP requests per lowercased email in a sliding
// window and blocking once over threshold, BEFORE e.next() fires the email send.
//
// Storage: PB's process-wide in-memory app store (`e.app.store()`), keyed on
// `otp_throttle:<lowercased-email>` -> array of request timestamps (ms). The
// store is concurrent-safe and persists across requests within the PB process.
// The basecamp deploy is a single PB container behind a single adapter-node, so
// per-process counting is sufficient. ASSUMPTION: single PB process. A
// multi-container / horizontally-scaled deploy would need a shared store (PB
// collection or Redis); this in-memory approach (matching #285's posture) needs
// neither migration nor schema. Stale entries are pruned on every call so the
// store can't grow unbounded.
//
// NB (goja gotcha — see cerebrum Do-Not-Repeat 2026-06-05): PB hooks run in a
// pooled goja runtime that CANNOT see file-scope consts/helpers. Module-level
// `const OTP_WINDOW_MS = ...` throws a swallowed `ReferenceError` inside the
// callback. So the window/threshold constants AND all logic are inlined into the
// callback body, and cross-request state lives in `e.app.store()` (reachable via
// `e.app`), NOT a module-level Map.
//
// Enumeration-resistance (#284 AC3): rate-limiting by email leaks only "this
// address was requested recently," never "this address exists." Over-limit
// rejects by throwing the SAME generic error any send failure throws — the
// SvelteKit actions (login / invite / join) all map a thrown requestOTP failure
// to the generic "Failed to send code. Please try again." There is deliberately
// NO email-specific message ("too many requests for this email") that could make
// the throttle response distinguishable by account existence.
//
// Dev-gate OFF: like smtp.pb.js / ratelimit.pb.js, no-op when
// WAYPOINT_DEV_MODE=true so the E2E suite (which hammers request-otp) never
// throttles.

onRecordRequestOTPRequest((e) => {
	// Resolve the target email up front (needed for both the throttle and the
	// auto-create). e.record may already be set (matched an existing user); if so
	// read its email, otherwise pull identity from the request body.
	let email = '';
	if (e.record) {
		email = e.record.email();
	} else {
		// e.email doesn't exist on this event — read identity from request body
		const info = e.requestInfo();
		email = info.body['identity'] || info.body['email'];
	}

	if (!email) {
		throw new BadRequestError('Email is required');
	}

	// Per-email throttle (skipped in dev/E2E). Everything is inlined here — the
	// goja runtime can't see file-scope identifiers, so the constants live inside
	// the callback and persistent state lives in e.app.store().
	if ($os.getenv('WAYPOINT_DEV_MODE') !== 'true') {
		// Threshold: 4 OTP requests per email per 15 min. A legitimate user
		// fumbling (typo, didn't get the email, resend, retry) sends maybe 1-3 in a
		// sitting and stays under 4; a bomber trying to flood one inbox / burn
		// Resend cost is capped at 4 emails / 15 min for that address regardless of
		// how many IPs they rotate through. Tighter than the per-IP 5/60s because
		// that's per-IP volume control; this is per-VICTIM protection where a low
		// ceiling is the whole point.
		const OTP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
		const OTP_MAX_PER_WINDOW = 4;
		const PREFIX = 'otp_throttle:';

		const store = e.app.store();
		const key = PREFIX + String(email).trim().toLowerCase();
		const now = Date.now();
		const cutoff = now - OTP_WINDOW_MS;

		// Prune every throttle entry so the store can't grow unbounded: drop expired
		// timestamps from each key, and remove any key left with no live timestamps.
		// The store only ever holds emails requested within the last window, so its
		// throttle-key count is bounded by recent unique-email volume, not lifetime
		// traffic. getAll() is a shallow copy, so mutating the store while iterating
		// it is safe.
		const all = store.getAll();
		for (const k in all) {
			if (k.indexOf(PREFIX) !== 0) continue;
			const stamps = all[k] || [];
			const live = stamps.filter((t) => t > cutoff);
			if (live.length === 0) {
				store.remove(k);
			} else {
				store.set(k, live);
			}
		}

		const recent = (store.get(key) || []).filter((t) => t > cutoff);
		if (recent.length >= OTP_MAX_PER_WINDOW) {
			// Over-limit. Reject through the generic-error path — same as any other
			// send failure. Do NOT surface an email-specific message (enumeration).
			console.warn('auth.pb.js: per-email OTP throttle tripped (over limit)');
			throw new BadRequestError('Failed to send code. Please try again.');
		}
		recent.push(now);
		store.set(key, recent);
	}

	if (!e.record) {
		const users = e.app.findCollectionByNameOrId('users');
		const record = new Record(users);
		record.setEmail(email);
		// Auth records require a password even when password auth is disabled
		record.setPassword($security.randomString(40));
		e.app.save(record);
		e.record = record;
	}
	e.next();
});
