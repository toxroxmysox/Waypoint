<script lang="ts">
	import { phasePalette } from '$lib/utils/phase-palette';

	let {
		name = 'color',
		value = $bindable('#3e5a3a')
	}: { name?: string; value?: string } = $props();
</script>

<fieldset>
	<legend class="text-ink-soft mb-1 text-sm font-medium">Color</legend>
	<div class="flex gap-2">
		{#each phasePalette as swatch}
			{@const selected = value.toLowerCase() === swatch.hex.toLowerCase()}
			<label
				class="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full ring-offset-2 transition {selected
					? 'ring-ink ring-2 ring-offset-1'
					: 'hover:ring-line hover:ring-1'}"
				style="background-color: {swatch.hex};"
				title={swatch.name}
			>
				<input
					type="radio"
					{name}
					value={swatch.hex}
					checked={selected}
					onchange={() => (value = swatch.hex)}
					class="sr-only"
				/>
				{#if selected}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M5 12l4 4 10-10" />
					</svg>
				{/if}
				<span class="sr-only">{swatch.name}</span>
			</label>
		{/each}
	</div>
</fieldset>
