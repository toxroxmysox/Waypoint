<script lang="ts">
	// A neutral initials bubble for Going (#419; spec §Going, CARD_SYSTEM D6/D10,
	// ADR-0011 2026-10-06 amendment). People are ink, never colour: the coloured
	// avatar *fallback* is retired on item cards as each card ticket adopts this.
	// An uploaded photo (#59/#106) is not retired: `img` shows it.
	//   Going      — ink-soft letter on surface-2 (8.4:1), a `line` ring.
	//   Not going  — the same bubble struck through on the diagonal, ink-muted
	//                letter (5.7:1). Never opacity: the letter stays >= 4.5:1.
	//   Placeholder — a member who hasn't joined yet: an empty dashed ring.
	//   Departed   — a removed member's tombstone (#133): dashed ring, user-minus
	//                glyph, never initials.
	//   No answer  — not rendered (the caller shows nobody).
	// The 2px surface border separates bubbles when a strip overlaps them; the
	// stack itself (order, overlap, max 3, "+n") belongs to the strip.
	let {
		name,
		initial,
		img,
		notGoing = false,
		placeholder = false,
		departed = false,
		size = 20
	}: {
		/** Display name; the accessible name is built from it. May be empty. */
		name: string;
		/** Defaults to the first letter of `name`, upper-cased. */
		initial?: string;
		/** An uploaded photo. Ignored for a placeholder or departed member. */
		img?: string;
		/** The struck "said they're not going" variant (#402 stores the state). */
		notGoing?: boolean;
		/** A member who hasn't joined yet. */
		placeholder?: boolean;
		/** A removed member's tombstone (#133). Wins over every other variant. */
		departed?: boolean;
		size?: number;
	} = $props();

	const who = $derived(name.trim());
	const ring = $derived(departed || placeholder);
	// Only a joined member can answer Going, so the ring variants ignore notGoing.
	const struck = $derived(notGoing && !ring);
	const letter = $derived((initial || who || '?').slice(0, 1).toUpperCase());
	const label = $derived.by(() => {
		if (departed) return who ? `${who} (removed)` : 'Removed member';
		const base = who || (placeholder ? 'Not joined yet' : 'Member');
		const joined = placeholder && who ? `${base}, not joined yet` : base;
		return struck ? `${joined}, not going` : joined;
	});
	const showImg = $derived(!!img && !ring);
	const bubbleStyle = $derived(
		[
			'box-sizing:border-box',
			`width:${size}px`,
			`height:${size}px`,
			`font-size:${Math.round(size * 0.55)}px`,
			'line-height:1',
			ring
				? 'border:1.5px dashed var(--color-ink-muted);background:var(--color-surface)'
				: 'border:2px solid var(--color-surface);background:var(--color-surface-2);box-shadow:inset 0 0 0 1px var(--color-line)',
			`color:var(${struck || ring ? '--color-ink-muted' : '--color-ink-soft'})`
		].join(';')
	);
</script>

<span
	class="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none"
	style={bubbleStyle}
	role="img"
	aria-label={label}
	title={label}
>
	{#if departed}
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			width={Math.round(size * 0.6)}
			height={Math.round(size * 0.6)}
			aria-hidden="true"
		>
			<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
			<circle cx="9" cy="7" r="4" />
			<line x1="17" y1="11" x2="23" y2="11" />
		</svg>
	{:else if showImg}
		<img
			src={img}
			alt=""
			loading="lazy"
			decoding="async"
			class="absolute inset-0 h-full w-full object-cover"
		/>
	{:else if !placeholder}
		{letter}
	{/if}
	{#if struck}
		<span
			class="pointer-events-none absolute"
			style="left:1px;right:1px;top:50%;height:1.5px;margin-top:-0.75px;background:var(--color-ink-soft);transform:rotate(-45deg);"
			aria-hidden="true"
		></span>
	{/if}
</span>
