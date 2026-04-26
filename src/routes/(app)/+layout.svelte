<script lang="ts">
	let { children } = $props();
</script>

<div class="bg-paper text-ink flex min-h-dvh flex-col">
	{@render children()}
</div>
