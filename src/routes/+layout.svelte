<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		const handler = (e: WheelEvent) => {
			if (e.target instanceof HTMLInputElement && e.target.type === 'number') {
				e.target.blur();
			}
		};
		document.addEventListener('wheel', handler, { passive: true });
		return () => document.removeEventListener('wheel', handler);
	});
</script>

<svelte:head>
	<meta name="theme-color" content="#1e293b" />
</svelte:head>

{@render children()}
