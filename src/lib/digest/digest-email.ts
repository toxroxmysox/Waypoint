// #272 — Email Digest Phase 1: pure email renderer.
//
// Turns per-trip diffs into one consolidated email per recipient (plain,
// calm, editorial — plaintext-first like the invite email, with a minimal
// HTML wrap). Framework-free and Intl-free so the goja port stays
// line-for-line (backend/pb_hooks/digest-core.js — change them together).

import { hasChanges, type TripDiff, type DigestEdited, type DigestMoved } from './digest-diff';
import type { TripReminders } from './digest-reminders';

export interface TripDigestSection {
	tripTitle: string;
	tripSlug: string;
	diff: TripDiff;
	/** #522 — this recipient's reminders for the trip, if any are due. */
	reminders?: TripReminders;
}

export interface RenderedDigest {
	subject: string;
	text: string;
	html: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-06-05' → 'Jun 5'. '' → 'Ideas' (the unscheduled parking lot). */
export function formatDigestDay(dayDate: string): string {
	if (!dayDate) return 'Ideas';
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dayDate);
	if (!m) return dayDate;
	return MONTHS[parseInt(m[2], 10) - 1] + ' ' + parseInt(m[3], 10);
}

function editedLine(entry: DigestEdited): string {
	let line = entry.title;
	if (entry.renamedFrom) line += ' (renamed from “' + entry.renamedFrom + '”)';
	else if (entry.statusChange && entry.statusChange.to === 'done') line += ' (marked done)';
	else if (entry.statusChange) line += ' (now ' + entry.statusChange.to + ')';
	if (entry.dayDate) line += ' — ' + formatDigestDay(entry.dayDate);
	return line;
}

function movedLine(entry: DigestMoved): string {
	return entry.title + ' — ' + formatDigestDay(entry.fromDay) + ' → ' + formatDigestDay(entry.toDay);
}

// #522 — reminder groups, after a section's change groups.
function reminderGroups(section: TripDigestSection, base: string): Array<[string, string[]]> {
	const r = section.reminders;
	if (!r) return [];
	const groups: Array<[string, string[]]> = [];
	if (r.booking.length > 0) {
		groups.push([
			'Still to book',
			r.booking.map((b) => b.title + ' — needed ' + formatDigestDay(b.date) + ' (in ' + b.daysOut + ' days)')
		]);
	}
	if (r.brief) {
		const lines: string[] = [];
		for (const x of r.brief.stays) lines.push('Stay: ' + x.title + ' — ' + formatDigestDay(x.date));
		for (const x of r.brief.travel) lines.push('Travel: ' + x.title + ' — ' + formatDigestDay(x.date));
		for (const x of r.brief.unbooked) lines.push('Not booked yet: ' + x.title + ' — ' + formatDigestDay(x.date));
		if (lines.length === 0) lines.push('Nothing booked to list yet.');
		lines.push('Your trip: ' + base + '/trips/' + section.tripSlug);
		groups.push(['Starts in 3 days (' + formatDigestDay(r.brief.start) + ')', lines]);
	}
	if (r.closeout) {
		groups.push([
			'Wrap up',
			['The trip ended 3 days ago. Close it out: ' + base + '/trips/' + section.tripSlug + '/closeout']
		]);
	}
	return groups;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * Render the consolidated digest for one recipient.
 * Sections are assumed non-empty (hasChanges or #522 reminders) — the caller filters.
 */
export function renderDigestEmail(opts: {
	recipientName: string;
	sections: TripDigestSection[];
	appUrl: string;
	/** Prefixes the subject so a manual verification send is unmistakable. */
	testLabel?: boolean;
}): RenderedDigest {
	const base = opts.appUrl.replace(/\/$/, '');
	const many = opts.sections.length > 1;
	// #522 — reminders alone (no changes anywhere) read as "coming up", not "changed".
	const anyChanges = opts.sections.some((s) => hasChanges(s.diff));
	const verb = anyChanges ? 'What changed on ' : 'Coming up on ';
	let subject = many ? verb + opts.sections.length + ' of your trips' : verb + opts.sections[0].tripTitle;
	if (opts.testLabel) subject = '[Waypoint digest test] ' + subject;

	const greeting = opts.recipientName ? 'Hi ' + opts.recipientName + ',' : 'Hi,';
	const intro = !anyChanges
		? many
			? 'Here’s what’s coming up on your trips.'
			: 'Here’s what’s coming up on ' + opts.sections[0].tripTitle + '.'
		: many
			? 'Here’s what changed on your trips since the last digest.'
			: 'Here’s what changed on ' + opts.sections[0].tripTitle + ' since the last digest.';

	const textParts: string[] = [greeting, '', intro, ''];
	const htmlParts: string[] = [
		'<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.5; color: #1a1a1a; max-width: 560px;">',
		'<p>' + escapeHtml(greeting) + '</p>',
		'<p>' + escapeHtml(intro) + '</p>'
	];

	for (const section of opts.sections) {
		if (many) {
			textParts.push(section.tripTitle, '');
		}
		if (many) htmlParts.push('<h3 style="margin: 20px 0 4px;">' + escapeHtml(section.tripTitle) + '</h3>');

		const groups: Array<[string, string[]]> = [
			['Added', section.diff.added.map((a) => a.title + ' — ' + formatDigestDay(a.dayDate))],
			['Moved', section.diff.moved.map(movedLine)],
			['Edited', section.diff.edited.map(editedLine)],
			['Removed', section.diff.removed.map((r) => r.title)]
		];
		for (const g of reminderGroups(section, base)) groups.push(g);

		for (const [label, lines] of groups) {
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

	// Footer: opt-out lives on each trip's Settings page (no tokenized unsub in Phase 1).
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
		subject,
		text: textParts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n',
		html: htmlParts.join('')
	};
}
