<script lang="ts">
	import Button from '$lib/ui/Button.svelte';
	import { untrack } from 'svelte';

	let {
		onSelect,
		defaultDate = ''
	}: {
		onSelect: (flight: {
			title: string;
			start_time: string;
			end_time: string;
			start_tz: string;
			end_tz: string;
			location_name: string;
			description: string;
		}) => void;
		defaultDate?: string;
	} = $props();

	let flightNumber = $state('');
	let flightDate = $state(untrack(() => defaultDate));
	let loading = $state(false);
	let error = $state('');

	async function lookupFlight() {
		if (!flightNumber || !flightDate) return;
		loading = true;
		error = '';
		try {
			const res = await fetch(
				`/api/flights/lookup?flight=${encodeURIComponent(flightNumber)}&date=${flightDate}`
			);
			if (!res.ok) {
				error = 'Flight not found';
				return;
			}
			const data = await res.json();
			const flight = Array.isArray(data) ? data[0] : data;
			if (!flight) {
				error = 'No results';
				return;
			}

			onSelect({
				title: `${flight.airline?.name ?? ''} ${flightNumber}`.trim(),
				start_time:
					flight.departure?.scheduledTime?.local?.split('T')[1]?.slice(0, 5) ?? '',
				end_time:
					flight.arrival?.scheduledTime?.local?.split('T')[1]?.slice(0, 5) ?? '',
				start_tz: flight.departure?.airport?.timeZone ?? '',
				end_tz: flight.arrival?.airport?.timeZone ?? '',
				location_name: `${flight.departure?.airport?.name ?? ''} (${flight.departure?.airport?.iata ?? ''})`,
				description: `→ ${flight.arrival?.airport?.name ?? ''} (${flight.arrival?.airport?.iata ?? ''})`
			});
		} catch {
			error = 'Flight lookup failed';
		} finally {
			loading = false;
		}
	}
</script>

<div class="flex flex-col gap-2">
	<div class="flex flex-col gap-2 sm:flex-row">
		<input
			type="text"
			bind:value={flightNumber}
			placeholder="e.g. AA1234"
			aria-label="Flight number"
			class="border-line bg-surface text-ink w-full rounded-md border px-3 py-2 text-sm uppercase sm:flex-1"
			oninput={(e) => {
				e.currentTarget.value = e.currentTarget.value.toUpperCase();
				flightNumber = e.currentTarget.value;
			}}
		/>
		<input
			type="date"
			bind:value={flightDate}
			aria-label="Flight date"
			class="border-line bg-surface text-ink w-full rounded-md border px-3 py-2 text-sm sm:w-auto"
		/>
	</div>
	<Button
		type="button"
		variant="ghost"
		size="sm"
		disabled={loading || !flightNumber || !flightDate}
		onclick={lookupFlight}
	>
		{loading ? 'Looking up...' : 'Look up flight'}
	</Button>
	{#if error}
		<p class="text-error text-sm">{error}</p>
	{/if}
</div>
