<script lang="ts">
	// The Hero (#428; CARD_SYSTEM D11/D10, spec §Hero): the Card enlarged for the item
	// that IS the moment. One component for Now's Focus, the item page header (#438)
	// and the Swipe-Quiz face (#443); each passes only what it shows.
	//
	// Top to bottom: 40px icon beside the title (`⋯` at the right), the type words
	// (item page), the place + address (a Maps link), the time / live line, codes as
	// large tap-to-copy rows, `✓ Booked` + Going with names, then `children` (the
	// swipe face's description etc.). Live = a `status` is passed: the icon fills
	// with the mode accent and the card gets the accent border. It is the only accent
	// on the page (D10), so nothing else in here uses colour.
	//
	// Role logic lives with the caller: the `menu` snippet is where Now mounts
	// ItemActionsMenu; the Hero never decides who may do what.
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { withOrigin } from '$lib/shell/back-nav';
	import MonoTypeIcon from '$lib/ui/MonoTypeIcon.svelte';
	import PersonBubble from '$lib/ui/PersonBubble.svelte';
	import CodeRow from '$lib/documents/components/CodeRow.svelte';
	import { goingNames, mapsUrl, type HeroStatus } from '$lib/trip-mode/hero';
	import type { Item, TripMember } from '$lib/types';
	import type { ConfirmationCode } from '$lib/itinerary/types';

	type HeroItem = Pick<
		Item,
		| 'type'
		| 'subtype'
		| 'title'
		| 'location_name'
		| 'location_address'
		| 'location_coords'
		| 'google_place_id'
		| 'booked'
		| 'assigned_to'
	>;

	let {
		item,
		members = [],
		status = null,
		timeText = '',
		typeLine = '',
		codes = [],
		href = '',
		placeLink = true,
		showGoing = true,
		menu,
		children
	}: {
		item: HeroItem;
		/** The trip roster (with `avatarUrl`), to put names on the Going row. */
		members?: Array<TripMember & { avatarUrl?: string }>;
		/** The live line (`heroStatus`). Present = live: accent border + filled icon. */
		status?: HeroStatus | null;
		/** The time in text grammar (`formatTimeText`) when not live (item page, swipe). */
		timeText?: string;
		/** `Meal · Fine dining` — type and subtype in words (item page). */
		typeLine?: string;
		codes?: ConfirmationCode[];
		/** Makes the whole card open this URL (Now). Omit on the item page itself. */
		href?: string;
		/** The place line opens Maps. Off for the swipe face, whose gestures own the card. */
		placeLink?: boolean;
		showGoing?: boolean;
		/** Top-right slot: the `⋯` menu. */
		menu?: Snippet;
		/** After the Going row. */
		children?: Snippet;
	} = $props();

	const live = $derived(!!status);
	const going = $derived(goingNames(item, members));
	const maps = $derived(placeLink ? mapsUrl(item) : '');
	const hasPlace = $derived(!!(item.location_name || item.location_address));
	const memberOf = (id: string) => members.find((m) => m.id === id);
</script>

<article
	class="bg-surface relative rounded-xl border p-4 {live ? 'shadow-card-strong' : 'border-line shadow-card'}"
	style={live ? 'border-color:var(--color-accent);border-width:2px;' : ''}
	data-hero
	data-live={live ? 'true' : 'false'}
	aria-label={item.title}
>
	{#if href}
		<!-- #231 stretched link: the card opens the item; real controls sit above it. -->
		<a
			href={withOrigin(href, page.url.pathname)}
			class="absolute inset-0 z-0 rounded-xl"
			aria-label="Open {item.title}"
		></a>
	{/if}

	<div class="pointer-events-none relative flex items-start gap-3">
		<MonoTypeIcon type={item.type} sub={item.subtype} size={40} variant={live ? 'filled' : 'plain'} />
		<div class="min-w-0 flex-1 pt-0.5">
			{#if typeLine}
				<p class="text-ink-muted text-[11px] font-semibold tracking-wide uppercase">{typeLine}</p>
			{/if}
			<h2 class="text-ink font-display text-[22px] leading-tight font-semibold break-words">{item.title}</h2>
		</div>
		{#if menu}
			<div class="pointer-events-auto relative z-20 -mt-1 -mr-2 shrink-0">{@render menu()}</div>
		{/if}
	</div>

	<div class="pointer-events-none relative mt-3 space-y-3">
		{#if hasPlace}
			{#if maps}
				<a
					href={maps}
					target="_blank"
					rel="noopener noreferrer"
					class="hover:bg-surface-2 active:bg-surface-2 pointer-events-auto relative z-10 -mx-2 block min-h-11 rounded-lg px-2 py-1.5"
					data-testid="hero-place"
				>
					{#if item.location_name}
						<span class="text-ink block text-base font-medium">{item.location_name}</span>
					{/if}
					{#if item.location_address}
						<span class="text-ink-soft block text-sm">{item.location_address}</span>
					{/if}
					<span class="sr-only">Opens in Maps</span>
				</a>
			{:else}
				<div data-testid="hero-place">
					{#if item.location_name}<p class="text-ink text-base font-medium">{item.location_name}</p>{/if}
					{#if item.location_address}<p class="text-ink-soft text-sm">{item.location_address}</p>{/if}
				</div>
			{/if}
		{/if}

		{#if status}
			<p class="text-sm font-semibold tracking-wide" style="color:var(--color-accent);" data-testid="hero-status">
				<span class="uppercase">{status.label}</span> · {status.text}
			</p>
		{:else if timeText}
			<p class="text-ink-soft font-mono text-sm" data-testid="hero-time">{timeText}</p>
		{/if}

		{#if codes.length > 0}
			<div class="pointer-events-auto relative z-10 space-y-2">
				{#each codes as code, i (i)}
					<CodeRow {code} />
				{/each}
			</div>
		{/if}

		{#if item.booked || (showGoing && going.length > 0)}
			<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
				{#if item.booked}
					<span class="text-ink-soft inline-flex items-center gap-1 text-sm font-medium" data-testid="hero-booked">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
						Booked
					</span>
				{/if}
				{#if showGoing && going.length > 0}
					<span class="inline-flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5" data-testid="hero-going">
						<span class="text-ink-muted text-sm">Going</span>
						{#each going as g (g.memberId)}
							<span class="text-ink-soft inline-flex items-center gap-1.5 text-sm">
								<PersonBubble name={g.name} img={memberOf(g.memberId)?.avatarUrl} size={24} />
								{g.name}
							</span>
						{/each}
					</span>
				{/if}
			</div>
		{/if}

		{#if children}{@render children()}{/if}
	</div>
</article>
