// #272 — Email Digest Phase 1: shared core for the cron + manual trigger.
//
// NOT a *.pb.js file — PB does not auto-load it as a hook. It is require()'d
// INSIDE each callback in digest.pb.js (PB's pooled goja runtime cannot see
// file-scope helpers of the calling file, but require() of a CommonJS module
// works and was probe-verified on this build, including goja globals like
// DateTime/Timezone inside required functions).
//
// DUPLICATION NOTE: the pure functions here (buildSignature, snapshotItems,
// composeTripDiff, hasChanges, formatDigestDay, renderDigestEmail) are a
// line-for-line JS port of src/lib/digest/digest-diff.ts + digest-email.ts
// (the canonical, typed copies). src/lib/digest/digest-core-parity.test.ts
// runs the same Vitest vectors against BOTH copies — change them together.
//
// Deletions cap note (grill resolution 2026-07-03): no notification event
// records item deletes, so an `updated > last_digest_at` window could never
// report REMOVED. The snapshot in trips.digest_state lifts that cap — removed
// = ids present in the snapshot but gone from the current items.

'use strict';

// --- pure diff (port of src/lib/digest/digest-diff.ts) ----------------------

function buildSignature(fields) {
	return [
		fields.type || '',
		fields.start_time || '',
		fields.end_time || '',
		fields.end_date || '',
		fields.location_name || '',
		String((fields.description || '').length),
		String(fields.cost_estimate_usd || 0),
		fields.booked ? '1' : '0'
	].join('|');
}

function snapshotItems(items) {
	const snap = {};
	for (const item of items) {
		snap[item.id] = { t: item.title, d: item.dayDate, s: item.status, g: item.signature };
	}
	return snap;
}

function composeTripDiff(prev, items) {
	const diff = { added: [], edited: [], moved: [], removed: [] };
	const seen = {};

	for (const item of items) {
		seen[item.id] = true;
		const before = prev[item.id];
		if (!before) {
			diff.added.push({ title: item.title, dayDate: item.dayDate });
			continue;
		}
		if (before.d !== item.dayDate) {
			diff.moved.push({ title: item.title, fromDay: before.d, toDay: item.dayDate });
			continue;
		}
		const renamed = before.t !== item.title;
		const statusChanged = before.s !== item.status;
		const contentChanged = before.g !== item.signature;
		if (renamed || statusChanged || contentChanged) {
			const entry = { title: item.title, dayDate: item.dayDate };
			if (renamed) entry.renamedFrom = before.t;
			if (statusChanged && !renamed && !contentChanged) {
				entry.statusChange = { from: before.s, to: item.status };
			}
			diff.edited.push(entry);
		}
	}

	for (const id of Object.keys(prev)) {
		if (!seen[id]) diff.removed.push({ title: prev[id].t });
	}

	const byDayThenTitle = (a, b) => {
		const da = a.dayDate === '' ? '9999-99-99' : a.dayDate;
		const db = b.dayDate === '' ? '9999-99-99' : b.dayDate;
		return da < db ? -1 : da > db ? 1 : a.title.localeCompare(b.title);
	};
	diff.added.sort(byDayThenTitle);
	diff.edited.sort(byDayThenTitle);
	diff.moved.sort((a, b) => a.title.localeCompare(b.title));
	diff.removed.sort((a, b) => a.title.localeCompare(b.title));

	return diff;
}

function hasChanges(diff) {
	return (
		diff.added.length > 0 ||
		diff.edited.length > 0 ||
		diff.moved.length > 0 ||
		diff.removed.length > 0
	);
}

// --- pure email render (port of src/lib/digest/digest-email.ts) -------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDigestDay(dayDate) {
	if (!dayDate) return 'Ideas';
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dayDate);
	if (!m) return dayDate;
	return MONTHS[parseInt(m[2], 10) - 1] + ' ' + parseInt(m[3], 10);
}

function editedLine(entry) {
	let line = entry.title;
	if (entry.renamedFrom) line += ' (renamed from “' + entry.renamedFrom + '”)';
	else if (entry.statusChange && entry.statusChange.to === 'done') line += ' (marked done)';
	else if (entry.statusChange) line += ' (now ' + entry.statusChange.to + ')';
	if (entry.dayDate) line += ' — ' + formatDigestDay(entry.dayDate);
	return line;
}

function movedLine(entry) {
	return entry.title + ' — ' + formatDigestDay(entry.fromDay) + ' → ' + formatDigestDay(entry.toDay);
}

