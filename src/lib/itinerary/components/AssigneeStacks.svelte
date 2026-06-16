<script lang="ts">
	// Stacked assignee avatars for an item card (#224, ADR-0011). The card avatar
	// slot now denotes ASSIGNEES (who's doing this), not voters. Renders only when
	// the trip has >1 member (mirrors the existing assigned_to capture rule).
	// Tapping the bubbles opens the read-only view-names sheet. Lives OUTSIDE the
	// card's <a> (a button must never nest in an anchor) — mounted as a sibling
	// footer on each card surface.
	//
	// Slice 2 (#226) threads a `selfAssign` snippet through to the sheet for the
	// one-tap "+ Me" control; until then the sheet is a plain roster view.
	import Avatar from '$lib/ui/Avatar.svelte';
	import AssigneeViewSheet from './AssigneeViewSheet.svelte';
	import { memberDisplayName, memberInitial } from '$lib/itinerary/member-name';
	import type { TripMember } from '$lib/types';
	import type { Snippet } from 'svelte';

	let {
		itemTitle,
		assignedTo = [],
		members = [],
		size = 20,
		selfAssign
	}: {
		itemTitle: string;
		/** `assigned_to` — trip_members.id[] (NOT users.id). */
		assignedTo?: string[];
		members?: Array<TripMember & { avatarUrl?: string }>;
		size?: number;
		selfAssign?: Snippet;
	} = $props();

	// >1 member gate (ADR-0011): assignment is meaningless on a solo trip.
	const multiMember = $derived(members.length > 1);

	// Resolve each assigned id to its member, in assigned_to order. An id with no
	// roster match (e.g. a Departed Member the loader filtered out) becomes a
	// tombstone stand-in so the slot still reads honestly.
	const assignees = $derived(
		assignedTo.map((id) => {
			const m = members.find((mm) => mm.id === id);
			return (
				m ?? ({ id, removed_at: '1', display_name: '', placeholder_name: '' } as TripMember & {
					avatarUrl?: string;
				})
			);
		})
	);

	let sheetOpen = $state(false);
</script>

{#if multiMember && assignees.length > 0}
	<button
		type="button"
		class="flex -space-x-1.5 rounded-full"
		aria-label="{assignees.length} assigned — view who's on this"
		onclick={(e) => {
			e.preventDefault();
			e.stopPropagation();
			sheetOpen = true;
		}}
	>
		{#each assignees as m (m.id)}
			<span class="ring-surface rounded-full ring-2" title={memberDisplayName(m)}>
				<Avatar
					img={m.avatarUrl}
					initial={memberInitial(m)}
					alt={memberDisplayName(m)}
					placeholder={!m.user}
					departed={!!m.removed_at}
					{size}
				/>
			</span>
		{/each}
	</button>

	<AssigneeViewSheet bind:open={sheetOpen} {itemTitle} {assignees} {selfAssign} />
{/if}
