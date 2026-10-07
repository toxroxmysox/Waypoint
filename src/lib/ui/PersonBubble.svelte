<script lang="ts">
	// A neutral initials bubble for Going (#419; spec §Going, CARD_SYSTEM D6/D10,
	// ADR-0011 2026-10-06 amendment). People are ink, never colour: the coloured
	// avatar fallback is retired on item cards as each card ticket adopts this.
	//   Going      — ink-soft letter on surface-2 (8.4:1), a `line` ring.
	//   Not going  — the same bubble struck through on the diagonal, ink-muted
	//                letter (5.7:1). Never opacity: the letter stays >= 4.5:1.
	//   No answer  — not rendered (the caller shows nobody).
	// The 2px surface border separates bubbles when a strip overlaps them; the
	// stack itself (order, overlap, max 3, "+n") belongs to the strip.
	let {
		name,
		initial,
		notGoing = false,
		size = 20
	}: {
		/** Display name; the accessible name is built from it. */
		name: string;
		/** Defaults to the first letter of `name`, upper-cased. */
		initial?: string;
		/** The struck "said they're not going" variant (#402 stores the state). */
		notGoing?: boolean;
		size?: number;
	} = $props();

	const letter = $derived((initial || name || '?').slice(0, 1).toUpperCase());
	const label = $derived(notGoing ? `${name}, not going` : name);
</script>

<span
	class="relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none"
	style="box-sizing:border-box;width:{size}px;height:{size}px;font-size:{Math.round(size * 0.55)}px;line-height:1;border:2px solid var(--color-surface);background:var(--color-surface-2);box-shadow:inset 0 0 0 1px var(--color-line);color:{notGoing
		? 'var(--color-ink-muted)'
		: 'var(--color-ink-soft)'};"
	role="img"
	aria-label={label}
	title={label}
>
	{letter}
	{#if notGoing}
		<span
			class="pointer-events-none absolute"
			style="left:1px;right:1px;top:50%;height:1.5px;margin-top:-0.75px;background:var(--color-ink-soft);transform:rotate(-45deg);"
			aria-hidden="true"
		></span>
	{/if}
</span>
