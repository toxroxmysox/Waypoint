<script lang="ts">
	// The gold open-loop chip (#420 strip, #426 day card): `Needs booking`. Gold means
	// "act on this", nothing else (CARD_SYSTEM D10). Same classes as CardStrip /
	// DayCard (5.81:1); extracted for new Row code, those two keep their inline copies.
	let { label = 'Needs booking' }: { label?: string } = $props();
</script>

<span
	class="bg-gold-tint border-gold/30 text-gold-deep inline-flex items-center gap-1 rounded-full border px-2 py-[1px] font-sans text-[11px] leading-4 font-semibold tracking-wide whitespace-nowrap uppercase"
	data-needs-booking
>
	<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 17h.01" />
	</svg>
	{label}
</span>
