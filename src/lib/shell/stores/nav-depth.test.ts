import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { canGoBack, updateNavDepth, markReplaceNavigation } from './nav-depth';

// The store keeps module-level depth + a one-shot replace flag. `enter` resets
// both to a clean slate, so every test starts from a cold load. (#214 / #235)
beforeEach(() => {
	updateNavDepth('enter');
});

describe('nav-depth: base counting (#214)', () => {
	it('cold load (enter) has no back', () => {
		expect(get(canGoBack)).toBe(false);
	});

	it('a forward navigation (link/goto/form) makes back available', () => {
		updateNavDepth('link');
		expect(get(canGoBack)).toBe(true);
	});

	it('popstate decrements and clamps at zero', () => {
		updateNavDepth('link'); // depth 1
		updateNavDepth('goto'); // depth 2
		updateNavDepth('popstate', -1); // depth 1
		expect(get(canGoBack)).toBe(true);
		updateNavDepth('popstate', -1); // depth 0
		expect(get(canGoBack)).toBe(false);
		updateNavDepth('popstate', -1); // clamped, stays 0
		expect(get(canGoBack)).toBe(false);
	});

	it('applies a multi-step popstate delta', () => {
		updateNavDepth('link'); // 1
		updateNavDepth('goto'); // 2
		updateNavDepth('goto'); // 3
		updateNavDepth('popstate', -2); // 1
		expect(get(canGoBack)).toBe(true);
		updateNavDepth('popstate', -1); // 0
		expect(get(canGoBack)).toBe(false);
	});
});

describe('nav-depth: replaceState saves do NOT inflate depth (#235)', () => {
	it('a flagged replace navigation adds no depth', () => {
		// enter → land somewhere (1) → open edit (2)
		updateNavDepth('link'); // detail, depth 1
		updateNavDepth('goto'); // edit, depth 2

		// Save with replaceState: announce it, then the save navigation arrives as
		// a `goto` in afterNavigate. It must NOT increment (replace adds no entry).
		markReplaceNavigation();
		updateNavDepth('goto'); // replace edit → detail; depth stays 2

		// One back returns to the pre-edit screen (still > 0), not a no-op.
		updateNavDepth('popstate', -1); // depth 1
		expect(get(canGoBack)).toBe(true);
		updateNavDepth('popstate', -1); // depth 0 — now at the entry the chain started on
		expect(get(canGoBack)).toBe(false);
	});

	it('regression: WITHOUT the flag the same save overcounts by one', () => {
		// This is the buggy path the fix removes — a plain goto for the save.
		updateNavDepth('link'); // detail, depth 1
		updateNavDepth('goto'); // edit, depth 2
		updateNavDepth('goto'); // UNFLAGGED save → depth 3 (the overcount)

		// Pop the replaced entry + the edit entry that shouldn't have been there:
		updateNavDepth('popstate', -1); // 2
		updateNavDepth('popstate', -1); // 1
		// Still reports a phantom back — the symptom (#235): back fires but the
		// extra count means the prior history.back() landed on the duplicate.
		expect(get(canGoBack)).toBe(true);
	});

	it('the replace flag is one-shot — a later normal goto still counts', () => {
		updateNavDepth('goto'); // depth 1
		markReplaceNavigation();
		updateNavDepth('goto'); // replace, depth stays 1
		updateNavDepth('goto'); // a real push afterwards, depth 2
		updateNavDepth('popstate', -1); // 1
		expect(get(canGoBack)).toBe(true);
		updateNavDepth('popstate', -1); // 0
		expect(get(canGoBack)).toBe(false);
	});

	it('only forward types consume the flag — a stray enter clears it without miscounting', () => {
		markReplaceNavigation();
		updateNavDepth('enter'); // cold load also resets the flag
		updateNavDepth('goto'); // a normal push must still count
		expect(get(canGoBack)).toBe(true);
	});

	it('a pending replace is not swallowed by an intervening popstate', () => {
		updateNavDepth('goto'); // depth 1
		markReplaceNavigation();
		updateNavDepth('popstate', -1); // a popstate must NOT consume the replace flag → depth 0
		expect(get(canGoBack)).toBe(false);
		updateNavDepth('goto'); // THIS is the flagged replace → still must not count
		expect(get(canGoBack)).toBe(false);
	});
});
