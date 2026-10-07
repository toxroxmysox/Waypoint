<script lang="ts">
	// The bare item-type glyph in `currentColor` — the one source of glyph paths,
	// shared by the legacy coloured `TypeIcon` and the monochrome `MonoTypeIcon`
	// (#419). It carries no colour, box or accessible name; its host does.
	import type { ItemType } from '$lib/types';

	let { type, size }: { type: ItemType; size: number } = $props();
</script>

{#if type === 'lodging'}
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M3 11 12 4l9 7" />
		<path d="M5 10v10h14V10" />
		<path d="M10 20v-5h4v5" />
	</svg>
{:else if type === 'transportation'}
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M3 12h14" />
		<path d="m13 6 6 6-6 6" />
	</svg>
{:else if type === 'flight'}
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path
			d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"
		/>
	</svg>
{:else if type === 'activity'}
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<circle cx="12" cy="12" r="9" />
		<path d="m9 12 2-5 4 6-2 4z" fill="currentColor" stroke="none" />
	</svg>
{:else if type === 'meal'}
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M7 3v18" />
		<path d="M5 3v6a2 2 0 0 0 4 0V3" />
		<path d="M17 3c-2 0-3 2-3 5s1 5 3 5v8" />
	</svg>
{:else if type === 'checklist'}
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<rect x="4" y="4" width="16" height="16" rx="3" />
		<path d="m8 12 3 3 5-6" />
	</svg>
{:else}
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M5 4h11l3 3v13H5z" />
		<path d="M8 10h8M8 14h8M8 18h5" />
	</svg>
{/if}
