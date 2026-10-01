import { describe, it, expect, beforeEach } from 'vitest';
import {
	__resetSheetHistory,
	markOrphanEntry,
	isOrphan,
	consumeOrphan,
	nextSheetId,
	shouldWalkOrphan,
	sheetOpened,
	sheetClosed,
	anySheetOpen,
	orphanCount,
	noteNavigation,
	currentNavEpoch
} from './sheet-history';

// The bookkeeping behind #365's back-swallowing. Each case here is a bug that
// was actually measured in a browser before this module existed — the comments
// name which one, so a future edit that "simplifies" a rule can see its cost.
describe('sheet-history', () => {
	beforeEach(() => __resetSheetHistory());

	describe('open-sheet accounting', () => {
		it('tracks nesting, and never goes negative', () => {
			expect(anySheetOpen()).toBe(false);
			sheetOpened();
			sheetOpened();
			expect(anySheetOpen()).toBe(true);
			sheetClosed();
			expect(anySheetOpen()).toBe(true); // outer sheet still up
			sheetClosed();
			expect(anySheetOpen()).toBe(false);
			sheetClosed(); // stray close must not drive the count below zero
			expect(anySheetOpen()).toBe(false);
		});
	});

	describe('orphan marking', () => {
		it('records an orphaned entry', () => {
			markOrphanEntry(1);
			expect(isOrphan(1)).toBe(true);
			expect(orphanCount()).toBe(1);
		});

		it('is idempotent — one entry must not queue two walks', () => {
			markOrphanEntry(1);
			markOrphanEntry(1);
			expect(orphanCount()).toBe(1);
		});

		it('ignores id 0 — the sentinel for "no entry"', () => {
			markOrphanEntry(0);
			expect(orphanCount()).toBe(0);
			expect(isOrphan(0)).toBe(false);
		});
	});

	describe('shouldWalkOrphan', () => {
		it('walks a known orphan when no sheet is open', () => {
			markOrphanEntry(1);
			expect(shouldWalkOrphan(1)).toBe(true);
		});

		it('does NOT walk while a sheet is open', () => {
			// An open sheet legitimately owns the current entry. Walking it there
			// would dismiss the sheet AND navigate — skipping a whole page.
			markOrphanEntry(1);
			sheetOpened();
			expect(shouldWalkOrphan(1)).toBe(false);
		});

		it('does not walk an entry that was never orphaned', () => {
			markOrphanEntry(2);
			expect(shouldWalkOrphan(1)).toBe(false);
		});

		it('does not walk the sentinel', () => {
			markOrphanEntry(1);
			expect(shouldWalkOrphan(0)).toBe(false);
		});
	});

	describe('single-walk guarantee', () => {
		it('an orphan is walked exactly once', () => {
			// Two owners can walk an orphan: the sheet itself when it survived the
			// close, the layout when it did not. Both check isOrphan first. When
			// they did not, BOTH fired and back skipped a page — measured as
			// AddSheet -> back landing on /trips, straight over /now.
			markOrphanEntry(1);
			expect(shouldWalkOrphan(1)).toBe(true);
			consumeOrphan(1);
			expect(shouldWalkOrphan(1)).toBe(false);
			expect(isOrphan(1)).toBe(false);
		});
	});

	describe('unique ids', () => {
		it('never reuses an id', () => {
			const ids = [nextSheetId(), nextSheetId(), nextSheetId()];
			expect(new Set(ids).size).toBe(3);
		});

		it('an orphan cannot be confused with a later sheet at the same DEPTH', () => {
			// The bug this replaced: orphans were keyed by nesting depth, which
			// repeats. Close a depth-1 sheet programmatically, open an unrelated
			// sheet later — also depth 1 — and the layout walked that NEW sheet's
			// live entry, deterministically breaking a trip-mode flow.
			const orphaned = nextSheetId();
			markOrphanEntry(orphaned);

			const laterSheetAtSameDepth = nextSheetId();
			expect(isOrphan(laterSheetAtSameDepth)).toBe(false);
			expect(shouldWalkOrphan(laterSheetAtSameDepth)).toBe(false);
			expect(shouldWalkOrphan(orphaned)).toBe(true);
		});
	});

	describe('nested sheets', () => {
		it('tracks each orphaned entry independently', () => {
			const a = nextSheetId();
			const b = nextSheetId();
			markOrphanEntry(a);
			markOrphanEntry(b);
			expect(orphanCount()).toBe(2);
			consumeOrphan(b);
			expect(isOrphan(a)).toBe(true);
			expect(isOrphan(b)).toBe(false);
		});
	});

	// #365 third failure. A sheet that closes programmatically keeps vestigial
	// state so it can walk its OWN entry when it survived the close without
	// navigating. That was guarded on `location.pathname` alone, which assumed a
	// navigation always unmounts the sheet. AppShell's AddSheet is never
	// unmounted by a route change, so the state survived, the pathname re-matched
	// when the user came BACK to that path, and the stale walk fired
	// `history.back()` into a live navigation and cancelled it — submit an item
	// and land back on the form. Measured: scripts/probe-365-skipdoor.mjs.
	describe('navigation epoch', () => {
		it('starts at zero and advances once per navigation', () => {
			expect(currentNavEpoch()).toBe(0);
			noteNavigation();
			noteNavigation();
			expect(currentNavEpoch()).toBe(2);
		});

		it('an epoch captured before a navigation no longer matches after one', () => {
			const captured = currentNavEpoch();
			expect(currentNavEpoch()).toBe(captured); // same navigation: sheet may walk
			noteNavigation();
			expect(currentNavEpoch()).not.toBe(captured); // stale: the layout owns it
		});

		it('does NOT advance when no navigation happens (the enhance-success case)', () => {
			const captured = currentNavEpoch();
			markOrphanEntry(1);
			consumeOrphan(1);
			expect(currentNavEpoch()).toBe(captured);
		});

		it('is reset by the test seam so cases cannot leak into each other', () => {
			noteNavigation();
			__resetSheetHistory();
			expect(currentNavEpoch()).toBe(0);
		});
	});
});
