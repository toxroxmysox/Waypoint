<script lang="ts">
	// "What we considered" (#436; spec story 57, CARD_SYSTEM D2/D11): the things the group
	// weighed and did not do, as Rows grouped by type under the Parking Lot's group
	// headings (`ideaGroups`, #424). Read-only: no link, no outcome stamp. Shared by the
	// member Record view and the public archive page.
	import Row from '$lib/ui/Row.svelte';
	import IdeaGroupHeading from '$lib/itinerary/components/IdeaGroupHeading.svelte';
	import FlightSubLine from '$lib/itinerary/components/FlightSubLine.svelte';
	import { ideaGroups } from '$lib/itinerary/idea-groups';
	import { rowContent, type RowContentItem } from '$lib/itinerary/row';
	import type { ItemType } from '$lib/itinerary/types';
	import type { Phase } from '$lib/types';

	type ConsideredItem = RowContentItem & {
		id: string;
		phase: string;
		type: ItemType;
		subtype: string;
		title: string;
		sort_order?: number;
	};

	let { items, phases = [] }: { items: ConsideredItem[]; phases?: Phase[] } = $props();

	const phaseName = $derived(new Map(phases.map((p) => [p.id, p.name])));
	const groups = $derived(
		ideaGroups(
			items.map((i) => ({ ...i, sort_order: i.sort_order ?? 0 })),
			(i) => i.type
		)
	);
</script>

<div class="space-y-3" data-considered>
	{#each groups as group (group.type)}
		<div data-considered-group={group.type}>
			<IdeaGroupHeading type={group.type} />
			<div class="border-line bg-surface shadow-card rounded-lg border px-4">
				{#each group.items as item, i (item.id)}
					{@const content = rowContent(item, { phaseName: phaseName.get(item.phase) })}
					{#snippet subline()}
						{#if content.flight}<FlightSubLine sub={content.flight} />{/if}
					{/snippet}
					<Row
						type={item.type}
						subtype={item.subtype}
						title={item.title}
						sub={content.sub}
						subline={content.flight ? subline : undefined}
						divider={i < group.items.length - 1}
					/>
				{/each}
			</div>
		</div>
	{/each}
</div>
