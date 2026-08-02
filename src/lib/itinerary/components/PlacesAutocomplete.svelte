<script lang="ts">
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
	let predictions = $state<
		Array<{ placePrediction: { placeId: string; text: { text: string } } }>
	>([]);
	let sessionToken = $state(crypto.randomUUID());
	let showDropdown = $state(false);
	let loading = $state(false);
	let lookupFailed = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout>;

	function handleInput() {
		clearTimeout(debounceTimer);
		if (query.length < 3) {
			predictions = [];
			showDropdown = false;
			return;
		}
		debounceTimer = setTimeout(async () => {
			loading = true;
			const res = await fetch(
				`/api/places/autocomplete?input=${encodeURIComponent(query)}&session_token=${sessionToken}`
			);
			// #340: the proxy now returns a real status on upstream failure —
			// don't parse an error body as if it were results.
			predictions = res.ok ? ((await res.json()).suggestions ?? []) : [];
			showDropdown = predictions.length > 0;
			loading = false;
		}, 300);
	}

	async function selectPlace(placeId: string, displayText: string) {
		showDropdown = false;
		query = displayText;
		loading = true;
		const res = await fetch(
			`/api/places/details?place_id=${encodeURIComponent(placeId)}&session_token=${sessionToken}`
		);
		loading = false;
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
		{#if loading}
			<div
				class="text-ink-muted absolute top-1/2 right-3 -translate-y-1/2 text-xs"
			>
				...
			</div>
		{/if}
	</div>

	{#if showDropdown}
		<ul
			class="border-line bg-surface absolute z-modal mt-1 max-h-60 w-full overflow-y-auto rounded-md border shadow-lg"
		>
			{#each predictions as suggestion}
				<li>
					<button
						type="button"
						class="text-ink hover:bg-surface-hover w-full px-3 py-2 text-left text-sm"
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
