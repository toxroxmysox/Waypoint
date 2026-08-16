/**
 * Ownership of the history entries BottomSheet pushes (#365).
 *
 * The locked decision is that an open sheet swallows back/edge-swipe. That is
 * implemented by pushing a shallow-routing entry when a sheet opens, so the
 * back gesture pops the sheet instead of the page.
 *
 * WHY THIS IS A MODULE AND NOT COMPONENT STATE — the reason two earlier
 * attempts failed:
 *
 * A sheet very often closes itself as PART OF AN ACTION. `AddSheet` does
 * `open = false; goto(...)`; sheet forms close inside `use:enhance` and then
 * `await update()`. Two things follow, pulling in opposite directions:
 *
 *   1. The sheet CANNOT pop its own entry then. A pop racing an in-flight
 *      navigation or `load` lets the popstate win, and the just-saved record
 *      disappears from the page — silent data loss. (Attempt 1.)
 *   2. The sheet ALSO cannot remember the entry it left behind, because that
 *      navigation UNMOUNTS it. By the time the user backs onto the orphaned
 *      entry no component exists to clean it up, so the press lands on a dead
 *      entry and nothing happens — the #235 dead tap. (Attempt 2, measured:
 *      AddSheet -> pick item -> back -> back, second press did nothing.)
 *
 * So the bookkeeping outlives both the sheet and the navigation. It lives here,
 * and the ROOT LAYOUT — which outlives every route — walks the orphans.
 *
 * ENTRIES ARE IDENTIFIED BY A UNIQUE ID, NOT BY DEPTH. `page.state.sheet` is a
 * nesting depth, so it repeats: close a sheet at depth 1 programmatically, open
 * an unrelated sheet later, and it is depth 1 again. Keying orphans by depth
 * made the layout walk that NEW sheet's live entry, which deterministically
 * broke an unrelated trip-mode spec. Every pushed entry now carries its own
 * `sheetId`, so an orphan can only ever match the exact entry that was orphaned.
 */

/** Ids of entries whose sheet closed without popping them. */
let orphanIds: number[] = [];

/** How many sheets are currently open and owning a history entry. */
let openSheets = 0;

/** Monotonic — never reused within a session, which is the whole point. */
let nextId = 1;

/** Test seam — resets module state between unit tests. */
export function __resetSheetHistory(): void {
	orphanIds = [];
	openSheets = 0;
	nextId = 1;
}

/** A fresh, never-reused identity for one pushed history entry. */
export function nextSheetId(): number {
	return nextId++;
}

export function sheetOpened(): void {
	openSheets += 1;
}

export function sheetClosed(): void {
	openSheets = Math.max(0, openSheets - 1);
}

export function anySheetOpen(): boolean {
	return openSheets > 0;
}

/**
 * Record that this entry outlived its sheet — a programmatic close.
 * Idempotent: re-marking must not queue two walks for one entry.
 */
export function markOrphanEntry(id: number): void {
	if (id > 0 && !orphanIds.includes(id)) orphanIds.push(id);
}

/**
 * Is this entry still an un-walked orphan?
 *
 * Two owners can walk one — the sheet itself when it survived the close, the
 * layout when it did not — and which applies is not knowable in advance. Both
 * check HERE first, so this module is the single source of truth and an entry is
 * walked exactly once. When they did not, BOTH fired and back skipped a whole
 * page (measured: AddSheet -> back landed on /trips, straight over /now).
 */
export function isOrphan(id: number): boolean {
	return id > 0 && orphanIds.includes(id);
}

/**
 * Should landing on this entry be walked past?
 *
 * Only when NO sheet is open: an open sheet legitimately owns the current entry,
 * and walking there would dismiss the sheet AND navigate, skipping a page.
 */
export function shouldWalkOrphan(id: number): boolean {
	if (openSheets > 0) return false;
	return isOrphan(id);
}

/** One-shot: an orphan is walked once, then forgotten. */
export function consumeOrphan(id: number): void {
	orphanIds = orphanIds.filter((x) => x !== id);
}

/**
 * Did the current entry become current because the user went BACK?
 *
 * Walking an orphan is only ever correct in response to a back press: the walk
 * exists because that press landed on a dead entry and appeared to do nothing,
 * so it finishes what the user asked for. Firing it on a FORWARD navigation
 * instead drags them backwards out of a page they just asked to open.
 *
 * Without this gate the walk ran on any state change that matched an orphan,
 * which deterministically broke an unrelated trip-mode flow (skip an item →
 * ideas strip → promote it back) while every direct dismissal path still looked
 * clean. Measured: that spec passes before the walk existed and fails after.
 *
 * One-shot — a single back press authorises at most one walk.
 */
let cameFromPopstate = false;

export function notePopstate(): void {
	cameFromPopstate = true;
}

export function consumePopstate(): boolean {
	const was = cameFromPopstate;
	cameFromPopstate = false;
	return was;
}

/** Diagnostics for tests. */
export function orphanCount(): number {
	return orphanIds.length;
}
