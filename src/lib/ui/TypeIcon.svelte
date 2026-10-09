<script lang="ts">
	// The legacy COLOURED type icon (a tinted circle per type). The card system
	// retires type colour (D10): item surfaces move to `MonoTypeIcon` in their
	// own tickets (#419 onward). Glyph paths live in `TypeGlyph`, shared by both.
	import type { ItemType } from '$lib/types';
	import TypeGlyph from './TypeGlyph.svelte';

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
		checklist: { bg: 'var(--color-moss-tint)', fg: 'var(--color-moss)' },
		flight: { bg: 'var(--color-sky-tint)', fg: 'var(--color-sky)' }
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
	<TypeGlyph {type} {sub} size={glyphSize} />
</span>
