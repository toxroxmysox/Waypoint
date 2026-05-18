<script lang="ts">
	let { label = 'Now' }: { label?: string } = $props();
</script>

<div class="flex items-center gap-3 py-2">
	<div class="bg-clay h-0.5 flex-1"></div>
	<span class="text-clay text-xs font-bold uppercase tracking-widest">{label}</span>
	<div class="bg-clay h-0.5 flex-1"></div>
</div>
