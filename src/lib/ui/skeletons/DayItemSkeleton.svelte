<script lang="ts">
	import Card from '$lib/ui/Card.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
</script>

<Card>
	<div class="flex items-center gap-3 p-3">
		<Skeleton width="32px" height="32px" rounded="rounded-full" class="shrink-0" />
		<div class="min-w-0 flex-1 space-y-1.5">
			<Skeleton height="1rem" width="75%" />
			<Skeleton height="0.75rem" width="50%" rounded="rounded-sm" />
		</div>
	</div>
</Card>
