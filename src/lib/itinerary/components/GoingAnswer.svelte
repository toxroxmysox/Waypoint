<script lang="ts">
	// "Are you going?" (#440; CARD_SYSTEM D6). The Hero's own-answer control, mounted
	// in Hero's `goingControl` slot. Unanswered it asks with Going / Not going; once
	// answered it reads "You're going · change" (or "not going") and `change` reveals
	// the two choices again. Neutral ink, never colour (D10). The caller owns the
	// write (optimistic fetch) and renders this only when `goingView.canAnswer`.
	import type { GoingState } from '$lib/itinerary/assignment';

	let {
		line,
		mine,
		pending = false,
		failed = false,
		onanswer
	}: {
		/** `Are you going?` / `You're going` / `You're not going` (goingView.line). */
		line: string;
		mine: GoingState;
		pending?: boolean;
		/** The last write failed and was rolled back. */
		failed?: boolean;
		onanswer: (state: 'going' | 'not_going') => void;
	} = $props();

	let changing = $state(false);
	const answered = $derived(mine !== 'no_answer');
	const choosing = $derived(!answered || changing);

	function pick(state: 'going' | 'not_going') {
		changing = false;
		if (state !== mine) onanswer(state);
	}

	const choice =
		'inline-flex min-h-11 min-w-24 items-center justify-center rounded-[10px] border px-4 text-sm font-semibold disabled:opacity-60';
	const on = 'bg-ink text-paper border-ink';
	const off = 'border-line text-ink bg-surface hover:border-ink-muted active:border-ink-muted';
</script>

<div class="pointer-events-auto relative z-10 space-y-2" data-testid="going-answer">
	<p class="text-ink flex items-center gap-1 text-sm font-semibold" data-testid="going-line">
		<span>{line}</span>
		{#if answered}
			<span class="text-ink-muted font-normal">·</span>
			<button
				type="button"
				class="text-ink-soft hover:text-ink active:text-ink -my-3 inline-flex min-h-11 items-center px-1 text-sm font-medium underline underline-offset-2"
				aria-expanded={changing}
				onclick={() => (changing = !changing)}
			>
				change
			</button>
		{/if}
	</p>
	{#if choosing}
		<div class="flex gap-2" role="group" aria-label="Are you going?">
			<button
				type="button"
				class="{choice} {mine === 'going' ? on : off}"
				aria-pressed={mine === 'going'}
				disabled={pending}
				onclick={() => pick('going')}
			>
				Going
			</button>
			<button
				type="button"
				class="{choice} {mine === 'not_going' ? on : off}"
				aria-pressed={mine === 'not_going'}
				disabled={pending}
				onclick={() => pick('not_going')}
			>
				Not going
			</button>
		</div>
	{/if}
	{#if failed}
		<p class="text-clay text-xs font-medium" role="alert">Couldn't save your answer. Try again.</p>
	{/if}
</div>
