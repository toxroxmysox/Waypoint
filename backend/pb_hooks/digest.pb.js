/// <reference path="../pb_data/types.d.ts" />
// #272 — Email Digest Phase 1: hourly cron + dev-guarded manual trigger.
//
// Each run selects non-archived trips whose trip-local time is ~8am (hourly
// cron at :00 → local hour === 8) AND whose items changed since the trip's
// last digest (snapshot diff in trips.digest_state), composes ONE email per
// recipient covering all their due trips, and sends via Resend REST (invite
// pattern, ADR-0019 sender identity). All real logic lives in
// digest-core.js, require()'d inside each callback (PB's pooled goja runtime
// cannot see file-scope helpers, but require() works — probe-verified).

// --- hourly cron -------------------------------------------------------------
cronAdd('email_digest', '0 * * * *', () => {
	// Dev PBs never send digests (mirrors the invite hook's dev-mode skip).
	if ($os.getenv('WAYPOINT_DEV_MODE') === 'true') {
		return;
	}

	try {
		const core = require(`${__hooks}/digest-core.js`);
		const summary = core.runDigest($app, {});
		const line =
			'digest.pb.js: cron run — checked=' + summary.trips_checked +
			' baselined=' + summary.baselined.length +
			' emails=' + summary.emails.length +
			' updated=' + summary.trips_updated.length +
			' errors=' + summary.errors.length;
		console.log(line);
		try {
			$app.logger().info(line, 'errors', summary.errors.join('; '));
		} catch (_) {}
	} catch (err) {
		console.log('digest.pb.js: cron run FAILED: ' + err);
		try {
			$app.logger().error('digest cron failed', 'error', String(err));
		} catch (_) {}
	}
});

// --- POST /api/digest/run (dev-guarded manual trigger) -----------------------
// Body: { force?: bool, dry_run?: bool, to_override?: string }
//   force       — ignore the 8am-local window
//   dry_run     — compose only; no sends, no state writes; returns the text
//   to_override — send composed emails ONLY to this address, subject labeled
//                 "[Waypoint digest test]" (single manual verification send)
// Available ONLY when WAYPOINT_DEV_MODE=true — prod relies on the cron.
routerAdd('POST', '/api/digest/run', (e) => {
	if ($os.getenv('WAYPOINT_DEV_MODE') !== 'true') {
		throw new NotFoundError('Not found');
	}

	const info = e.requestInfo();
	const body = info.body || {};
	const core = require(`${__hooks}/digest-core.js`);
	const summary = core.runDigest(e.app, {
		force: !!body['force'],
		dryRun: !!body['dry_run'],
		toOverride: body['to_override'] ? String(body['to_override']) : ''
	});

	return e.json(200, summary);
});