function escapeHtml(s) {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function renderDigestEmail(opts) {
	const base = opts.appUrl.replace(/\/$/, '');
	const many = opts.sections.length > 1;
	let subject = many
		? 'What changed on ' + opts.sections.length + ' of your trips'
		: 'What changed on ' + opts.sections[0].tripTitle;
	if (opts.testLabel) subject = '[Waypoint digest test] ' + subject;

	const greeting = opts.recipientName ? 'Hi ' + opts.recipientName + ',' : 'Hi,';
	const intro = many
		? 'Here’s what changed on your trips since the last digest.'
		: 'Here’s what changed on ' + opts.sections[0].tripTitle + ' since the last digest.';

	const textParts = [greeting, '', intro, ''];
	const htmlParts = [
		'<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.5; color: #1a1a1a; max-width: 560px;">',
		'<p>' + escapeHtml(greeting) + '</p>',
		'<p>' + escapeHtml(intro) + '</p>'
	];

	for (const section of opts.sections) {
		if (many) {
			textParts.push(section.tripTitle, '');
		}
		if (many) htmlParts.push('<h3 style="margin: 20px 0 4px;">' + escapeHtml(section.tripTitle) + '</h3>');

		const groups = [
			['Added', section.diff.added.map((a) => a.title + ' — ' + formatDigestDay(a.dayDate))],
			['Moved', section.diff.moved.map(movedLine)],
			['Edited', section.diff.edited.map(editedLine)],
			['Removed', section.diff.removed.map((r) => r.title)]
		];

		for (const group of groups) {
			const label = group[0];
			const lines = group[1];
			if (lines.length === 0) continue;
			textParts.push(label);
			for (const line of lines) textParts.push('  • ' + line);
			textParts.push('');
			htmlParts.push(
				'<p style="margin: 12px 0 2px; font-weight: 600; color: #3e5a3a;">' + label + '</p>'
			);
			htmlParts.push(
				'<ul style="margin: 2px 0 8px; padding-left: 20px; color: #333;">' +
					lines.map((line) => '<li>' + escapeHtml(line) + '</li>').join('') +
					'</ul>'
			);
		}
	}

	textParts.push('— Waypoint', '');
	if (opts.sections.length === 1) {
		const url = base + '/trips/' + opts.sections[0].tripSlug + '/settings';
		textParts.push('Prefer not to get these? Turn off digest emails in trip settings:', url);
	} else {
		textParts.push('Prefer not to get these? Turn off digest emails in each trip’s settings:');
		for (const s of opts.sections) {
			textParts.push('  ' + s.tripTitle + ': ' + base + '/trips/' + s.tripSlug + '/settings');
		}
	}

	htmlParts.push('<p style="margin-top: 20px;">&mdash; Waypoint</p>');
	const footerLinks = opts.sections
		.map(
			(s) =>
				'<a href="' +
				base +
				'/trips/' +
				encodeURIComponent(s.tripSlug) +
				'/settings" style="color: #67625a;">' +
				escapeHtml(opts.sections.length === 1 ? 'trip settings' : s.tripTitle + ' settings') +
				'</a>'
		)
		.join(' &middot; ');
	htmlParts.push(
		'<p style="color: #67625a; font-size: 13px;">Prefer not to get these? Turn off digest emails in ' +
			footerLinks +
			'.</p>'
	);
	htmlParts.push('</div>');

	return {
		subject: subject,
		text: textParts.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n',
		html: htmlParts.join('')
	};
}

// --- PB-side plumbing (goja-only; never imported by Vitest) ------------------

/**
 * Parse the trips.digest_state json field, tolerating the shapes goja hands
 * back for JSON fields (byte array / string / object — cf. the suggestions
 * payload handling in notifications.pb.js). Returns null when unset/invalid.
 */
function parseDigestState(raw) {
	try {
		if (raw === null || raw === undefined || raw === '') return null;
		if (Array.isArray(raw)) {
			const str = String.fromCharCode.apply(null, raw);
			if (!str) return null;
			raw = str;
		}
		if (typeof raw === 'string') {
			const parsed = JSON.parse(raw);
			return parsed && typeof parsed === 'object' ? parsed : null;
		}
		if (typeof raw === 'object') return raw;
		return null;
	} catch (_) {
		return null;
	}
}

/**
 * The digest run. Called hourly by the cron and manually by the dev route.
 *
 * opts:
 *   force      — ignore the ~8am-local window (manual testing)
 *   dryRun     — compose everything, send nothing, mutate nothing
 *   toOverride — send every composed email ONLY to this address, subject
 *                labeled "[Waypoint digest test]" (manual verification)
 *
 * Flow per non-archived trip:
 *   1. No digest_state yet → write a silent baseline (any hour — so the first
 *      real digest can go out the very next morning), send nothing.
 *   2. Not ~8am trip-local (hourly cron at :00 → local hour === 8 covers
 *      "morning ~8am" incl. :30/:45 offset zones) and not forced → skip.
 *   3. Diff snapshot vs current items; no changes → skip (no state write).
 *   4. Recipients = active members (removed_at = "" — #133 invariant) with a
 *      real user and digest_opt_out = false. Grouped per user across trips →
 *      ONE email per user per run.
 *   5. Send via Resend REST (invite-email pattern, ADR-0019 sender identity).
 *      last_digest_at + digest_state advance ONLY for trips covered by at
 *      least one successful send (all-fail → retried next morning). A due
 *      trip with changes but zero recipients is consumed silently.
 */
function runDigest(app, opts) {
	opts = opts || {};
	const force = !!opts.force;
	const dryRun = !!opts.dryRun;
	const toOverride = opts.toOverride || '';

	const apiKey = $os.getenv('RESEND_API_KEY');
	const from = $os.getenv('RESEND_FROM');
	const appUrl = $os.getenv('PUBLIC_APP_URL') || 'http://localhost:5173';

	const summary = {
		trips_checked: 0,
		baselined: [],
		not_due: 0,
		no_changes: 0,
		consumed_no_recipients: [],
		emails: [],
		trips_updated: [],
		errors: []
	};

	const nowDt = new DateTime();
	const nowStr = nowDt.string();

	let trips = [];
	try {
		// NB: limit must be a real number — limit=0 returns NOTHING on this
		// build (#260 follow-up scar in notifications.pb.js). Sort by -id:
		// trips has NO `created` autodate (0002 explicit-field scar).
		trips = app.findRecordsByFilter('trips', 'archived = false', '-id', 1000, 0);
	} catch (err) {
		summary.errors.push('trips query: ' + err);
		trips = [];
	}

	// email → { name, sections: [{tripTitle, tripSlug, diff}], tripIds: [] }
	const perUser = {};
	// tripId → { record, snapshot } pending a successful send
	const pendingTrips = {};

	for (const trip of trips) {
		summary.trips_checked++;
		const tripId = trip.id;

		// Trip-local hour via Go tz database (goja has no Intl; an invalid or
		// empty tz silently resolves to UTC — same fallback as tripTz()).
		let localHour = -1;
		try {
			localHour = nowDt.time().in(new Timezone(trip.getString('timezone').trim())).hour();
		} catch (_) {
			localHour = nowDt.time().hour();
		}

		const prev = parseDigestState(trip.get('digest_state'));

		// Current items, day relation resolved to its date.
		let dayDates = {};
		try {
			const days = app.findRecordsByFilter('days', 'trip = {:t}', '', 2000, 0, { t: tripId });
			for (const d of days) dayDates[d.id] = d.getString('date').slice(0, 10);
		} catch (_) {}

		let sourceItems = [];
		try {
			const records = app.findRecordsByFilter('items', 'trip = {:t}', '', 2000, 0, { t: tripId });
			for (const r of records) {
				sourceItems.push({
					id: r.id,
					title: r.getString('title'),
					dayDate: dayDates[r.getString('day')] || '',
					status: r.getString('status'),
					signature: buildSignature({
						type: r.getString('type'),
						start_time: r.getString('start_time'),
						end_time: r.getString('end_time'),
						end_date: r.getString('end_date'),
						location_name: r.getString('location_name'),
						description: r.getString('description'),
						cost_estimate_usd: r.get('cost_estimate_usd'),
						booked: !!r.get('booked')
					})
				});
			}
		} catch (_) {}

		// First sight of this trip: baseline silently, any hour.
		if (!prev) {
			if (!dryRun) {
				try {
					trip.set('digest_state', JSON.stringify(snapshotItems(sourceItems)));
					trip.set('last_digest_at', nowStr);
					app.save(trip);
					summary.baselined.push(trip.getString('slug'));
				} catch (err) {
					summary.errors.push('baseline ' + trip.getString('slug') + ': ' + err);
				}
			} else {
				summary.baselined.push(trip.getString('slug') + ' (dry)');
			}
			continue;
		}

		if (!force && localHour !== 8) {
			summary.not_due++;
			continue;
		}

		const diff = composeTripDiff(prev, sourceItems);
		if (!hasChanges(diff)) {
			summary.no_changes++;
			continue;
		}

		// Active members with a real user, digests on. (#133: removed_at = "".)
		let members = [];
		try {
			members = app.findRecordsByFilter(
				'trip_members',
				'trip = {:t} && removed_at = "" && user != "" && digest_opt_out = false',
				'', 200, 0,
				{ t: tripId }
			);
		} catch (_) {
			members = [];
		}

		const newSnapshot = snapshotItems(sourceItems);
		const tripTitle = trip.getString('title');
		const tripSlug = trip.getString('slug');

		let recipientCount = 0;
		for (const member of members) {
			let email = '';
			let name = '';
			try {
				const user = app.findRecordById('users', member.getString('user'));
				email = String(user.email() || '').trim().toLowerCase();
				name = member.getString('display_name') || user.getString('name') || '';
			} catch (_) {
				continue;
			}
			if (!email) continue;
			recipientCount++;
			if (!perUser[email]) perUser[email] = { name: name, sections: [], tripIds: [] };
			perUser[email].sections.push({ tripTitle: tripTitle, tripSlug: tripSlug, diff: diff });
			perUser[email].tripIds.push(tripId);
		}

		if (recipientCount === 0) {
			// Changes but nobody to tell (all opted out) — consume so the trip
			// doesn't stay perpetually due.
			if (!dryRun) {
				try {
					trip.set('digest_state', JSON.stringify(newSnapshot));
					trip.set('last_digest_at', nowStr);
					app.save(trip);
				} catch (err) {
					summary.errors.push('consume ' + tripSlug + ': ' + err);
				}
			}
			summary.consumed_no_recipients.push(tripSlug);
			continue;
		}

		pendingTrips[tripId] = { record: trip, snapshot: newSnapshot, slug: tripSlug };
	}

	// One email per user covering all their due trips this run.
	const sentTripIds = {};
	for (const email of Object.keys(perUser)) {
		const entry = perUser[email];
		entry.sections.sort((a, b) => a.tripTitle.localeCompare(b.tripTitle));
		const rendered = renderDigestEmail({
			recipientName: entry.name,
			sections: entry.sections,
			appUrl: appUrl,
			testLabel: !!toOverride
		});

		const emailReport = {
			to: toOverride || email,
			original_recipient: email,
			subject: rendered.subject,
			trips: entry.sections.map((s) => s.tripSlug)
		};
		if (dryRun) {
			emailReport.dry_run = true;
			emailReport.text = rendered.text;
			summary.emails.push(emailReport);
			continue;
		}

		if (!apiKey || !from) {
			emailReport.error = 'RESEND_API_KEY or RESEND_FROM not set; not sent';
			summary.emails.push(emailReport);
			summary.errors.push('resend env missing — no sends this run');
			continue;
		}

		try {
			const res = $http.send({
				method: 'POST',
				url: 'https://api.resend.com/emails',
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer ' + apiKey
				},
				body: JSON.stringify({
					from: from,
					to: [toOverride || email],
					subject: rendered.subject,
					text: rendered.text,
					html: rendered.html
				})
			});
			emailReport.status = res.statusCode;
			if (res.statusCode >= 200 && res.statusCode < 300) {
				for (const tid of entry.tripIds) sentTripIds[tid] = true;
			} else {
				summary.errors.push('resend ' + res.statusCode + ' for ' + email);
			}
		} catch (err) {
			emailReport.error = String(err);
			summary.errors.push('resend send failed for ' + email + ': ' + err);
		}
		summary.emails.push(emailReport);
	}

	// Advance state only for trips at least one recipient actually received.
	for (const tripId of Object.keys(pendingTrips)) {
		if (!sentTripIds[tripId]) continue;
		const pending = pendingTrips[tripId];
		try {
			pending.record.set('digest_state', JSON.stringify(pending.snapshot));
			pending.record.set('last_digest_at', nowStr);
			app.save(pending.record);
			summary.trips_updated.push(pending.slug);
		} catch (err) {
			summary.errors.push('update ' + pending.slug + ': ' + err);
		}
	}

	return summary;
}

module.exports = {
	buildSignature: buildSignature,
	snapshotItems: snapshotItems,
	composeTripDiff: composeTripDiff,
	hasChanges: hasChanges,
	formatDigestDay: formatDigestDay,
	renderDigestEmail: renderDigestEmail,
	parseDigestState: parseDigestState,
	runDigest: runDigest
};
