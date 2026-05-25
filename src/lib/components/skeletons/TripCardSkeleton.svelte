<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
</script>

<Card>
	<div class="space-y-2 p-4">
		<Skeleton height="1.25rem" width="66%" />
		<Skeleton height="0.75rem" width="50%" rounded="rounded-sm" />
		<Skeleton height="1rem" width="33%" rounded="rounded-sm" />
	</div>
</Card>
