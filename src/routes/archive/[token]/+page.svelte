<script lang="ts">
	import { page } from '$app/state';
	import ArchiveDaySection from '$lib/portability/components/ArchiveDaySection.svelte';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import { titleCase } from '$lib/shell/format';
	import type { PageData } from './$types';

	let { data } = $props();

	// Element type of the published archive's considered-items list (the loader
	// returns a union: the published view vs. the pre-publish pending object).
	type ArchiveItem = Extract<PageData, { consideredItems: unknown[] }>['consideredItems'][number];

	// Pre-publish window: token is valid but the story isn't live yet (#171).
	const pending = $derived('pending' in data ? data : null);
	const publishDateLabel = $derived(
		pending?.publishDate
			? new Date(pending.publishDate).toLocaleDateString('en-US', {
					month: 'long',
					day: 'numeric',
					year: 'numeric'
				})
			: ''
	);

	const dateRange = $derived.by(() => {
		if ('pending' in data) return '';
		const fmt = (d: string) =>
			new Date(d.replace(' ', 'T')).toLocaleDateString('en-US', {
				month: 'long',
				day: 'numeric',
				year: 'numeric'
			});
		return `${fmt(data.trip.start_date)} – ${fmt(data.trip.end_date)}`;
	});

	const consideredByType = $derived.by(() => {
		const grouped = new Map<string, ArchiveItem[]>();
		if ('pending' in data) return grouped;
		for (const item of data.consideredItems) {
			const type = item.type || 'activity';
			if (!grouped.has(type)) grouped.set(type, []);
			grouped.get(type)!.push(item);
		}
		return grouped;
	});

	let showConsidered = $state(false);
</script>

<svelte:head>
	{#if 'pending' in data}
		<title>{data.tripTitle} — Coming soon</title>
		<meta name="robots" content="noindex" />
	{:else}
		<title>{data.trip.title} — Trip Archive</title>
		<meta property="og:title" content={data.trip.title} />
		<meta property="og:description" content="{data.trip.location_summary ? data.trip.location_summary + ' · ' : ''}{dateRange}" />
		<meta property="og:type" content="article" />
		<meta property="og:url" content={page.url.href} />
	{/if}
</svelte:head>

{#if 'pending' in data}
	<main class="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 text-center">
		<p class="font-display text-ink text-2xl font-semibold italic">Waypoint</p>
		<svg
			class="text-moss-soft mt-8"
			width="44"
			height="44"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="9" />
			<polyline points="12 7 12 12 15 14" />
		</svg>
		<h1 class="font-display text-ink mt-6 text-3xl font-semibold tracking-tight">
			This trip's story is still being written
		</h1>
		{#if publishDateLabel}
			<p class="text-ink-soft mt-3 text-base">
				<strong class="text-ink">{data.tripTitle}</strong> publishes on
				<span class="whitespace-nowrap">{publishDateLabel}</span>. Check back then — the full
				itinerary and highlights will be waiting for you here.
			</p>
		{:else}
			<p class="text-ink-soft mt-3 text-base">
				<strong class="text-ink">{data.tripTitle}</strong> isn't published yet. Check back later —
				the full itinerary and highlights will be waiting for you here.
			</p>
		{/if}
		<p class="text-ink-muted mt-6 text-sm">Bookmark this page so it's easy to find.</p>
	</main>
{:else}
	<main class="mx-auto w-full max-w-2xl px-4 pb-16">
		<header class="py-10 text-center">
		<h1 class="text-ink text-3xl font-bold tracking-tight">{data.trip.title}</h1>
		{#if data.trip.location_summary}
			<p class="text-ink-muted mt-2 font-serif text-lg italic">{data.trip.location_summary}</p>
		{/if}
		<p class="text-ink-muted mt-2 text-sm">{dateRange}</p>
		{#if data.trip.photo_album_url}
			<a
				href={data.trip.photo_album_url}
				target="_blank"
				rel="noopener noreferrer"
				class="bg-ink text-on-ink mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
					<circle cx="8.5" cy="8.5" r="1.5" />
					<polyline points="21 15 16 10 5 21" />
				</svg>
				View Photos
			</a>
		{/if}
	</header>

	<div class="space-y-4">
		{#each data.days as day (day.id)}
			{@const dayItems = data.doneItems.filter((i) => i.day === day.id)}
			<ArchiveDaySection {day} items={dayItems} phases={data.phases} />
		{/each}
	</div>

	{#if data.consideredItems.length > 0}
		<div class="mt-10">
			<button
				type="button"
				onclick={() => (showConsidered = !showConsidered)}
				class="text-ink-muted flex w-full items-center gap-2 text-sm font-medium"
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="transition-transform"
					class:rotate-90={showConsidered}
				>
					<path d="m9 18 6-6-6-6" />
				</svg>
				What we considered ({data.consideredItems.length} items)
			</button>

			{#if showConsidered}
				<div class="mt-4 space-y-4">
					{#each [...consideredByType.entries()] as [type, items] (type)}
						<div class="bg-surface border-border rounded-xl border p-4">
							<h4 class="text-ink mb-3 text-sm font-semibold">{titleCase(type)}s</h4>
							<ul class="space-y-2">
								{#each items as item (item.id)}
									<li class="flex items-start gap-2">
										<TypeIcon type={item.type} size={20} />
										<div class="min-w-0">
											<p class="text-ink text-sm">{item.title}</p>
											{#if item.location_name}
												<p class="text-ink-muted text-xs">{item.location_name}</p>
											{/if}
										</div>
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<section class="border-line/60 mt-12 rounded-2xl border bg-surface/60 p-6 text-center">
		<h2 class="font-display text-ink text-xl font-semibold tracking-tight">
			Want to do this trip yourself?
		</h2>
		<p class="text-ink-soft mx-auto mt-2 max-w-md text-sm">
			Download this plan as a template — the itinerary, phases, and days, with the
			group's private details (who paid, bookings, costs) left out. Import it into
			Waypoint to start your own trip from it.
		</p>
		<div class="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
			<a
				href="{page.url.pathname}/export"
				download
				class="bg-ink text-on-ink inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="7 10 12 15 17 10" />
					<line x1="12" y1="15" x2="12" y2="3" />
				</svg>
				Use as template
			</a>
			<a
				href="/trips/import"
				class="text-ink-soft hover:text-ink inline-flex items-center justify-center gap-1.5 text-sm font-medium underline-offset-2 hover:underline"
			>
				Import into Waypoint
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<line x1="5" y1="12" x2="19" y2="12" />
					<polyline points="12 5 19 12 12 19" />
				</svg>
			</a>
		</div>
		<p class="text-ink-muted mx-auto mt-3 max-w-md text-xs">
			You'll sign in (or create a free account) to import — the new trip is yours.
		</p>
	</section>

	<footer class="text-ink-muted mt-12 border-t border-border/30 pt-6 text-center text-xs">
		Built with Waypoint
	</footer>
	</main>
{/if}
