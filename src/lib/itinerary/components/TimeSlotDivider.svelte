<script lang="ts">
	// Morning / Afternoon / Evening (#420; D9): centred on the screen with a rule on
	// either side. Not indented to the card column.
	let { label }: { label: string } = $props();
</script>

<div class="flex items-center gap-3 py-1" data-slot-divider>
	<div class="flex-1 border-t border-line"></div>
	<span class="text-[11px] font-medium tracking-wider text-ink-muted uppercase">{label}</span>
	<div class="flex-1 border-t border-line"></div>
</div>
