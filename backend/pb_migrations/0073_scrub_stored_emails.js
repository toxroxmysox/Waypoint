/// <reference path="../pb_data/types.d.ts" />
// #449 — one-time scrub of email addresses already stored by pre-#415 code.
//
// #415 (#409) stopped NEW email fallbacks, but rows written before it still
// hold addresses, readable by members over REST and, soon, by the MCP connector
// (#412: emails must never reach the model). Two writers fell back to the email:
//   - the "joined the trip" notification (notifications.pb.js): when the joiner
//     had no account name, the body was "<email> joined the trip";
//   - the removal tombstone (members.pb.js /api/members/remove): the snapshot
//     into trip_members.display_name fell back to the user's email.
// This rewrites them with the neutral labels #415 now writes for the same case:
//   - notification body      → "Someone joined the trip"
//   - tombstone display_name → "Former member"
//
// Scope, deliberately narrow:
//   - only rows that contain "@";
//   - notifications: only "joined the trip" ones (type member_joined, or a body
//     ending " joined the trip"). Other bodies carry text people typed (a review
//     note can hold an address on purpose) and aren't ours to rewrite;
//   - trip_members: only tombstones (removed_at set). Active rows' names and
//     placeholder_email are live data, not snapshots.
//
// IDEMPOTENT: a rewritten row no longer contains "@", so a second run matches
// nothing and writes nothing.
// NEVER THROWS: it runs on prod at deploy (after the backup), where a throw
// would stop PB from starting. Each query and each row is guarded; a failure is
// logged (row id only, never the address) and skipped. saveNoValidate so an old
// row that predates a later constraint can still be scrubbed — the only value
// written is a short constant label.
// Down is a no-op: the addresses are gone on purpose.
//
// Every helper is inlined into the callback (goja sandbox, cerebrum).
migrate(
	(app) => {
		// stdout (the deploy log) + PB's _logs. Ids and counts only, never an address.
		const report = (msg, isProblem) => {
			try {
				console.log('0073_scrub_stored_emails: ' + msg);
			} catch (_) {}
			try {
				if (isProblem) app.logger().warn('0073_scrub_stored_emails: ' + msg);
				else app.logger().info('0073_scrub_stored_emails: ' + msg);
			} catch (_) {}
		};

		// 1. "joined the trip" notification bodies.
		let notifs = [];
		try {
			notifs = app.findRecordsByFilter('notifications', 'body ~ "@"', '', 0, 0);
		} catch (err) {
			report('notifications query failed, skipped: ' + err, true);
			notifs = [];
		}
		let notifsDone = 0;
		for (const n of notifs) {
			try {
				const body = n.getString('body');
				if (body.indexOf('@') === -1) continue;
				const isJoin =
					n.getString('type') === 'member_joined' || / joined the trip$/.test(body);
				if (!isJoin) continue;
				n.set('body', 'Someone joined the trip');
				app.saveNoValidate(n);
				notifsDone++;
			} catch (err) {
				report('notification ' + n.id + ' skipped: ' + err, true);
			}
		}

		// 2. Tombstoned members' snapshotted display_name.
		let tombstones = [];
		try {
			tombstones = app.findRecordsByFilter(
				'trip_members',
				'removed_at != "" && display_name ~ "@"',
				'',
				0,
				0
			);
		} catch (err) {
			report('trip_members query failed, skipped: ' + err, true);
			tombstones = [];
		}
		let tombstonesDone = 0;
		for (const m of tombstones) {
			try {
				// getString, not get: an empty date reads truthy in goja.
				if (!m.getString('removed_at')) continue;
				if (m.getString('display_name').indexOf('@') === -1) continue;
				m.set('display_name', 'Former member');
				app.saveNoValidate(m);
				tombstonesDone++;
			} catch (err) {
				report('trip_member ' + m.id + ' skipped: ' + err, true);
			}
		}

		// Always logged: on a re-run "rewrote 0 …, 0 …" is the proof it was a no-op.
		report('rewrote ' + notifsDone + ' notification bodies, ' + tombstonesDone + ' tombstone names');
	},
	(app) => {
		// No-op: the scrubbed addresses are not restorable, by design.
	}
);
