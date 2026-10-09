<script lang="ts">
	// A flight Row's sub-line (#433): `Thu Oct 1 · 2:05p → 4:20p · MKE → DEN`. When it
	// doesn't fit, the arrival time drops first (then the departure time, then the
	// date) so the route survives (`fitFlightSub`, unit-tested). Width is estimated
	// from text length against the measured box; before measurement it renders in full.
	import { fitFlightSub, type FlightSub } from '$lib/itinerary/row';

	let { sub }: { sub: FlightSub } = $props();

	let width = $state(0);
	const fit = $derived(fitFlightSub(sub, width > 0 ? width : Number.POSITIVE_INFINITY));
</script>

<span class="block truncate" bind:clientWidth={width} data-flight-sub data-dropped={fit.dropped.join(',')}>{fit.text}</span>
