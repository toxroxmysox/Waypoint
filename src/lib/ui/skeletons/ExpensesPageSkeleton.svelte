<script lang="ts">
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import Card from '$lib/ui/Card.svelte';
	import ExpenseRowSkeleton from './ExpenseRowSkeleton.svelte';
</script>

<nav
	class="border-line bg-paper/95 sticky top-0 z-sticky flex items-center gap-3 border-b px-4 py-3 backdrop-blur"
	aria-hidden="true"
>
	<div class="w-10 shrink-0">
		<Skeleton width="2rem" height="2rem" rounded="rounded-full" />
	</div>
	<div class="min-w-0 flex-1 text-center">
		<Skeleton height="1.25rem" width="6rem" class="mx-auto" />
		<Skeleton height="0.75rem" width="4rem" class="mx-auto mt-1" rounded="rounded-sm" />
	</div>
	<div class="w-10 shrink-0"></div>
</nav>

<div class="mx-auto w-full max-w-lg flex-1 space-y-6 px-4 pt-4 pb-8">
	<Card>
		<div class="divide-line divide-y">
			<ExpenseRowSkeleton />
			<ExpenseRowSkeleton />
			<ExpenseRowSkeleton />
			<ExpenseRowSkeleton />
		</div>
	</Card>
</div>
