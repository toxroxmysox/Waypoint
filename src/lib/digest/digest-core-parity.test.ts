// #272 — parity harness: backend/pb_hooks/digest-core.js is a line-for-line
// JS port of digest-diff.ts + digest-email.ts (PB's goja sandbox can't import
// src/lib). This suite proves the two copies agree, so the Vitest coverage of
// the canonical TS module transfers to the hook copy.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tripHour, tripTz } from '../shell/trip-time';
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

// --- #339: trip-local hour parity (Intl vs goja) ----------------------------
//
// SCOPE, honestly stated: Node has no goja, so this cannot exercise PB's Go
// timezone database. What it DOES pin is (a) the derivation LOGIC — that
// tripLocalHour routes through the zone rather than reading a UTC hour, and
// (b) the FALLBACK semantics, which is where the two engines genuinely
// disagree (Go's LoadLocation accepts "" and "Local"; Intl accepts neither).
// The Timezone shim below deliberately models GO's acceptance rules, not
// Intl's, so deleting the guard in tripLocalHour turns these tests red.
//
// The hour itself is derived through formatToParts/h23 — independent of
// tripNow()'s sv-SE string parse — so a divergence between the two Intl
// paths (e.g. the midnight "24" vs "00" quirk) also surfaces here.

// A zone that is obviously not UTC, standing in for the server's own zone so
// a "Local" leak is visible as a wrong hour rather than a coincidental match.
const PRETEND_SERVER_ZONE = 'Pacific/Kiritimati'; // UTC+14, no DST

class GojaTimezoneShim {
	readonly id: string;
	constructor(id: string) {
		// Models Go time.LoadLocation, NOT Intl.
		if (id === '') {
			this.id = 'UTC';
			return;
		}
		if (id === 'Local') {
			this.id = PRETEND_SERVER_ZONE;
			return;
		}
		try {
			new Intl.DateTimeFormat('en-US', { timeZone: id });
		} catch {
			throw new Error('unknown time zone ' + id);
		}
		this.id = id;
	}
}

function hourIn(instant: Date, zone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: zone,
		hour: 'numeric',
		hourCycle: 'h23'
	}).formatToParts(instant);
	return Number(parts.find((p) => p.type === 'hour')!.value);
}

// Stands in for PB's `new DateTime()` -> .time() -> .in(tz) -> .hour() chain.
function goTime(instant: Date, zone: string) {
	return {
		hour: () => hourIn(instant, zone),
		in: (tz: GojaTimezoneShim) => goTime(instant, tz.id)
	};
}
const gojaNow = (instant: Date) => ({ time: () => goTime(instant, 'UTC') });

describe('#339 trip-local hour parity: digest-core.js vs trip-time.ts', () => {
	beforeEach(() => {
		(globalThis as { Timezone?: unknown }).Timezone = GojaTimezoneShim;
	});
	afterEach(() => {
		delete (globalThis as { Timezone?: unknown }).Timezone;
	});

	// US DST 2026: spring forward Mar 8 (02:00->03:00), fall back Nov 1.
	// EU DST 2026: forward Mar 29, back Oct 25.
	const cases: Array<[string, string, string]> = [
		['spring-forward, hour before', 'America/Detroit', '2026-03-08T06:59:00Z'],
		['spring-forward, the skipped hour', 'America/Detroit', '2026-03-08T07:00:00Z'],
		['spring-forward, hour after', 'America/Detroit', '2026-03-08T08:30:00Z'],
		['fall-back, first pass through 01:xx', 'America/Detroit', '2026-11-01T05:30:00Z'],
		['fall-back, repeated 01:xx', 'America/Detroit', '2026-11-01T06:30:00Z'],
		['fall-back, hour after', 'America/Detroit', '2026-11-01T07:30:00Z'],
		['EU spring-forward', 'Europe/Paris', '2026-03-29T01:00:00Z'],
		['EU fall-back', 'Europe/Paris', '2026-10-25T01:00:00Z'],
		['ahead of UTC, no DST', 'Asia/Tokyo', '2026-06-05T12:00:00Z'],
		// Tokyo is UTC+9: 15:10Z is already the NEXT calendar day locally.
		['ahead of UTC, past local midnight', 'Asia/Tokyo', '2026-06-05T15:10:00Z'],
		['ahead of UTC, exactly local midnight', 'Asia/Tokyo', '2026-06-05T15:00:00Z'],
		['half-hour offset zone', 'Asia/Kolkata', '2026-06-05T18:45:00Z'],
		['45-minute offset zone', 'Asia/Kathmandu', '2026-06-05T18:15:00Z'],
		['behind UTC, before local midnight', 'America/Los_Angeles', '2026-06-05T06:30:00Z'],
		['UTC itself', 'UTC', '2026-06-05T00:00:00Z']
	];

	for (const [label, tz, iso] of cases) {
		it(`agrees on the local hour — ${label} (${tz})`, () => {
			const instant = new Date(iso);
			expect(core.tripLocalHour(gojaNow(instant), tz)).toBe(tripHour(tz, instant));
		});
	}

	it('the 8am digest window opens on the same instant in both engines', () => {
		// Walk a full DST-transition day in 15-min steps and compare the
		// "is it the 8 o'clock hour locally?" decision the digest actually makes.
		const tz = 'America/Detroit';
		let hits = 0;
		for (let m = 0; m < 24 * 60; m += 15) {
			const instant = new Date(Date.UTC(2026, 2, 8, 0, m));
			const gojaSends = core.tripLocalHour(gojaNow(instant), tz) === 8;
			const tsSends = tripHour(tz, instant) === 8;
			expect(gojaSends).toBe(tsSends);
			if (tsSends) hits++;
		}
		// Sanity: the window genuinely occurred (guards a vacuously-true loop).
		expect(hits).toBeGreaterThan(0);
	});

	it('falls back to UTC exactly where tripTz() does', () => {
		const instant = new Date('2026-06-05T23:30:00Z');
		const utcHour = instant.getUTCHours();

		for (const bad of ['', '   ', 'Chengdu', 'not/a/zone', 'Etc/Nowhere']) {
			expect(core.tripLocalHour(gojaNow(instant), bad)).toBe(utcHour);
			// ...and the TS side agrees, because tripTz() maps it to UTC.
			expect(tripHour(tripTz({ timezone: bad }), instant)).toBe(utcHour);
		}
	});

	it('rejects "Local" instead of leaking the server zone (the Go/Intl gap)', () => {
		const instant = new Date('2026-06-05T23:30:00Z');
		// Go would resolve "Local" to the server zone (+14 here => hour 13 on
		// the NEXT day); Intl rejects it, so tripTz() gives UTC.
		expect(hourIn(instant, PRETEND_SERVER_ZONE)).not.toBe(instant.getUTCHours());
		expect(core.tripLocalHour(gojaNow(instant), 'Local')).toBe(instant.getUTCHours());
		expect(tripHour(tripTz({ timezone: 'Local' }), instant)).toBe(instant.getUTCHours());
	});

	it('tolerates surrounding whitespace on a stored zone', () => {
		const instant = new Date('2026-06-05T12:00:00Z');
		expect(core.tripLocalHour(gojaNow(instant), '  Asia/Tokyo  ')).toBe(
			tripHour('Asia/Tokyo', instant)
		);
	});
});
