<script lang="ts">
	// The card system's MONOCHROME type icon (#419; spec §Colour, CARD_SYSTEM D10).
	// Type is told apart by glyph, never by colour, so colour stays free to mean
	// "act on this". Three sizes only (D10 "from 11 sizes to 3"):
	//   16 — the bare glyph (Row, group heading)
	//   24 — a 24px disc around a 16px glyph (rail node, Span)
	//   40 — a 40px disc around a 26px glyph (Hero)
	// Disc variants: `plain` (ink-soft glyph on surface-2, `line` ring), `dashed`
	// (untimed: ink-muted glyph and dashed ink-muted ring on surface), `filled`
	// (the Hero while ongoing: accent fill, surface glyph). The bare glyph ignores
	// `variant`. Decorative unless `label` is given: a card's accessible name
	// already carries its type.
	import type { ItemType } from '$lib/types';
	import TypeGlyph from './TypeGlyph.svelte';

	let {
		type,
		size,
		variant = 'plain',
		label
	}: {
		type: ItemType;
		size: 16 | 24 | 40;
		variant?: 'plain' | 'dashed' | 'filled';
		label?: string;
	} = $props();

	const glyph = $derived(size === 40 ? 26 : 16);

	// Inline styles from tokens (never interpolated Tailwind classes). Box sizes
	// include the ring, so a 24 disc is 24px whatever its variant.
	const discStyle = $derived(
		{
			plain:
				'background:var(--color-surface-2);color:var(--color-ink-soft);border:1px solid var(--color-line);',
			dashed:
				'background:var(--color-surface);color:var(--color-ink-muted);border:1.5px dashed var(--color-ink-muted);',
			filled:
				'background:var(--color-accent);color:var(--color-surface);border:1px solid var(--color-accent);'
		}[variant]
	);
</script>

{#if size === 16}
	<span
		class="inline-flex shrink-0 items-center justify-center"
		style="width:16px;height:16px;color:var(--color-ink-soft);"
		role={label ? 'img' : undefined}
		aria-label={label}
		aria-hidden={label ? undefined : 'true'}
	>
		<TypeGlyph {type} size={16} />
	</span>
{:else}
	<span
		class="inline-flex shrink-0 items-center justify-center rounded-full"
		style="box-sizing:border-box;width:{size}px;height:{size}px;{discStyle}"
		role={label ? 'img' : undefined}
		aria-label={label}
		aria-hidden={label ? undefined : 'true'}
	>
		<TypeGlyph {type} size={glyph} />
	</span>
{/if}
