<script lang="ts">
	import Card from '$lib/ui/Card.svelte';

	let {
		completedCount,
		totalCount
	}: {
		completedCount: number;
		totalCount: number;
	} = $props();
</script>

<section>
	<Card>
		<div class="p-6 text-center">
			<p class="text-ink font-display text-xl font-semibold">Day wrapped</p>
			{#if totalCount > 0}
				<p class="text-ink-muted mt-2 text-sm">
					{completedCount} of {totalCount} {totalCount === 1 ? 'item' : 'items'} completed
				</p>
			{:else}
				<p class="text-ink-muted mt-2 text-sm">Nothing was scheduled for today.</p>
			{/if}
		</div>
	</Card>
</section>
