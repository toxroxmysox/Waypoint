<script lang="ts">
	import BottomNav from '$lib/components/BottomNav.svelte';

	let { data, children } = $props();
</script>

{@render children()}

<BottomNav slug={data.trip.slug} role={data.membership.role} />

<div class="h-16"></div>
