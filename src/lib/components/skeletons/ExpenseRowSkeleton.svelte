<script lang="ts">
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
</script>

<div class="flex items-center gap-3 px-4 py-3">
	<Skeleton width="36px" height="36px" rounded="rounded-lg" class="shrink-0" />
	<div class="min-w-0 flex-1 space-y-1.5">
		<Skeleton height="1rem" width="66%" />
		<Skeleton height="0.75rem" width="40%" rounded="rounded-sm" />
	</div>
	<Skeleton width="4rem" height="1rem" rounded="rounded-sm" class="shrink-0" />
</div>
