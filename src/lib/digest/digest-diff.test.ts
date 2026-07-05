import { describe, it, expect } from 'vitest';
import {
	buildSignature,
	snapshotItems,
	composeTripDiff,
	hasChanges,
	type DigestSourceItem,
	type DigestSnapshot
} from './digest-diff';
import { renderDigestEmail, formatDigestDay } from './digest-email';

function item(overrides: Partial<DigestSourceItem> & { id: string }): DigestSourceItem {
	return {
		title: 'Untitled',
		dayDate: '',
		status: 'unplanned',
		signature: buildSignature({}),
		...overrides
	};
}

describe('buildSignature', () => {
	it('is stable for identical content', () => {
		expect(buildSignature({ type: 'meal', description: 'abc' })).toBe(
			buildSignature({ type: 'meal', description: 'abc' })
		);
	});

	it('changes when a content field changes', () => {
		const base = buildSignature({ type: 'activity', start_time: '2026-06-05 09:00:00.000Z' });
		expect(buildSignature({ type: 'activity', start_time: '2026-06-05 10:00:00.000Z' })).not.toBe(base);
		expect(buildSignature({ type: 'activity', location_name: 'Pier 3' })).not.toBe(base);
		expect(buildSignature({ type: 'activity', booked: true })).not.toBe(base);
		expect(buildSignature({ type: 'activity', cost_estimate_usd: 40 })).not.toBe(base);
	});

	it('sees description changes via length only', () => {
		const a = buildSignature({ description: 'short' });
		expect(buildSignature({ description: 'other' })).toBe(a); // same length — accepted blind spot
		expect(buildSignature({ description: 'much longer text' })).not.toBe(a);
	});

	it('treats unset cost as 0 (PB number fields cannot store null)', () => {
		expect(buildSignature({ cost_estimate_usd: null })).toBe(buildSignature({ cost_estimate_usd: 0 }));
	});
});

describe('composeTripDiff', () => {
	const kayak = item({
		id: 'i1',
		title: 'Sunset kayak',
		dayDate: '2026-06-05',
		status: 'planned',
		signature: buildSignature({ type: 'activity' })
	});
	const tapas = item({ id: 'i2', title: 'Tapas crawl', status: 'unplanned' });
	const prev: DigestSnapshot = snapshotItems([kayak, tapas]);

	it('reports nothing when nothing changed', () => {
		const diff = composeTripDiff(prev, [kayak, tapas]);
		expect(hasChanges(diff)).toBe(false);
	});

	it('detects added items (scheduled and ideas)', () => {
		const museum = item({ id: 'i3', title: 'Museum', dayDate: '2026-06-04', status: 'planned' });
		const idea = item({ id: 'i4', title: 'Beach nap' });
		const diff = composeTripDiff(prev, [kayak, tapas, museum, idea]);
		expect(diff.added).toEqual([
			{ title: 'Museum', dayDate: '2026-06-04' },
			{ title: 'Beach nap', dayDate: '' }
		]);
		expect(diff.edited).toEqual([]);
		expect(diff.moved).toEqual([]);
		expect(diff.removed).toEqual([]);
	});

	it('detects removed items by snapshot title', () => {
		const diff = composeTripDiff(prev, [kayak]);
		expect(diff.removed).toEqual([{ title: 'Tapas crawl' }]);
	});

	it('detects a day→day move', () => {
		const movedKayak = { ...kayak, dayDate: '2026-06-06' };
		const diff = composeTripDiff(prev, [movedKayak, tapas]);
		expect(diff.moved).toEqual([
			{ title: 'Sunset kayak', fromDay: '2026-06-05', toDay: '2026-06-06' }
		]);
		expect(diff.edited).toEqual([]);
	});

	it('detects ideas→day (scheduled) and day→ideas (parked) as moves', () => {
		const scheduledTapas = { ...tapas, dayDate: '2026-06-05', status: 'planned' };
		const parkedKayak = { ...kayak, dayDate: '', status: 'unplanned' };
		const diff = composeTripDiff(prev, [parkedKayak, scheduledTapas]);
		expect(diff.moved).toEqual([
			{ title: 'Sunset kayak', fromDay: '2026-06-05', toDay: '' },
			{ title: 'Tapas crawl', fromDay: '', toDay: '2026-06-05' }
		]);
	});

	it('move wins over a simultaneous content edit (one category per item)', () => {
		const both = { ...kayak, dayDate: '2026-06-06', signature: buildSignature({ booked: true }) };
		const diff = composeTripDiff(prev, [both, tapas]);
		expect(diff.moved).toHaveLength(1);
		expect(diff.edited).toHaveLength(0);
	});

	it('detects a rename as edited with renamedFrom', () => {
		const renamed = { ...kayak, title: 'Sunrise kayak' };
		const diff = composeTripDiff(prev, [renamed, tapas]);
		expect(diff.edited).toEqual([
			{ title: 'Sunrise kayak', dayDate: '2026-06-05', renamedFrom: 'Sunset kayak' }
		]);
	});

	it('detects a content change as edited', () => {
		const rebooked = { ...kayak, signature: buildSignature({ type: 'activity', booked: true }) };
		const diff = composeTripDiff(prev, [rebooked, tapas]);
		expect(diff.edited).toEqual([{ title: 'Sunset kayak', dayDate: '2026-06-05' }]);
	});

	it('reports a pure status flip (checked off) with statusChange', () => {
		const done = { ...kayak, status: 'done' };
		const diff = composeTripDiff(prev, [done, tapas]);
		expect(diff.edited).toEqual([
			{
				title: 'Sunset kayak',
				dayDate: '2026-06-05',
				statusChange: { from: 'planned', to: 'done' }
			}
		]);
	});

	it('ignores churn that only bumps `updated` (identical snapshot fields)', () => {
		// Simulates drag-reorder: rank changed, nothing snapshotted changed.
		const diff = composeTripDiff(prev, [{ ...kayak }, { ...tapas }]);
		expect(hasChanges(diff)).toBe(false);
	});

	it('handles an empty snapshot (everything added) and empty current (everything removed)', () => {
		const allAdded = composeTripDiff({}, [kayak, tapas]);
		expect(allAdded.added).toHaveLength(2);
		const allRemoved = composeTripDiff(prev, []);
		expect(allRemoved.removed).toHaveLength(2);
	});

	it('sorts added scheduled-first by day, ideas last', () => {
		const diff = composeTripDiff({}, [
			item({ id: 'a', title: 'Zed idea' }),
			item({ id: 'b', title: 'Late', dayDate: '2026-06-09', status: 'planned' }),
			item({ id: 'c', title: 'Early', dayDate: '2026-06-02', status: 'planned' }),
			item({ id: 'd', title: 'Alpha idea' })
		]);
		expect(diff.added.map((a) => a.title)).toEqual(['Early', 'Late', 'Alpha idea', 'Zed idea']);
	});
});

