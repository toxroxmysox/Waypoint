<script lang="ts">
	// Morning / Afternoon / Evening (#420; D9): centred on the screen with a rule on
	// either side. Not indented to the card column.
	let { label }: { label: string } = $props();
</script>

<div class="flex items-center gap-3 py-1" data-slot-divider>
	<div class="border-line flex-1 border-t"></div>
	<span class="text-ink-muted text-[11px] font-medium tracking-wider uppercase">{label}</span>
	<div class="border-line flex-1 border-t"></div>
</div>
