<script lang="ts">
	import Button from '$lib/ui/Button.svelte';

	// Shared anchored Save bar for the item create/edit forms (#344/#345).
	// Extracted from items/new + items/[itemId]/edit, which carried byte-identical
	// copies of this markup, focus logic, and CSS — a divergence trap (#344 was a
	// bug that had to be fixed in two places).
	let { loading = false, label }: { loading?: boolean; label: string } = $props();

	// #236: the sticky bar collapses its BottomNav-clearance when a soft keyboard is
	// open (BottomNav unmounts on focus, so the fixed 5rem clearance would leave the
	// bar floating mid-viewport and jittering). #344: only treat a focus as
	// "keyboard open" when the focused control actually raises a soft keyboard —
	// a checkbox / radio / button / file / range / color <input> does NOT, so
	// focusing "requires booking" must never hide the Create button.
	const NON_KEYBOARD_INPUT_TYPES = new Set([
		'checkbox',
		'radio',
		'button',
		'submit',
		'reset',
		'file',
		'range',
		'color'
	]);

	let inputFocused = $state(false);
	function handleFocusIn(e: FocusEvent) {
		const el = e.target as HTMLElement | null;
		if (!el) return;
		const tag = el.tagName;
		// <select> DOES raise a soft keyboard / iOS wheel that can cover the bar → hide.
		if (tag === 'TEXTAREA' || tag === 'SELECT') {
			inputFocused = true;
		} else if (tag === 'INPUT') {
			inputFocused = !NON_KEYBOARD_INPUT_TYPES.has((el as HTMLInputElement).type);
		}
	}
	function handleFocusOut() {
		inputFocused = false;
	}
</script>

<svelte:window onfocusin={handleFocusIn} onfocusout={handleFocusOut} />

<div
	class="save-bar fixed inset-x-0 bottom-0 z-sticky mx-auto w-full max-w-lg md-desktop:max-w-2xl md-desktop:left-[72px] lg-desktop:left-[240px] lg-desktop:right-[320px] bg-paper px-4"
	class:save-bar--keyboard={inputFocused}
>
	<Button type="submit" disabled={loading} {loading} variant="moss" size="lg" class="w-full">
		{label}
	</Button>
</div>

<style>
	/* #236: anchored Save bar. position:fixed at the viewport bottom so the Save button
	   stays reachable while scrolling and never rests mid-page (no "stranded too high"
	   dead space). Opaque bg-paper covers content behind it; padding-bottom clears the
	   BottomNav (present only <900px — the desktop layout uses a SideRail instead).

	   #345: the bar is centered to the FORM COLUMN, not the viewport. AppShell offsets
	   the content column by the nav/context rails (md-desktop ml-72; lg-desktop
	   ml-240 / mr-320). Because the bar is `fixed` it escapes that column, so it carries
	   the SAME insets (left-72 at md-desktop; left-240 / right-320 at lg-desktop) and
	   mx-auto then centers it within the column — matching <main>. Mobile base stays
	   inset-x-0 (no rails).

	   #344: hide the bar for a soft keyboard ONLY on coarse-pointer (touch) devices.
	   Viewport width was a proxy for "touch" and wrongly hid the bar in a narrow
	   desktop window (Arc splitview) where focusing a checkbox raised no keyboard.
	   The consumer's .save-bar-spacer reserves matching scroll room. */
	.save-bar {
		padding-top: 0.75rem;
		padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 5rem);
	}
	@media (pointer: coarse) {
		.save-bar.save-bar--keyboard {
			display: none;
		}
	}
	/* No BottomNav to clear on the desktop layout (>=900px) → small pad only. */
	@media (min-width: 900px) {
		.save-bar {
			padding-bottom: 0.75rem;
		}
	}
</style>
