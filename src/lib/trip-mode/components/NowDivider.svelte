<script lang="ts">
	let { label = 'Now' }: { label?: string } = $props();
</script>

<div class="flex items-center gap-3 py-2">
	<div class="h-px flex-1 bg-line"></div>
	<span class="text-xs font-semibold tracking-widest text-ink-muted uppercase">{label}</span>
	<div class="h-px flex-1 bg-line"></div>
</div>
