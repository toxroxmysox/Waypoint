<script lang="ts">
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import { titleCase, formatTime } from '$lib/shell/format';
	import type { Day, Phase, ItemType } from '$lib/types';

	type SanitizedItem = {
		id: string;
		day: string;
		phase: string;
		slot: string;
		type: ItemType;
		subtype: string;
		title: string;
		description: string;
		location_name: string;
		location_address: string;
		start_time: string | null;
		end_time: string | null;
		status: string;
	};

	let {
		day,
		items,
		phases
	}: {
		day: Day;
		items: SanitizedItem[];
		phases: Phase[];
	} = $props();

	const phaseMap = $derived(new Map(phases.map((p) => [p.id, p])));

	const dayDate = $derived(
		new Date(day.date.replace(' ', 'T')).toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'long',
			day: 'numeric'
		})
	);

	const dayPhase = $derived.by(() => {
		if (!day.phases || day.phases.length === 0) return null;
		return phaseMap.get(day.phases[0]) || null;
	});

	const slotOrder = ['morning', 'afternoon', 'evening', 'anytime'] as const;

	const itemsBySlot = $derived.by(() => {
		const grouped = new Map<string, SanitizedItem[]>();
		for (const slot of slotOrder) {
			const slotItems = items.filter((i) => (i.slot || 'anytime') === slot);
			if (slotItems.length > 0) grouped.set(slot, slotItems);
		}
		return grouped;
	});
</script>

<section class="bg-surface border-border overflow-hidden rounded-xl border shadow-sm">
	<div class="flex items-center gap-3 border-b border-border/50 px-4 py-3">
		<div>
			<h3 class="text-ink text-base font-semibold">{dayDate}</h3>
			{#if dayPhase}
				<span
					class="mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
					style="background-color: {dayPhase.color || 'var(--color-line)'}20; color: {dayPhase.color || 'var(--color-ink-muted)'}"
				>
					{dayPhase.name}
				</span>
			{/if}
		</div>
	</div>

	{#if items.length === 0}
		<p class="text-ink-muted px-4 py-4 text-center text-sm">Rest day</p>
	{:else}
		{#each slotOrder as slot}
			{@const slotItems = itemsBySlot.get(slot)}
			{#if slotItems && slotItems.length > 0}
				<div>
					<div class="bg-surface-2 px-4 py-1.5">
						<span class="text-ink-muted text-xs font-medium uppercase tracking-wide">{titleCase(slot)}</span>
					</div>
					{#each slotItems as item (item.id)}
						<div class="flex items-start gap-3 border-b border-border/30 px-4 py-3 last:border-b-0">
							<TypeIcon type={item.type} size={24} />
							<div class="min-w-0 flex-1">
								<p class="text-ink text-sm font-medium">{item.title}</p>
								{#if item.location_name}
									<p class="text-ink-muted text-xs">{item.location_name}</p>
								{/if}
								{#if item.start_time}
									<p class="text-ink-muted text-xs">
										{formatTime(item.start_time)}{#if item.end_time} – {formatTime(item.end_time)}{/if}
									</p>
								{/if}
								{#if item.description}
									<p class="text-ink-muted mt-1 text-xs">{item.description}</p>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/each}
	{/if}
</section>
