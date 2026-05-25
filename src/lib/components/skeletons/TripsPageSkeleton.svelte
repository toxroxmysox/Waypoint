<script lang="ts">
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import TripCardSkeleton from './TripCardSkeleton.svelte';
</script>

<nav
	class="border-line bg-paper/95 sticky top-0 z-sticky flex items-center gap-3 border-b px-4 py-3 backdrop-blur"
	aria-hidden="true"
>
	<div class="w-10 shrink-0"></div>
	<div class="min-w-0 flex-1 text-center">
		<Skeleton height="1.25rem" width="5rem" class="mx-auto" />
	</div>
	<div class="w-10 shrink-0"></div>
</nav>

<div class="mx-auto w-full max-w-lg flex-1 space-y-6 px-4 pt-4 pb-8">
	<div class="space-y-3">
		<Skeleton height="0.75rem" width="6rem" rounded="rounded-sm" />
		<TripCardSkeleton />
		<TripCardSkeleton />
	</div>
	<div class="space-y-3">
		<Skeleton height="0.75rem" width="4rem" rounded="rounded-sm" />
		<TripCardSkeleton />
	</div>
</div>
