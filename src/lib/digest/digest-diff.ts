// #272 — Email Digest Phase 1: pure diff composer.
//
// Framework-free (mirrors src/lib/itinerary/phase-tiling.ts). Compares a
// stored per-trip snapshot (trips.digest_state) against the trip's current
// items and produces the structured items-only diff the digest email renders:
// added / edited / moved / removed.
//
// Why snapshot-vs-current instead of an `updated > last_digest_at` window:
//   - MOVED vs EDITED requires knowing the item's previous day/status — no
//     field history exists, so the previous state must be snapshotted.
//   - REMOVED is invisible to a window query (the record is gone), and no
//     notification event records item deletes (notifications.pb.js covers
//     suggestion_added / comment_added / member_joined only). The snapshot
//     lifts that cap without an event log.
//   - Sort-order/rank churn bumps `updated` but is cosmetic; the content
//     signature makes it invisible to the diff (no noise emails).
//
// DUPLICATION NOTE: backend/pb_hooks/digest-core.js carries a line-for-line
// JS port of this module (PB's goja sandbox cannot import TS/ESM from
// src/lib). digest-diff.test.ts runs the same vectors against BOTH copies —
// change them together.

/** One item, normalized by the caller (day relation already resolved to its date). */
export interface DigestSourceItem {
	id: string;
	title: string;
	/** 'YYYY-MM-DD' of the owning day, or '' for unscheduled (ideas / parking lot). */
	dayDate: string;
	/** unplanned | planned | done | considered ('' tolerated). */
	status: string;
	/** Content signature from buildSignature(). */
	signature: string;
}

/** Compact per-item state stored in trips.digest_state. */
export interface DigestItemState {
	t: string; // title
	d: string; // dayDate ('' = unscheduled)
	s: string; // status
	g: string; // content signature
}

export type DigestSnapshot = Record<string, DigestItemState>;

export interface DigestAdded {
	title: string;
	dayDate: string; // '' = added to ideas
}

export interface DigestEdited {
	title: string;
	dayDate: string;
	/** Present when the title itself changed. */
	renamedFrom?: string;
	/** Present when only the status changed place-lessly (e.g. checked off as done). */
	statusChange?: { from: string; to: string };
}

export interface DigestMoved {
	title: string;
	fromDay: string; // '' = was in ideas
	toDay: string; // '' = now in ideas
}

export interface DigestRemoved {
	title: string;
}

export interface TripDiff {
	added: DigestAdded[];
	edited: DigestEdited[];
	moved: DigestMoved[];
	removed: DigestRemoved[];
}

/**
 * Content signature over the fields whose change should surface as "edited".
 * Deliberately excludes sort_order/rank (drag churn) and anything the
 * snapshot already tracks (title/day/status). Description contributes only
 * its length — enough to notice a change without storing 5000 chars.
 */
export function buildSignature(fields: {
	type?: string;
	start_time?: string;
	end_time?: string;
	end_date?: string;
	location_name?: string;
	description?: string;
	cost_estimate_usd?: number | null;
	booked?: boolean;
}): string {
	return [
		fields.type ?? '',
		fields.start_time ?? '',
		fields.end_time ?? '',
		fields.end_date ?? '',
		fields.location_name ?? '',
		String((fields.description ?? '').length),
		String(fields.cost_estimate_usd ?? 0),
		fields.booked ? '1' : '0'
	].join('|');
}

/** Build the snapshot to persist after a digest run. */
export function snapshotItems(items: DigestSourceItem[]): DigestSnapshot {
	const snap: DigestSnapshot = {};
	for (const item of items) {
		snap[item.id] = { t: item.title, d: item.dayDate, s: item.status, g: item.signature };
	}
	return snap;
}

/**
 * Diff a previous snapshot against the current items.
 *
 * Categorization (one category per item, moved wins over edited):
 *   added   — id absent from the snapshot
 *   removed — id present in the snapshot, absent now
 *   moved   — dayDate changed (day→day, ideas→day, day→ideas)
 *   edited  — same place, but title / status / content signature changed
 *
 * Pure churn (only `updated` bumped, e.g. reorders) produces no entry.
 */
export function composeTripDiff(prev: DigestSnapshot, items: DigestSourceItem[]): TripDiff {
	const diff: TripDiff = { added: [], edited: [], moved: [], removed: [] };
	const seen = new Set<string>();

	for (const item of items) {
		seen.add(item.id);
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
			const entry: DigestEdited = { title: item.title, dayDate: item.dayDate };
			if (renamed) entry.renamedFrom = before.t;
			if (statusChanged && !renamed && !contentChanged) {
				entry.statusChange = { from: before.s, to: item.status };
			}
			diff.edited.push(entry);
		}
	}

	for (const id of Object.keys(prev)) {
		if (!seen.has(id)) diff.removed.push({ title: prev[id].t });
	}

	// Stable, readable ordering: scheduled first (by day), ideas last, ties by title.
	const byDayThenTitle = (a: { dayDate: string; title: string }, b: { dayDate: string; title: string }) => {
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

/** True when the diff carries anything worth emailing. */
export function hasChanges(diff: TripDiff): boolean {
	return (
		diff.added.length > 0 ||
		diff.edited.length > 0 ||
		diff.moved.length > 0 ||
		diff.removed.length > 0
	);
}
