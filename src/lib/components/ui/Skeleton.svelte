<script lang="ts">
	let { class: className = '', width = '100%', height = '1rem', rounded = 'rounded-md' } = $props();
</script>

<div
	class="skeleton-shimmer bg-surface-2 {rounded} {className}"
	style="width: {width}; height: {height};"
	aria-hidden="true"
></div>

<style>
	.skeleton-shimmer {
		position: relative;
		overflow: hidden;
	}
	@media (prefers-reduced-motion: no-preference) {
		.skeleton-shimmer::after {
			content: '';
			position: absolute;
			inset: 0;
			background: linear-gradient(
				90deg,
				transparent 0%,
				rgba(255, 255, 255, 0.4) 50%,
				transparent 100%
			);
			animation: shimmer 1.5s ease-in-out infinite;
		}
	}
	@keyframes shimmer {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(100%);
		}
	}
</style>
