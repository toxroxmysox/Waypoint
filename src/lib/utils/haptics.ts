// Centralized haptic feedback. Feature-detected, never throws, silent no-op
// where unsupported. One module, one entry point — do NOT call navigator.vibrate
// directly elsewhere.
//
// ── DEVICE SUPPORT (verified 2026-06-11, see handoff-issue95.md) ──────────────
//   Android Chrome / Firefox (browser + installed PWA): navigator.vibrate fires.
//   Desktop browsers: API may exist but no vibration hardware → silent no-op.
//   iOS Safari / installed PWA  ← Waypoint's PRIMARY device:  NOT SUPPORTED.
//     WebKit exposes no Vibration API at all; navigator.vibrate is undefined, so
//     every call here cleanly no-ops on iPhone. The `<input type="checkbox"
//     switch>` label-click trick produced haptics on iOS 17.4–26.4, but Apple
//     patched it in iOS 26.5 — it no longer fires programmatically. We do NOT
//     ship that hack: it's fragile, undocumented, and already dead on current
//     iOS. No fake feedback. See the handoff for the full verdict.

// Named patterns keep call sites semantic, not magic-number-y. Values are ms (or
// vibrate/pause arrays). Tuned light — haptics should punctuate, not buzz.
const PATTERNS = {
	/** A committed choice — e.g. a cast vote on the swipe deck. */
	commit: 10,
	/** A completed flow — double-pulse. */
	success: [12, 40, 18],
	/** A reversible undo — fainter than commit. */
	rewind: 7
} as const satisfies Record<string, number | number[]>;

export type Haptic = keyof typeof PATTERNS;

// Lazy check: client and server are separate bundles, but compute on call so a
// module first imported during SSR can never cache a stale `false`.
function supported(): boolean {
	return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/**
 * Fire a haptic pulse if the device supports it. No-ops silently otherwise
 * (notably on all iOS). Never throws — a haptic must never break a UI action.
 */
export function haptic(kind: Haptic = 'commit'): void {
	if (!supported()) return;
	try {
		navigator.vibrate(PATTERNS[kind]);
	} catch {
		// vibrate can throw under some policies (e.g. backgrounded) — swallow.
	}
}
