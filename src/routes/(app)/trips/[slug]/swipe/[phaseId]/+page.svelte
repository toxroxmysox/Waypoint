<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { Item } from '$lib/types';
	import { type VoteValue } from '$lib/collaboration/voting';
	import SwipeDeck from '$lib/collaboration/components/swipe/SwipeDeck.svelte';
	import { VOTE_META } from '$lib/collaboration/components/swipe/vote-meta';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { toast } from '$lib/shell/stores/toast';

	let { data } = $props();

	const phasesHref = $derived(`/trips/${data.trip.slug}/phases`);

	// tablet+ uses a centered modal for detail; mobile uses a bottom sheet.
	let isWide = $state(false);
	$effect(() => {
		const mq = window.matchMedia('(min-width: 900px)');
		const sync = () => (isWide = mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	// Hidden form-action plumbing. The deck advances optimistically; we persist in
	// the background via the real `vote`/`unvote` form actions (no invalidation, so
	// the queue the user is mid-way through never shifts under them).
	let voteForm = $state<HTMLFormElement | null>(null);
	let unvoteForm = $state<HTMLFormElement | null>(null);

	function setFields(form: HTMLFormElement, fields: Record<string, string>) {
		for (const [name, val] of Object.entries(fields)) {
			(form.elements.namedItem(name) as HTMLInputElement).value = val;
		}
		form.requestSubmit();
	}

	function persistVote(card: Item, value: VoteValue) {
		if (voteForm) setFields(voteForm, { item: card.id, value });
	}
	function persistRewind(card: Item) {
		if (card && unvoteForm) setFields(unvoteForm, { item: card.id });
	}

	function costLabel(n: number): string {
		return n > 0 ? `$${Math.round(n)}` : 'Free';
	}
</script>

<!-- background persistence (progressive-enhancement form actions, fired by the deck) -->
<form
	bind:this={voteForm}
	method="POST"
	action="?/vote"
	class="hidden"
	use:enhance={() =>
		async ({ result }) => {
			if (result.type === 'failure') toast.show('Vote did not save — check your connection.', 'error');
		}}
>
	<input type="hidden" name="item" value="" />
	<input type="hidden" name="value" value="" />
</form>
<form
	bind:this={unvoteForm}
	method="POST"
	action="?/unvote"
	class="hidden"
	use:enhance={() => async () => {}}
>
	<input type="hidden" name="item" value="" />
</form>

<div class="bg-paper flex min-h-[100dvh] flex-col">
	<div
		class="mx-auto flex w-full max-w-md flex-1 flex-col md-desktop:my-6 md-desktop:max-h-[760px] md-desktop:max-w-md md-desktop:overflow-hidden md-desktop:rounded-xl md-desktop:border md-desktop:border-line md-desktop:bg-surface md-desktop:shadow-modal"
	>
		{#if data.cards.length === 0}
			<!-- empty / drain-to-empty: the phase has no unvoted items -->
			<div class="flex flex-1 flex-col items-center justify-center px-6 text-center">
				<div class="text-moss mb-4 text-4xl" aria-hidden="true">✓</div>
				<h1 class="font-display text-ink mb-2 text-2xl italic">All caught up.</h1>
				<p class="text-ink-soft mb-6 max-w-xs text-sm">
					Nothing left to rate in {data.phase.name}.
				</p>
				<div class="flex w-full max-w-[280px] flex-col gap-2.5">
					{#if data.nextPhase}
						<Button onclick={() => goto(`/trips/${data.trip.slug}/swipe/${data.nextPhase!.id}`)}>
							Continue to {data.nextPhase.name} ›
						</Button>
					{/if}
					<Button variant="outline" onclick={() => goto(data.parkingLotHref)}>
						Jump to the phase parking lot
					</Button>
					<Button variant="ghost" onclick={() => goto(phasesHref)}>Back to phases</Button>
				</div>
			</div>
		{:else}
			<SwipeDeck
				cards={data.cards as Item[]}
				othersByCard={data.votesByItem}
				members={data.members}
				title="Swipe-Quiz"
				subtitle={data.phase.name}
				detailLayout={isWide ? 'modal' : 'sheet'}
				autoFocus={isWide}
				showKeys={isWide}
				onvote={persistVote}
				onrewind={persistRewind}
				onclose={() => goto(phasesHref)}
			>
				{#snippet face(card)}
					<div class="flex items-start gap-3">
						<TypeIcon type={card.type} size={40} />
						<div class="min-w-0 flex-1">
							<h2 class="font-display text-ink text-lg leading-tight font-semibold">{card.title}</h2>
							<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
								<span
									class="inline-flex items-center rounded-full border px-2 py-px font-semibold {card.status ===
									'planned'
										? 'border-moss/30 text-moss bg-moss-tint'
										: 'border-line text-ink-muted bg-surface-2'}"
								>
									{card.status === 'planned' ? 'Planned' : 'Idea'}
								</span>
								<span class="text-ink-muted">
									{data.dayLabel[card.day] ?? 'Unscheduled'}
								</span>
							</div>
						</div>
					</div>
					<div class="text-ink-soft mt-3 space-y-1 text-[13px]">
						{#if card.location_name}
							<div class="flex items-center gap-1.5">
								<span aria-hidden="true" class="text-ink-muted">⌖</span>
								{card.location_name}
							</div>
						{/if}
						<div class="flex items-center gap-3">
							<span class="font-mono">{costLabel(card.cost_estimate_usd)}</span>
							{#if data.initialByUser[card.created_by]}
								<span class="text-ink-muted">Added by {data.initialByUser[card.created_by]}</span>
							{/if}
						</div>
					</div>
				{/snippet}

				{#snippet detail(card, helpers)}
					<div class="space-y-4">
						<div class="flex items-start gap-3">
							<TypeIcon type={card.type} size={44} />
							<div>
								<h2 class="font-display text-ink text-xl font-semibold">{card.title}</h2>
								<p class="text-ink-muted text-xs">
									{data.phase.name} · {data.dayLabel[card.day] ?? 'Unscheduled'}
								</p>
							</div>
						</div>
						{#if card.description}
							<p class="text-ink-soft text-sm leading-relaxed">{card.description}</p>
						{/if}
						<dl class="text-ink-soft grid grid-cols-2 gap-3 text-[13px]">
							<div>
								<dt class="text-ink-muted text-[11px] uppercase">Where</dt>
								<dd>{card.location_name || '—'}</dd>
							</div>
							<div>
								<dt class="text-ink-muted text-[11px] uppercase">Cost</dt>
								<dd class="font-mono">{costLabel(card.cost_estimate_usd)}</dd>
							</div>
						</dl>
						<div class="border-line flex flex-wrap gap-2 border-t pt-3">
							{#each ['love', 'like', 'flexible', 'dislike'] as const as v (v)}
								<button
									type="button"
									onclick={() => helpers.vote(v)}
									class="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold {VOTE_META[
										v
									].btn}"
								>
									<span aria-hidden="true">{VOTE_META[v].glyph}</span>
									{VOTE_META[v].label}
								</button>
							{/each}
						</div>
					</div>
				{/snippet}

				{#snippet complete({ spread, rated })}
					<div class="flex flex-col items-center justify-center text-center">
						<!-- compass rose of your personal spread -->
						<div class="relative mb-4 h-[180px] w-[210px]">
							<span
								class="text-moss absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
								aria-hidden="true"
							>
								<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.2">
									<path d="M12 2 L13.6 10.4 L22 12 L13.6 13.6 L12 22 L10.4 13.6 L2 12 L10.4 10.4 Z" />
								</svg>
							</span>
							{#each [{ v: 'love', pos: 'top-0 left-1/2 -translate-x-1/2' }, { v: 'like', pos: 'top-1/2 right-0 -translate-y-1/2' }, { v: 'flexible', pos: 'bottom-0 left-1/2 -translate-x-1/2' }, { v: 'dislike', pos: 'top-1/2 left-0 -translate-y-1/2' }] as const as arm (arm.v)}
								<div class="absolute flex flex-col items-center gap-0.5 {arm.pos}">
									<span
										class="inline-flex min-w-[40px] items-center justify-center rounded-full border-[1.5px] px-2 py-1 text-xs font-bold {VOTE_META[
											arm.v
										].btn}"
									>
										<span aria-hidden="true" class="mr-1">{VOTE_META[arm.v].glyph}</span>{spread[arm.v]}
									</span>
									<span class="text-ink-muted text-[10px] font-semibold tracking-wide uppercase"
										>{VOTE_META[arm.v].label}</span
									>
								</div>
							{/each}
						</div>
						<div class="font-display text-ink mb-2 text-2xl italic">Deck cleared.</div>
						<p class="text-ink-soft mb-5 max-w-[250px] text-sm leading-relaxed">
							You rated {rated}
							{rated === 1 ? 'item' : 'items'}. Your votes stay blind to everyone else.
						</p>
						<div class="flex w-full max-w-[280px] flex-col gap-2.5">
							{#if data.nextPhase}
								<Button onclick={() => goto(`/trips/${data.trip.slug}/swipe/${data.nextPhase!.id}`)}>
									Continue to {data.nextPhase.name} ›
								</Button>
							{/if}
							<Button variant="outline" onclick={() => goto(data.parkingLotHref)}>
								Jump to the phase parking lot
							</Button>
						</div>
					</div>
				{/snippet}
			</SwipeDeck>
		{/if}
	</div>
</div>
