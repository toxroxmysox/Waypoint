<script lang="ts">
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
</script>

<div class="flex items-center justify-between gap-3 px-4 py-3">
	<div class="min-w-0 flex-1 space-y-1.5">
		<Skeleton height="1rem" width="33%" />
		<Skeleton height="0.75rem" width="50%" rounded="rounded-sm" />
	</div>
	<Skeleton width="4rem" height="1.25rem" rounded="rounded-full" class="shrink-0" />
</div>
