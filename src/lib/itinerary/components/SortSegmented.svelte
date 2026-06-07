<script lang="ts">
	// Segmented sort control ("In order / Done last") for the checklist detail
	// (#49). surface-2 track, white selected thumb with a soft shadow.
	// Translated from design/lists-checklists/source-jsx → Segmented.
	let {
		value = $bindable('order'),
		options
	}: {
		value: string;
		options: Array<[string, string]>;
	} = $props();
</script>

<div class="border-line bg-surface-2 inline-flex rounded-full border p-0.5">
	{#each options as [key, label] (key)}
		{@const on = key === value}
		<button
			type="button"
			onclick={() => (value = key)}
			aria-pressed={on}
			class="rounded-full px-[11px] py-[5px] text-[11.5px] font-semibold transition-colors {on
				? 'bg-surface text-ink shadow-card'
				: 'text-ink-muted'}"
		>
			{label}
		</button>
	{/each}
</div>
