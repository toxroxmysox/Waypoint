/// <reference path="../pb_data/types.d.ts" />
// Configure PocketBase SMTP + sender settings from env vars on every boot.
// This makes OTP emails (and any other PB-sent mail) go through Resend's SMTP
// relay in production, while staying unconfigured (disabled) in dev mode where
// E2E tests use the auth-bypass endpoint instead.
//
// Required env vars for production:
//   SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, RESEND_FROM
//
// When WAYPOINT_DEV_MODE=true OR any required var is missing, SMTP is disabled
// and PB falls back to its default (no mail sent).

onBootstrap((e) => {
	e.next();

	if ($os.getenv('WAYPOINT_DEV_MODE') === 'true') {
		console.log('smtp.pb.js: dev mode — SMTP disabled');
		return;
	}

	const host = $os.getenv('SMTP_HOST');
	const port = parseInt($os.getenv('SMTP_PORT') || '0', 10);
	const username = $os.getenv('SMTP_USERNAME');
	const password = $os.getenv('SMTP_PASSWORD');
	const from = $os.getenv('RESEND_FROM');

	if (!host || !port || !password) {
		console.log('smtp.pb.js: SMTP env vars not fully set — SMTP disabled');
		return;
	}

	const settings = e.app.settings();

	settings.smtp.enabled = true;
	settings.smtp.host = host;
	settings.smtp.port = port;
	settings.smtp.username = username || 'resend';
	settings.smtp.password = password;
	settings.smtp.tls = true;
	settings.smtp.authMethod = 'LOGIN';

	settings.meta.appName = 'Waypoint';
	settings.meta.senderName = 'Waypoint';
	settings.meta.senderAddress = from || 'hello@vandenwarsen.com';

	e.app.save(settings);
	console.log('smtp.pb.js: SMTP configured — ' + host + ':' + port);
});
