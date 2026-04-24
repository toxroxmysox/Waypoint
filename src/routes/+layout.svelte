<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head>
	<meta name="theme-color" content="#1e293b" />
</svelte:head>

{@render children()}