describe('snapshotItems round-trip', () => {
	it('a snapshot diffed against its own source is empty', () => {
		const items = [
			item({ id: 'x', title: 'A', dayDate: '2026-01-01', status: 'planned' }),
			item({ id: 'y', title: 'B' })
		];
		expect(hasChanges(composeTripDiff(snapshotItems(items), items))).toBe(false);
	});

	it('survives JSON serialization (the PB storage round-trip)', () => {
		const items = [item({ id: 'x', title: 'A “quoted” — title', dayDate: '2026-01-01' })];
		const revived = JSON.parse(JSON.stringify(snapshotItems(items)));
		expect(hasChanges(composeTripDiff(revived, items))).toBe(false);
	});
});

describe('formatDigestDay', () => {
	it('formats a date and maps empty to Ideas', () => {
		expect(formatDigestDay('2026-06-05')).toBe('Jun 5');
		expect(formatDigestDay('2026-12-25 00:00:00.000Z')).toBe('Dec 25');
		expect(formatDigestDay('')).toBe('Ideas');
	});
});

describe('renderDigestEmail', () => {
	const diff = composeTripDiff(
		snapshotItems([
			item({ id: 'i1', title: 'Sunset kayak', dayDate: '2026-06-05', status: 'planned' }),
			item({ id: 'i2', title: 'Bus tour', dayDate: '2026-06-03', status: 'planned' })
		]),
		[
			item({ id: 'i1', title: 'Sunset kayak', dayDate: '2026-06-06', status: 'planned' }),
			item({ id: 'i3', title: 'Tapas crawl' })
		]
	);

	it('renders a single-trip email with all groups and the settings footer', () => {
		const email = renderDigestEmail({
			recipientName: 'Scott',
			sections: [{ tripTitle: 'Barcelona 2026', tripSlug: 'barcelona-2026', diff }],
			appUrl: 'https://app.vandenwarsen.com/'
		});
		expect(email.subject).toBe('What changed on Barcelona 2026');
		expect(email.text).toContain('Hi Scott,');
		expect(email.text).toContain('Added');
		expect(email.text).toContain('Tapas crawl — Ideas');
		expect(email.text).toContain('Moved');
		expect(email.text).toContain('Sunset kayak — Jun 5 → Jun 6');
		expect(email.text).toContain('Removed');
		expect(email.text).toContain('Bus tour');
		expect(email.text).toContain('https://app.vandenwarsen.com/trips/barcelona-2026/settings');
		expect(email.html).toContain('/trips/barcelona-2026/settings');
		expect(email.text).not.toContain('Edited'); // empty group omitted
	});

	it('consolidates multiple trips into one email with per-trip settings links', () => {
		const email = renderDigestEmail({
			recipientName: '',
			sections: [
				{ tripTitle: 'Barcelona 2026', tripSlug: 'barcelona-2026', diff },
				{ tripTitle: 'Tokyo 2027', tripSlug: 'tokyo-2027', diff }
			],
			appUrl: 'https://app.vandenwarsen.com'
		});
		expect(email.subject).toBe('What changed on 2 of your trips');
		expect(email.text).toContain('Hi,');
		expect(email.text).toContain('Barcelona 2026');
		expect(email.text).toContain('Tokyo 2027');
		expect(email.text).toContain('/trips/tokyo-2027/settings');
	});

	it('labels test sends unmistakably', () => {
		const email = renderDigestEmail({
			recipientName: 'Scott',
			sections: [{ tripTitle: 'Barcelona 2026', tripSlug: 'barcelona-2026', diff }],
			appUrl: 'https://app.vandenwarsen.com',
			testLabel: true
		});
		expect(email.subject).toBe('[Waypoint digest test] What changed on Barcelona 2026');
	});

	it('escapes HTML in titles', () => {
		const nasty = composeTripDiff({}, [item({ id: 'n', title: '<script>alert(1)</script>' })]);
		const email = renderDigestEmail({
			recipientName: 'Scott',
			sections: [{ tripTitle: 'T', tripSlug: 't', diff: nasty }],
			appUrl: 'https://x.test'
		});
		expect(email.html).not.toContain('<script>');
		expect(email.html).toContain('&lt;script&gt;');
	});
});
