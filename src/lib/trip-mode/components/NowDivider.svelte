<script lang="ts">
	let { label = 'Now' }: { label?: string } = $props();
</script>

<div class="flex items-center gap-3 py-2">
	<div class="bg-line h-px flex-1"></div>
	<span class="text-ink-muted text-xs font-semibold uppercase tracking-widest">{label}</span>
	<div class="bg-line h-px flex-1"></div>
</div>
