<script lang="ts">
	// A Parking Lot group heading (#424; spec §Ideas grouping, D7): the 16px type
	// glyph plus the plural label. The type lives here, not on the idea cards.
	import MonoTypeIcon from '$lib/ui/MonoTypeIcon.svelte';
	import { IDEA_GROUP_LABEL, type IdeaGroupType } from '$lib/itinerary/idea-groups';

	let { type, class: klass = '' }: { type: IdeaGroupType; class?: string } = $props();
</script>

<h4 class="text-ink-soft flex items-center gap-1.5 pt-1 pb-1.5 text-xs font-semibold {klass}" data-idea-heading={type}>
	<MonoTypeIcon {type} size={16} />
	<span>{IDEA_GROUP_LABEL[type]}</span>
</h4>
