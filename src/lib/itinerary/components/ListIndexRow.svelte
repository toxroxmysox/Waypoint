<script lang="ts">
	// One checklist row on the Lists index (#49). Monogram (trip = star on
	// surface-2; phase = moss PhaseChip) · title · scope subtitle · assignee
	// avatar stack · progress donut. Links to the checklist detail.
	// Translated from design/lists-checklists/source-jsx → IndexRow.
	import Avatar from '$lib/ui/Avatar.svelte';
	import PhaseChip from '$lib/ui/PhaseChip.svelte';
	import ProgressDonut from '$lib/itinerary/components/ProgressDonut.svelte';

	let {
		title,
		phaseName = null,
		done,
		total,
		assignees = [],
		href,
		divider = true
	}: {
		title: string;
		phaseName?: string | null;
		done: number;
		total: number;
		assignees?: Array<{ initial: string; name: string; img?: string }>;
		href: string;
		divider?: boolean;
	} = $props();

	const shown = $derived(assignees.slice(0, 3));
	const extra = $derived(assignees.length - shown.length);
</script>

<a
	{href}
	class="hover:bg-surface-2 flex items-center gap-3 px-[15px] py-[13px] {divider ? 'border-line border-b' : ''}"
>
	{#if phaseName}
		<PhaseChip name={phaseName} size={20} />
	{:else}
		<span
			class="border-line bg-surface-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
		>
			<svg width="14" height="14" viewBox="0 0 20 20" fill="none">
				<path d="M10 2L11.5 7L16 8L11.5 9L10 14L8.5 9L4 8L8.5 7L10 2z" fill="var(--color-ink-soft)" />
			</svg>
		</span>
	{/if}

	<div class="min-w-0 flex-1">
		<div class="text-ink truncate text-[14.5px] leading-tight font-semibold">{title}</div>
		<div class="text-ink-muted mt-0.5 text-[11px] tracking-wide">
			{phaseName ?? 'Whole trip'}
		</div>
	</div>

	{#if shown.length > 0}
		<span class="flex shrink-0 items-center">
			{#each shown as a, i (i)}
				<span
					class="ring-surface inline-flex rounded-full ring-[1.5px]"
					style="margin-left:{i === 0 ? 0 : -6}px;"
				>
					<Avatar img={a.img} initial={a.initial} alt={a.name} size={19} />
				</span>
			{/each}
			{#if extra > 0}
				<span
					class="border-line bg-surface-2 text-ink-muted ring-surface inline-flex h-[19px] w-[19px] items-center justify-center rounded-full border text-[7px] font-bold ring-[1.5px]"
					style="margin-left:-6px;"
				>
					+{extra}
				</span>
			{/if}
		</span>
	{/if}

	<ProgressDonut {done} {total} size={33} stroke={3.5} />
</a>
