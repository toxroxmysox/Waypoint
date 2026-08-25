<script lang="ts">
	// #367 — the in-app replacement for `confirm('You have unsaved changes...')`.
	//
	// In the installed PWA a native confirm renders the browser's own dialog —
	// "app.vandenwarsen.com says…" — which is the most un-app-like surface iOS can
	// put on screen, and it lands mid-flow on a form someone is actively editing.
	//
	// THE SHAPE OF THE PROBLEM: `beforeNavigate` gives you one synchronous moment
	// to decide, and an in-app dialog is asynchronous by nature. So the flow
	// inverts — cancel UNCONDITIONALLY while dirty, remember where they were
	// going, ask, and then re-run the navigation with `goto(to.url)` if they say
	// leave. Anything that reads as "await the answer inside beforeNavigate" is
	// impossible, not merely awkward.
	//
	// Shared because both item forms need it and a second copy is a second place
	// for the bypass flag to be forgotten — which would silently re-cancel the
	// user's own "leave" and strand them on the page.
	import { beforeNavigate, goto } from '$app/navigation';
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import Button from '$lib/ui/Button.svelte';

	let {
		dirty = false,
		title = 'Leave without saving?',
		body = 'Your changes to this item have not been saved yet.',
		leaveLabel = 'Leave'
	}: {
		/** True while the form holds unsaved edits. */
		dirty?: boolean;
		title?: string;
		body?: string;
		leaveLabel?: string;
	} = $props();

	let asking = $state(false);
	let pendingUrl: URL | null = null;
	// Set for exactly one navigation: the one WE re-run after the user chooses to
	// leave. Without it beforeNavigate fires again on that goto and cancels it,
	// and the answer to the question would do nothing at all.
	let leaving = false;

	beforeNavigate((nav) => {
		if (leaving) {
			leaving = false;
			return;
		}
		if (!dirty) return;
		// `leave` = the browser is unloading the tab. It cannot be cancelled in
		// favour of an in-app dialog; the beforeunload handler below owns that.
		if (nav.type === 'leave') return;
		if (!nav.to?.url) return;

		nav.cancel();
		pendingUrl = nav.to.url;
		asking = true;
	});

	// Closing/reloading the tab is the one case the browser keeps for itself.
	$effect(() => {
		if (!dirty) return;
		const handler = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});

	function leave() {
		const url = pendingUrl;
		pendingUrl = null;
		if (!url) {
			asking = false;
			return;
		}
		leaving = true;
		// The sheet is left OPEN on purpose: this navigation unmounts the page, and
		// tearing the sheet down first would only add a frame of empty form. It
		// goes with the page.
		goto(url);
	}

	function stay() {
		pendingUrl = null;
		asking = false;
	}
</script>

<!--
	swallowBack={false}: this sheet exists BECAUSE a navigation was intercepted —
	possibly a back press. Pushing its own history entry here would mean unwinding
	that entry while simultaneously re-running the interrupted navigation.
-->
<BottomSheet bind:open={asking} {title} swallowBack={false}>
	<div class="space-y-4">
		<p class="text-ink-soft text-sm">{body}</p>
		<!--
			Keeping the work is the primary button and the destructive one is the
			marked-but-quieter option, matching how the app renders every other
			destructive choice (settings delete, DocumentRow delete).
		-->
		<div class="flex flex-col gap-2">
			<Button variant="primary" size="md" class="w-full" onclick={stay}>Keep editing</Button>
			<!--
				A plain button, not <Button variant="ghost" class="text-error">: both
				emit a `text-*` utility and Tailwind orders its own output, so the
				variant's `text-ink` wins and the destructive action renders as ordinary
				ink. This is the same shape the item-form delete uses.
			-->
			<button
				type="button"
				class="hit-44 border-error/40 text-error hover:bg-error/10 active:bg-error/10 w-full rounded-md border px-4 py-2 text-sm font-semibold transition-colors"
				onclick={leave}
			>
				{leaveLabel}
			</button>
		</div>
	</div>
</BottomSheet>
