<script lang="ts">
	let {
		initial = '',
		size = 32,
		placeholder = false,
		departed = false,
		img,
		alt = ''
	}: {
		initial?: string;
		size?: number;
		placeholder?: boolean;
		/** #133: a Departed Member tombstone — renders a distinct graphic, never initials. */
		departed?: boolean;
		img?: string;
		alt?: string;
	} = $props();

	const fontSize = $derived(Math.round(size * 0.42));
	const letter = $derived((initial || alt || '?').slice(0, 1).toUpperCase());
</script>

{#if departed}
	<!-- #133: tombstone variant. A muted dashed ring with a user-minus glyph —
	     unmistakably "no longer on the trip", and not an initials chip. -->
	<span
		class="border-ink-muted/40 text-ink-muted bg-ink-muted/10 inline-flex items-center justify-center rounded-full border border-dashed select-none"
		style="width:{size}px;height:{size}px;"
		aria-label={alt ? `${alt} (removed)` : 'Removed member'}
		title={alt ? `${alt} (removed)` : 'Removed member'}
	>
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			width={Math.round(size * 0.55)}
			height={Math.round(size * 0.55)}
			aria-hidden="true"
		>
			<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
			<circle cx="9" cy="7" r="4" />
			<line x1="17" y1="11" x2="23" y2="11" />
		</svg>
	</span>
{:else if img && !placeholder}
	<img
		src={img}
		{alt}
		width={size}
		height={size}
		loading="lazy"
		decoding="async"
		class="border-line inline-block rounded-full border object-cover"
		style="width:{size}px;height:{size}px;"
	/>
{:else}
	<span
		class="inline-flex items-center justify-center rounded-full font-semibold select-none {placeholder
			? 'border-ink-muted text-ink-muted border border-dashed bg-transparent'
			: 'bg-moss-tint text-moss border-moss/20 border'}"
		style="width:{size}px;height:{size}px;font-size:{fontSize}px;line-height:1;"
		aria-label={alt || letter}
	>
		{placeholder ? '' : letter}
	</span>
{/if}
