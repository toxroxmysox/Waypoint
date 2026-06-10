<script lang="ts" generics="C extends { id: string }">
	import type { Snippet } from 'svelte';
	import type { Vote, TripMember } from '$lib/types';
	import { type VoteValue } from '$lib/collaboration/voting';
	import { voteFromIntent, COMMIT_PX } from '$lib/collaboration/swipe-deck';
	import { VOTE_META } from './vote-meta';
	import RadialProgress from './RadialProgress.svelte';
	import CompassRose from './CompassRose.svelte';
	import FlyingCard from './FlyingCard.svelte';
	import VoteStacks from '$lib/collaboration/components/VoteStacks.svelte';
	import BottomSheet from '$lib/ui/BottomSheet.svelte';

	// The shared SwipeDeck engine. One feature dresses it via the `face` snippet;
	// the engine owns interaction (drag physics, keyboard, motions, a11y).
	let {
		cards,
		othersByCard = {},
		members = [],
		initialPeek = false,
		buttonsOnly = false,
		detailLayout = 'sheet',
		autoFocus = false,
		showKeys = false,
		title = 'Swipe',
		subtitle = '',
		kindOf,
		onvote,
		onrewind,
		onrewindPrompt,
		onclose,
		face,
		promptControls,
		detail,
		complete
	}: {
		cards: C[];
		othersByCard?: Record<string, Vote[]>;
		members?: TripMember[];
		initialPeek?: boolean;
		buttonsOnly?: boolean;
		detailLayout?: 'sheet' | 'modal';
		autoFocus?: boolean;
		showKeys?: boolean;
		title?: string;
		subtitle?: string;
		/**
		 * Per-card kind. Defaults all cards to 'vote' (the harvest deck). The capture
		 * wizard interleaves 'prompt' cards: no drag/vote, advance via promptControls.
		 */
		kindOf?: (card: C) => 'vote' | 'prompt';
		onvote?: (card: C, value: VoteValue) => void;
		onrewind?: (card: C) => void;
		/** Rewinding back onto a prompt card — lets the consumer undo its goals. */
		onrewindPrompt?: (card: C) => void;
		onclose?: () => void;
		face: Snippet<[C]>;
		/** Controls for a prompt card (replaces the compass rose); `advance` moves on. */
		promptControls?: Snippet<[C, { advance: () => void }]>;
		detail?: Snippet<[C, { vote: (v: VoteValue) => void }]>;
		complete?: Snippet<
			[{ spread: Record<VoteValue, number>; rated: number; total: number; reset: () => void }]
		>;
	} = $props();

	// ── reactive UI state ────────────────────────────────────────────────
	let idx = $state(0);
	let drag = $state({ dx: 0, dy: 0, active: false });
	let fly = $state<{
		card: C;
		vote: VoteValue;
		fromX: number;
		fromY: number;
		fromRot: number;
	} | null>(null);
	let votes = $state<Record<string, VoteValue>>({});
	// `vote: null` marks a prompt-card advance (no vote cast) so rewind stays uniform.
	let history = $state<{ id: string; vote: VoteValue | null }[]>([]);
	// svelte-ignore state_referenced_locally
	let peek = $state(initialPeek);
	let live = $state('');
	let detailCard = $state<C | null>(null);
	let detailOpen = $state(false);
	let rootEl = $state<HTMLDivElement | null>(null);

	// ── NON-reactive refs (the rapid-tap gate) ───────────────────────────
	// Gating re-entry on reactive state dropped every other fast tap. These are
	// plain mutable refs (useRef-style: mutate `.current`, never made reactive) read
	// synchronously inside commit — do NOT convert to $state.
	const animatingRef = { current: false };
	const liveIdxRef = { current: 0 };

	const total = $derived(cards.length);
	const card = $derived<C | null>(cards[idx] ?? null);
	const done = $derived(idx >= total);
	const isPrompt = $derived(!!card && kindOf?.(card) === 'prompt');
	const liveIntent = $derived(drag.active ? voteFromIntent(drag.dx, drag.dy) : null);

	const spread = $derived.by(() => {
		const s: Record<VoteValue, number> = { love: 0, like: 0, flexible: 0, dislike: 0 };
		for (const v of Object.values(votes)) s[v]++;
		return s;
	});

	$effect(() => {
		if (autoFocus) rootEl?.focus();
	});

	// BottomSheet self-closes via its bindable `open`; clear the card when it does.
	$effect(() => {
		if (!detailOpen) detailCard = null;
	});

	function openDetail(c: C) {
		detailCard = c;
		detailOpen = true;
	}

	function commit(vote: VoteValue) {
		if (animatingRef.current) return; // ref gate — survives rapid taps
		const i = liveIdxRef.current; // live index from ref, not reactive idx
		const c = cards[i];
		if (!c) return;
		if (kindOf?.(c) === 'prompt') return; // prompt cards never vote (defensive)
		animatingRef.current = true;
		// Capture where the card was at release so the fly-off continues from there
		// (not a snap back to center). For button/keyboard votes drag is 0 → center.
		const dyAdj = drag.dy < 0 ? drag.dy : drag.dy * 0.22; // south rubber-bands
		const fromX = drag.dx;
		const fromY = dyAdj + (vote === 'love' ? -10 : 0);
		const fromRot = drag.dx * 0.04;
		votes = { ...votes, [c.id]: vote };
		history = [...history, { id: c.id, vote }];
		live = `${VOTE_META[vote].label}. ${Math.max(0, total - i - 1)} left.`;
		fly = { card: c, vote, fromX, fromY, fromRot };
		drag = { dx: 0, dy: 0, active: false };
		liveIdxRef.current = i + 1;
		idx = i + 1;
		onvote?.(c, vote);
		setTimeout(() => {
			fly = null;
			animatingRef.current = false;
		}, 400);
	}

	// Advance a prompt card on "next"/"skip" — no vote cast, but recorded in history
	// so a later rewind lands back on it (and the consumer can undo its goals).
	function advancePrompt() {
		if (animatingRef.current) return;
		const i = liveIdxRef.current;
		const c = cards[i];
		if (!c) return;
		history = [...history, { id: c.id, vote: null }];
		live = `${Math.max(0, total - i - 1)} left.`;
		drag = { dx: 0, dy: 0, active: false };
		liveIdxRef.current = i + 1;
		idx = i + 1;
	}

	function undo() {
		if (animatingRef.current || history.length === 0) return;
		const last = history[history.length - 1];
		history = history.slice(0, -1);
		const i = Math.max(0, liveIdxRef.current - 1);
		liveIdxRef.current = i;
		idx = i;
		live = 'Rewound.';
		if (last.vote === null) {
			// Rewound onto a prompt card — let the consumer delete its created goals.
			onrewindPrompt?.(cards[i]);
		} else {
			const next = { ...votes };
			delete next[last.id];
			votes = next;
			onrewind?.(cards[i]);
		}
	}

	function reset() {
		idx = 0;
		liveIdxRef.current = 0;
		votes = {};
		history = [];
		fly = null;
		live = '';
	}

	// ── keyboard (always on) ──────────────────────────────────────────────
	function onKey(e: KeyboardEvent) {
		if (done || !card) return;
		// Prompt cards own their inputs — never hijack arrows/space/backspace as votes.
		if (isPrompt) return;
		const map: Record<string, VoteValue> = {
			ArrowUp: 'love',
			ArrowRight: 'like',
			ArrowLeft: 'dislike',
			f: 'flexible',
			F: 'flexible',
			' ': 'flexible'
		};
		if (map[e.key]) {
			e.preventDefault();
			commit(map[e.key]);
			return;
		}
		if ((e.key === 'u' || e.key === 'U' || e.key === 'Backspace') && history.length) {
			e.preventDefault();
			undo();
		}
	}

	// ── drag (vote cards only) ────────────────────────────────────────────
	let start: { x: number; y: number } | null = null;
	function onDown(e: PointerEvent) {
		if (buttonsOnly || isPrompt || !card || animatingRef.current) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		start = { x: e.clientX, y: e.clientY };
		drag = { dx: 0, dy: 0, active: true };
	}
	function onMove(e: PointerEvent) {
		if (!start) return;
		drag = { dx: e.clientX - start.x, dy: e.clientY - start.y, active: true };
	}
	function onUp() {
		if (!start) return;
		const { dx, dy } = drag;
		start = null;
		const intent = voteFromIntent(dx, dy);
		const far = Math.hypot(dx, dy) > COMMIT_PX;
		if (intent && far) commit(intent);
		else drag = { dx: 0, dy: 0, active: false };
	}

	// live card transform
	const cardStyle = $derived.by(() => {
		const dyAdj = drag.dy < 0 ? drag.dy : drag.dy * 0.22; // south rubber-bands
		const lift = liveIntent === 'love' ? -10 : 0;
		const scale = liveIntent === 'love' ? 1.02 : 1;
		const tf = `translate(${drag.dx}px, ${dyAdj + lift}px) rotate(${drag.dx * 0.04}deg) scale(${scale})`;
		const tr = drag.active ? 'none' : 'transform .3s cubic-bezier(.16,1,.3,1)';
		return `transform:${tf};transition:${tr};`;
	});

	function washTint(intent: VoteValue | null): string {
		if (intent === 'love') return 'rgba(62,90,58,0.92)';
		if (intent === 'like') return 'rgba(62,90,58,0.14)';
		if (intent === 'dislike') return 'rgba(165,89,58,0.16)';
		return 'transparent';
	}
	// moss for love/like, clay for pass — the colour the commit cue uses.
	function intentColor(intent: VoteValue | null): string {
		return intent === 'dislike' ? 'var(--color-clay)' : 'var(--color-moss)';
	}
	const washDist = $derived(Math.min(1, (Math.abs(drag.dx) + Math.abs(drag.dy)) / 150));
	const needleAng = $derived((Math.atan2(drag.dy, drag.dx) * 180) / Math.PI);
	const needleLen = $derived(Math.min(46, Math.hypot(drag.dx, drag.dy) * 0.6));
	// Past the commit threshold with a valid intent → releasing now casts the vote.
	const committed = $derived(
		drag.active && !!liveIntent && Math.hypot(drag.dx, drag.dy) > COMMIT_PX
	);
