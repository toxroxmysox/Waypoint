<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { VoteValue } from '$lib/collaboration/voting';

	// The voted card departs as its own layer, flying off in the vote direction
	// while the next card rises from the deck (.wp-rise). It starts from the card's
	// release position (fromX/fromY/fromRot) so the motion is continuous — no snap
	// back to center first. Reduced-motion collapses to a fade (handled by CSS).
	let {
		vote,
		face,
		fromX = 0,
		fromY = 0,
		fromRot = 0
	}: {
		vote: VoteValue;
		face: Snippet;
		fromX?: number;
		fromY?: number;
		fromRot?: number;
	} = $props();

	// fly vectors per vote — up for love, sideways for like/pass, down for flexible
	const FLY: Record<VoteValue, [number, number]> = {
		love: [0, -1],
		like: [1, -0.12],
		dislike: [-1, -0.12],
		flexible: [0, 1]
	};

	let el = $state<HTMLDivElement | null>(null);

	$effect(() => {
		const node = el;
		if (!node) return;
		const [vx, vy] = FLY[vote];
		// Next frame: transition from the release position to off-screen.
		requestAnimationFrame(() => {
			node.style.transform = `translate(${vx * 520}px, ${vy * 620}px) rotate(${vx * 16}deg) scale(${vote === 'love' ? 1.05 : 0.96})`;
			node.style.opacity = '0';
		});
	});
</script>

<div
	bind:this={el}
	aria-hidden="true"
	class="wp-fly pointer-events-none absolute inset-x-[18px] z-[3] flex flex-col justify-center"
	style="transform:translate({fromX}px,{fromY}px) rotate({fromRot}deg);"
>
	<div
		class="bg-surface border-line rounded-[20px] border p-5 shadow-modal"
		class:outline={vote === 'love'}
		style={vote === 'love' ? 'outline:3px solid var(--color-moss);' : ''}
	>
		{@render face()}
	</div>
</div>
