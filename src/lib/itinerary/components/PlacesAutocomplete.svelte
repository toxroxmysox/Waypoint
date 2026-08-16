<script lang="ts">
	import { onDestroy } from 'svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import {
		createPlacesSearch,
		PLACES_MIN_QUERY,
		type PlaceSuggestion
	} from '$lib/itinerary/places-search';

	let {
		onSelect
	}: {
		onSelect: (place: {
			name: string;
			address: string;
			coords: { lat: number; lng: number };
			placeId: string;
		}) => void;
	} = $props();

	let query = $state('');
	let predictions = $state<PlaceSuggestion[]>([]);
	let sessionToken = $state(crypto.randomUUID());
	let showDropdown = $state(false);
	/** An autocomplete request is in flight (past the debounce). */
	let searching = $state(false);
	/** A place-details lookup is in flight (after picking a suggestion). */
	let resolving = $state(false);
	let lookupFailed = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout>;

	// #377: latest-wins + AbortController. Without it a slow earlier response
	// could resolve after a newer one and repaint stale suggestions mid-typing.
	const places = createPlacesSearch();

	function handleInput() {
		clearTimeout(debounceTimer);
		if (query.length < PLACES_MIN_QUERY) {
			places.cancel();
			predictions = [];
			showDropdown = false;
			searching = false;
			return;
		}
		debounceTimer = setTimeout(async () => {
			searching = true;
			const result = await places.search(query, sessionToken);
			// null = superseded by a newer keystroke: leave the UI to that request,
			// and leave `searching` on — the newer one is still running.
			if (result === null) return;
			predictions = result;
			showDropdown = predictions.length > 0;
			searching = false;
		}, 300);
	}

	async function selectPlace(placeId: string, displayText: string) {
		showDropdown = false;
		query = displayText;
		clearTimeout(debounceTimer);
		places.cancel();
		searching = false;
		resolving = true;
		const res = await fetch(
			`/api/places/details?place_id=${encodeURIComponent(placeId)}&session_token=${sessionToken}`
		);
		resolving = false;
		// #340: a failed lookup must not write an empty name/address and 0,0
		// coords into the form — leave the typed text and bail.
		if (!res.ok) {
			lookupFailed = true;
			return;
		}
		lookupFailed = false;
		const place = await res.json();
		onSelect({
			name: place.displayName?.text ?? '',
			address: place.formattedAddress ?? '',
			coords: place.location
				? { lat: place.location.latitude, lng: place.location.longitude }
				: { lat: 0, lng: 0 },
			placeId: place.id ?? placeId
		});
		sessionToken = crypto.randomUUID();
		query = '';
		predictions = [];
	}

	function handleClickOutside(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.places-autocomplete')) {
			showDropdown = false;
		}
	}

	onDestroy(() => {
		clearTimeout(debounceTimer);
		places.cancel();
	});
</script>

<svelte:document onclick={handleClickOutside} />

<div class="places-autocomplete relative">
	<div class="relative">
		<input
			type="text"
			bind:value={query}
			oninput={handleInput}
			onfocus={() => {
				if (predictions.length > 0) showDropdown = true;
			}}
			placeholder="Search for a place..."
			class="border-line bg-surface text-ink w-full rounded-md border px-3 py-2 pr-8 text-sm"
		/>
		{#if resolving}
			<!-- #377: was a literal "..." text node. A shimmer dot matches the
				 design system's skeleton loading language. -->
			<div class="absolute top-1/2 right-3 -translate-y-1/2">
				<Skeleton width="0.9rem" height="0.9rem" rounded="rounded-full" />
			</div>
		{/if}
	</div>

	{#if searching}
		<!-- #377: skeleton rows sized like real predictions, so the dropdown
			 doesn't jump when suggestions land. Replaces the stale list while a
			 newer query is in flight. -->
		<div class="border-line bg-surface absolute z-modal mt-1 w-full rounded-md border shadow-lg">
			<div class="px-3 py-2"><Skeleton height="1.25rem" width="80%" /></div>
			<div class="px-3 py-2"><Skeleton height="1.25rem" width="55%" /></div>
		</div>
		<span role="status" class="sr-only">Searching places…</span>
	{:else if showDropdown}
		<ul
			class="border-line bg-surface absolute z-modal mt-1 max-h-60 w-full overflow-y-auto rounded-md border shadow-lg"
		>
			{#each predictions as suggestion}
				<li>
					<button
						type="button"
						class="text-ink hover:bg-surface-hover active:bg-surface-hover w-full px-3 py-2 text-left text-sm"
						onclick={() =>
							selectPlace(
								suggestion.placePrediction.placeId,
								suggestion.placePrediction.text.text
							)}
					>
						{suggestion.placePrediction.text.text}
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if lookupFailed}
		<p class="text-error mt-1 text-xs">
			Couldn't load that place. Try again, or type the address manually.
		</p>
	{/if}

	<p class="text-ink-muted mt-1 text-[10px]">Powered by Google</p>
</div>
