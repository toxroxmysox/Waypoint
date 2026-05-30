<script lang="ts">
	import type { ItemType } from '$lib/types';

	type Variant = 'soft' | 'square';

	let {
		type,
		sub,
		size = 32,
		variant = 'soft'
	}: {
		type: ItemType;
		sub?: string;
		size?: number;
		variant?: Variant;
	} = $props();

	// Color family per type (matches handoff: lodging=moss, transport=sky, activity=gold,
	// meal=clay, note/checklist=ink-soft).
	const palette: Record<ItemType, { bg: string; fg: string }> = {
		lodging: { bg: 'var(--color-sky-tint)', fg: 'var(--color-sky)' },
		transportation: { bg: 'var(--color-line)', fg: 'var(--color-ink)' },
		activity: { bg: 'var(--color-gold-tint)', fg: 'var(--color-gold)' },
		meal: { bg: 'var(--color-clay-tint)', fg: 'var(--color-clay)' },
		note: { bg: 'var(--color-paper)', fg: 'var(--color-ink-soft)' },
		checklist: { bg: 'var(--color-moss-tint)', fg: 'var(--color-moss)' }
	};

	const colors = $derived(palette[type]);
	const radius = $derived(variant === 'square' ? Math.round(size * 0.22) : size / 2);
	const glyphSize = $derived(Math.round(size * 0.55));
</script>

<span
	class="inline-flex items-center justify-center"
	style="width:{size}px;height:{size}px;border-radius:{radius}px;background:{colors.bg};color:{colors.fg};"
	aria-hidden="true"
	title={sub ?? type}
>
	{#if type === 'lodging'}
		<svg width={glyphSize} height={glyphSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M3 11 12 4l9 7" />
			<path d="M5 10v10h14V10" />
			<path d="M10 20v-5h4v5" />
		</svg>
	{:else if type === 'transportation'}
		<svg width={glyphSize} height={glyphSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M3 12h14" />
			<path d="m13 6 6 6-6 6" />
		</svg>
	{:else if type === 'activity'}
		<svg width={glyphSize} height={glyphSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="12" cy="12" r="9" />
			<path d="m9 12 2-5 4 6-2 4z" fill="currentColor" stroke="none" />
		</svg>
	{:else if type === 'meal'}
		<svg width={glyphSize} height={glyphSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M7 3v18" />
			<path d="M5 3v6a2 2 0 0 0 4 0V3" />
			<path d="M17 3c-2 0-3 2-3 5s1 5 3 5v8" />
		</svg>
	{:else if type === 'checklist'}
		<svg width={glyphSize} height={glyphSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<rect x="4" y="4" width="16" height="16" rx="3" />
			<path d="m8 12 3 3 5-6" />
		</svg>
	{:else}
		<svg width={glyphSize} height={glyphSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M5 4h11l3 3v13H5z" />
			<path d="M8 10h8M8 14h8M8 18h5" />
		</svg>
	{/if}
</span>
