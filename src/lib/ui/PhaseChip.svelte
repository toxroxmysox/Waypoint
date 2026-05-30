<script lang="ts">
	let {
		name,
		color,
		size = 20
	}: {
		name: string;
		color?: string;
		size?: 16 | 18 | 20;
	} = $props();

	const letter = $derived(name.charAt(0).toUpperCase());
	const fontSize = $derived(size <= 16 ? 9 : size <= 18 ? 10 : 11);
</script>

<span
	class="inline-flex shrink-0 items-center justify-center rounded-full"
	style="width: {size}px; height: {size}px; background-color: {color || 'var(--color-ink-muted)'}; font-size: {fontSize}px;"
	aria-label="{name} phase"
	title={name}
>
	<span class="font-semibold leading-none text-white" aria-hidden="true">{letter}</span>
</span>
