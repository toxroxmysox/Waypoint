<script lang="ts">
	let {
		initial = '',
		size = 32,
		placeholder = false,
		img,
		alt = ''
	}: {
		initial?: string;
		size?: number;
		placeholder?: boolean;
		img?: string;
		alt?: string;
	} = $props();

	const fontSize = $derived(Math.round(size * 0.42));
	const letter = $derived((initial || alt || '?').slice(0, 1).toUpperCase());
</script>

{#if img && !placeholder}
	<img
		src={img}
		{alt}
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
