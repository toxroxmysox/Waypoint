<script lang="ts">
	import { VOTE_OPTIONS, type VoteValue } from '$lib/collaboration/voting';
	import { VOTE_META } from './vote-meta';

	// The four vote options as real buttons in a compass layout: Love N, Like E,
	// Pass W, Flexible S. This IS the keyboard/screen-reader path too — the whole
	// deck is usable with no gestures. Each button is >=56px tall (WCAG target).
	let {
		onvote,
		disabled = false
	}: {
		onvote: (v: VoteValue) => void;
		disabled?: boolean;
	} = $props();

	// grid cells keyed by option → compass position
	const POS: Record<VoteValue, string> = {
		love: 'col-start-2 row-start-1 justify-self-center',
		dislike: 'col-start-1 row-start-2 justify-self-end',
		like: 'col-start-3 row-start-2 justify-self-start',
		flexible: 'col-start-2 row-start-3 justify-self-center'
	};
</script>

<div
	class="grid items-center gap-2"
	style="grid-template-columns:1fr auto 1fr;grid-template-rows:auto auto auto;"
	role="group"
	aria-label="Cast your vote"
>
	{#each VOTE_OPTIONS as v (v)}
		{@const m = VOTE_META[v]}
		<button
			type="button"
			{disabled}
			onclick={() => onvote(v)}
			aria-label="{m.label} — {m.dir}"
			class="inline-flex min-h-[56px] min-w-[64px] flex-col items-center justify-center gap-0.5 rounded-[13px] border-[1.5px] text-[13px] font-bold shadow-card transition-transform active:scale-95 disabled:opacity-50 {m.btn} {POS[
				v
			]}"
		>
			<span aria-hidden="true" class="text-[17px] leading-none">{m.glyph}</span>
			{m.label}
		</button>
	{/each}
	<!-- still center: the brand star sits behind the rose -->
	<span
		aria-hidden="true"
		class="text-moss-soft col-start-2 row-start-2 flex h-[30px] w-[30px] items-center justify-center"
	>
		<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5">
			<path d="M12 2 L13.6 10.4 L22 12 L13.6 13.6 L12 22 L10.4 13.6 L2 12 L10.4 10.4 Z" />
		</svg>
	</span>
</div>
