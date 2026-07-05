// #272 — parity harness: backend/pb_hooks/digest-core.js is a line-for-line
// JS port of digest-diff.ts + digest-email.ts (PB's goja sandbox can't import
// src/lib). This suite proves the two copies agree, so the Vitest coverage of
// the canonical TS module transfers to the hook copy.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as ts from './digest-diff';
import { renderDigestEmail as tsRender, formatDigestDay as tsFormatDay } from './digest-email';

// The repo is "type": "module", so node refuses to require() the CommonJS
// hook file. Evaluate it the way PB's goja require() does: wrap in a CJS
// module shim. (Renaming to .cjs would desync it from the goja-verified path.)
const corePath = join(dirname(fileURLToPath(import.meta.url)), '../../../backend/pb_hooks/digest-core.js');
/* eslint-disable @typescript-eslint/no-explicit-any */
const coreModule = { exports: {} as any };
new Function('module', 'exports', readFileSync(corePath, 'utf8'))(coreModule, coreModule.exports);
const core = coreModule.exports;
/* eslint-enable @typescript-eslint/no-explicit-any */

const items: ts.DigestSourceItem[] = [
	{
		id: 'i1',
		title: 'Sunset kayak',
		dayDate: '2026-06-05',
		status: 'planned',
		signature: ts.buildSignature({ type: 'activity', location_name: 'Pier 3' })
	},
	{ id: 'i2', title: 'Tapas crawl', dayDate: '', status: 'unplanned', signature: ts.buildSignature({}) },
	{
		id: 'i3',
		title: 'Bus tour',
		dayDate: '2026-06-03',
		status: 'planned',
		signature: ts.buildSignature({ type: 'activity', cost_estimate_usd: 25 })
	}
];

const after: ts.DigestSourceItem[] = [
	// i1 moved a day later
	{ ...items[0], dayDate: '2026-06-06' },
	// i2 renamed
	{ ...items[1], title: 'Tapas crawl (old town)' },
	// i3 removed; i4 added
	{ id: 'i4', title: 'Museum', dayDate: '2026-06-04', status: 'planned', signature: ts.buildSignature({ type: 'activity' }) }
];

describe('digest-core.js parity with src/lib/digest', () => {
	it('buildSignature agrees', () => {
		const fields = {
			type: 'lodging',
			start_time: '2026-06-05 09:00:00.000Z',
			description: 'three nights',
			cost_estimate_usd: 420.5,
			booked: true
		};
		expect(core.buildSignature(fields)).toBe(ts.buildSignature(fields));
		expect(core.buildSignature({})).toBe(ts.buildSignature({}));
		expect(core.buildSignature({ cost_estimate_usd: null })).toBe(
			ts.buildSignature({ cost_estimate_usd: null })
		);
	});

	it('snapshotItems agrees', () => {
		expect(core.snapshotItems(items)).toEqual(ts.snapshotItems(items));
	});

	it('composeTripDiff agrees on a mixed add/edit/move/remove scenario', () => {
		const prev = ts.snapshotItems(items);
		expect(core.composeTripDiff(prev, after)).toEqual(ts.composeTripDiff(prev, after));
	});

	it('composeTripDiff agrees on empty snapshot and empty current', () => {
		expect(core.composeTripDiff({}, items)).toEqual(ts.composeTripDiff({}, items));
		expect(core.composeTripDiff(ts.snapshotItems(items), [])).toEqual(
			ts.composeTripDiff(ts.snapshotItems(items), [])
		);
	});

	it('hasChanges agrees', () => {
		const prev = ts.snapshotItems(items);
		expect(core.hasChanges(core.composeTripDiff(prev, items))).toBe(
			ts.hasChanges(ts.composeTripDiff(prev, items))
		);
		expect(core.hasChanges(core.composeTripDiff(prev, after))).toBe(
			ts.hasChanges(ts.composeTripDiff(prev, after))
		);
	});

	it('formatDigestDay agrees', () => {
		for (const d of ['2026-06-05', '2026-12-25 00:00:00.000Z', '', 'garbage']) {
			expect(core.formatDigestDay(d)).toBe(tsFormatDay(d));
		}
	});

	it('renderDigestEmail agrees byte-for-byte (single and multi trip, test label)', () => {
		const prev = ts.snapshotItems(items);
		const diff = ts.composeTripDiff(prev, after);
		const single = {
			recipientName: 'Scott',
			sections: [{ tripTitle: 'Barcelona 2026', tripSlug: 'barcelona-2026', diff }],
			appUrl: 'https://app.vandenwarsen.com/'
		};
		expect(core.renderDigestEmail(single)).toEqual(tsRender(single));

		const multi = {
			recipientName: '',
			sections: [
				{ tripTitle: 'Barcelona 2026', tripSlug: 'barcelona-2026', diff },
				{ tripTitle: 'Tokyo 2027', tripSlug: 'tokyo-2027', diff }
			],
			appUrl: 'https://app.vandenwarsen.com',
			testLabel: true
		};
		expect(core.renderDigestEmail(multi)).toEqual(tsRender(multi));
	});

	it('parseDigestState tolerates string / object / byte-array / junk shapes', () => {
		const snap = ts.snapshotItems(items);
		const json = JSON.stringify(snap);
		expect(core.parseDigestState(json)).toEqual(snap);
		expect(core.parseDigestState(JSON.parse(json))).toEqual(snap);
		const bytes = Array.from(json).map((c) => c.charCodeAt(0));
		expect(core.parseDigestState(bytes)).toEqual(snap);
		expect(core.parseDigestState('')).toBeNull();
		expect(core.parseDigestState(null)).toBeNull();
		expect(core.parseDigestState('not json')).toBeNull();
		expect(core.parseDigestState(42)).toBeNull();
	});
});