</script>

<!-- The deck is a focusable keyboard surface (↑→← / F / U). The compass-rose
	buttons are the real accessible controls; this captures key accelerators. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={rootEl}
	tabindex="0"
	onkeydown={onKey}
	role="application"
	aria-roledescription="Swipe deck"
	aria-label={title}
	class="relative flex min-h-0 flex-1 flex-col outline-none"
>
	<!-- header -->
	<div class="flex-none px-3.5 pt-3 pb-2">
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={undo}
				disabled={history.length === 0}
				aria-label="Rewind last vote"
				class="border-line bg-surface text-ink-soft inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-45"
			>
				<span aria-hidden="true">↺</span> Rewind
			</button>
			<div class="flex-1"></div>
			<button
				type="button"
				onclick={() => (peek = !peek)}
				aria-pressed={peek}
				class="border-line bg-surface text-ink-soft inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
			>
				<span aria-hidden="true">{peek ? '◑' : '○'}</span>
				{peek ? 'Peeking' : 'Peek'}
			</button>
			{#if !done}
				<RadialProgress done={idx} {total} />
			{/if}
			{#if onclose}
				<button
					type="button"
					onclick={onclose}
					aria-label="Close"
					class="text-ink-soft inline-flex p-1"
				>
					<span aria-hidden="true" class="text-xl leading-none">×</span>
				</button>
			{/if}
		</div>
		<div class="mt-0.5 text-center">
			<div class="font-display text-ink text-[17px] leading-tight font-semibold tracking-tight">
				{title}
			</div>
			{#if subtitle}
				<div class="text-ink-muted mt-px text-[11.5px]">{subtitle}</div>
			{/if}
		</div>
	</div>

	<!-- card region -->
	<div class="relative flex min-h-0 flex-1 flex-col justify-center px-[18px] pt-1">
		{#if done}
			{#if complete}
				{@render complete({ spread, rated: Object.keys(votes).length, total, reset })}
			{:else}
				<div class="text-center">
					<div class="font-display text-ink mb-2 text-2xl italic">Deck cleared.</div>
					<p class="text-ink-soft text-sm">You rated {Object.keys(votes).length} items.</p>
				</div>
			{/if}
		{:else if card}
			<!-- faint compass-star behind -->
			<div
				aria-hidden="true"
				class="text-moss pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.05]"
			>
				<svg viewBox="0 0 24 24" width="300" height="300" fill="none" stroke="currentColor" stroke-width="0.6">
					<path d="M12 2 L13.6 10.4 L22 12 L13.6 13.6 L12 22 L10.4 13.6 L2 12 L10.4 10.4 Z" />
				</svg>
			</div>

			<!-- live card (rises from deck; remounts per id) -->
			{#key card.id}
				<div class="wp-rise relative z-[2]">
					<div
						onpointerdown={onDown}
						onpointermove={onMove}
						onpointerup={onUp}
						onpointercancel={onUp}
						class="bg-surface border-line relative touch-none overflow-hidden rounded-[20px] border shadow-modal select-none"
						class:cursor-grab={!buttonsOnly && !isPrompt}
						style={cardStyle}
						role="group"
						aria-roledescription="vote card"
					>
						<!-- drag wash -->
						{#if liveIntent}
							<div
								aria-hidden="true"
								class="pointer-events-none absolute inset-0 rounded-[inherit]"
								style="background:{washTint(liveIntent)};opacity:{liveIntent === 'love'
									? washDist * 0.96
									: washDist};transition:opacity .08s;"
							></div>
							<!-- edge label — fades in with distance, then snaps to a filled
								 "locked" chip (✓ + scale pop) once past the commit threshold -->
							<div
								aria-hidden="true"
								class="pointer-events-none absolute z-[6] {liveIntent === 'love'
									? 'top-5 left-1/2 -translate-x-1/2'
									: liveIntent === 'like'
										? 'top-[44%] right-4'
										: 'top-[44%] left-4'}"
								style="opacity:{committed ? 1 : 0.4 + washDist * 0.6};"
							>
								<span
									class="inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 py-2 text-[15px] font-extrabold tracking-wider shadow-dropdown {committed
										? liveIntent === 'dislike'
											? 'bg-clay text-paper border-clay'
											: 'bg-moss text-paper border-moss'
										: liveIntent === 'love'
											? 'bg-paper text-moss border-paper'
											: liveIntent === 'like'
												? 'bg-surface text-moss border-moss'
												: 'bg-surface text-clay border-clay'}"
									style="transition:transform .12s cubic-bezier(.16,1,.3,1);transform:scale({committed
										? 1.12
										: 1});"
								>
									<span aria-hidden="true">{committed ? '✓' : VOTE_META[liveIntent].glyph}</span>
									{VOTE_META[liveIntent].label.toUpperCase()}
								</span>
							</div>
							<!-- commit ring: a coloured outline confirming a release will vote -->
							{#if committed}
								<div
									aria-hidden="true"
									class="pointer-events-none absolute inset-0 z-[5] rounded-[inherit] border-2"
									style="border-color:{intentColor(liveIntent)};box-shadow:inset 0 0 0 1px {intentColor(
										liveIntent
									)},0 0 0 4px color-mix(in srgb, {intentColor(liveIntent)} 22%, transparent);"
								></div>
							{/if}
						{/if}
						<!-- needle -->
						{#if !buttonsOnly && drag.active && needleLen >= 8}
							<div
								aria-hidden="true"
								class="pointer-events-none absolute top-1/2 left-1/2 h-0.5 origin-left"
								style="width:{needleLen}px;transform:rotate({needleAng}deg);background:linear-gradient(90deg,rgba(62,90,58,0.1),var(--color-moss));border-radius:2px;"
							>
								<span
									class="bg-moss absolute -top-[2.5px] -right-[3px] h-[7px] w-[7px] rounded-full"
								></span>
							</div>
						{/if}

						<div class="relative z-[4] p-5">
							{@render face(card)}
							<!-- footer: peek + details (vote cards only — prompts own their UI) -->
							{#if !isPrompt}
							<div
								class="border-line mt-4 flex min-h-[30px] items-center gap-2.5 border-t border-dashed pt-3.5"
							>
								{#if peek}
									{#if (othersByCard[card.id] ?? []).length}
										<VoteStacks votes={othersByCard[card.id]} {members} size={20} />
									{:else}
										<span class="text-ink-muted font-display text-[11.5px] italic">no votes yet</span>
									{/if}
								{:else}
									<span class="text-ink-muted inline-flex items-center gap-1.5 text-[11.5px]">
										<span aria-hidden="true">⊘</span> Others' votes hidden
									</span>
								{/if}
								{#if detail}
									<button
										type="button"
										onpointerdown={(e) => e.stopPropagation()}
										onclick={(e) => {
											e.stopPropagation();
											openDetail(card);
										}}
										class="border-line bg-surface-2 text-ink-soft ml-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold"
									>
										Details <span aria-hidden="true">›</span>
									</button>
								{/if}
							</div>
						{/if}
						</div>
					</div>
				</div>
			{/key}

			<!-- flying (departed) card -->
			{#if fly}
				{#snippet flyFace()}{@render face(fly!.card)}{/snippet}
				<FlyingCard
					vote={fly.vote}
					fromX={fly.fromX}
					fromY={fly.fromY}
					fromRot={fly.fromRot}
					face={flyFace}
				/>
			{/if}
		{/if}
	</div>

	<!-- controls -->
	{#if !done && card}
		<div class="flex-none px-4 pt-3 pb-4">
			{#if isPrompt}
				{#if promptControls}
					{@render promptControls(card, { advance: advancePrompt })}
				{/if}
			{:else}
				<CompassRose onvote={commit} />
				{#if showKeys}
					<div class="text-ink-muted mt-3 flex flex-wrap justify-center gap-3.5 text-[11.5px]">
						<span>↑ Love</span><span>→ Like</span><span>← Pass</span><span>F Flexible</span><span
							>U Rewind</span
						>
					</div>
				{/if}
			{/if}
		</div>
	{/if}

	<!-- a11y live region -->
	<div aria-live="polite" class="sr-only">{live}</div>

	<!-- details overlay -->
	{#if detail && detailCard}
		{#snippet detailBody()}
			{@render detail!(detailCard!, {
				vote: (v: VoteValue) => {
					detailOpen = false;
					commit(v);
				}
			})}
		{/snippet}
		{#if detailLayout === 'modal'}
			<div
				class="z-overlay fixed inset-0 flex items-center justify-center p-4"
				style="background:rgba(28,27,24,0.4);"
			>
				<button
					type="button"
					aria-label="Close details"
					class="absolute inset-0"
					onclick={() => (detailOpen = false)}
				></button>
				<div
					class="bg-surface relative z-[1] max-h-[85vh] w-[440px] max-w-full overflow-auto rounded-xl p-5 shadow-modal"
				>
					{@render detailBody()}
				</div>
			</div>
		{:else}
			<BottomSheet bind:open={detailOpen} title="Details">
				{@render detailBody()}
			</BottomSheet>
		{/if}
	{/if}
</div>
