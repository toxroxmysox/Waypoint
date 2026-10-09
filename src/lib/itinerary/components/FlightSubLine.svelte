<script lang="ts">
	// A flight Row's sub-line (#433): `Thu Oct 1 · 2:05p → 4:20p · MKE → DEN`. When it
	// doesn't fit, the arrival time drops first (then the departure time, then the
	// date) so the route survives (`fitFlightSub`, unit-tested). The text is measured
	// with the element's real font (canvas), against its measured box; before
	// measurement (SSR) it renders in full and CSS truncates.
	import { fitFlightSub, type FlightSub } from '$lib/itinerary/row';

	let { sub }: { sub: FlightSub } = $props();

	let width = $state(0);
	let el = $state<HTMLElement>();
	let ctx: CanvasRenderingContext2D | null = null;

	function measure(text: string): number {
		if (!el) return 0;
		ctx ??= document.createElement('canvas').getContext('2d');
		if (!ctx) return 0;
		ctx.font = getComputedStyle(el).font;
		return ctx.measureText(text).width;
	}

	const fit = $derived(
		width > 0 && el ? fitFlightSub(sub, width, measure) : fitFlightSub(sub, Number.POSITIVE_INFINITY)
	);
</script>

<span class="block truncate" bind:this={el} bind:clientWidth={width} data-flight-sub data-dropped={fit.dropped.join(',')}>{fit.text}</span>
