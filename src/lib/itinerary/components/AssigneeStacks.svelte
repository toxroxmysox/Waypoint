<script lang="ts">
	// The Card's Going slot (#224/#420, ADR-0011; CARD_SYSTEM D6): neutral
	// PersonBubbles for who's going (max 3, then `+n`), then struck bubbles for
	// who said they're not going. No answer is never shown. Renders only when the
	// trip has >1 member. Tapping the bubbles opens the who's-on-this sheet.
	// Display only: members answer from inside the item (#440 "Are you going?"),
	// so the old "+ Me" chip and the sheet's self-assign are retired.
	//
	// Lives OUTSIDE the card's <a> (a button must never nest in an anchor) —
	// mounted as a sibling footer on each card surface.
	import PersonBubble from '$lib/ui/PersonBubble.svelte';
	import { goingBubbles } from '$lib/itinerary/card-anatomy';
	import AssigneeViewSheet from './AssigneeViewSheet.svelte';
	import { memberDisplayName } from '$lib/itinerary/member-name';
	import type { TripMember } from '$lib/types';

	let {
		itemTitle,
		assignedTo = [],
		notGoing = [],
		members = [],
		size = 20,
		class: klass = ''
	}: {
		itemTitle: string;
		/** `assigned_to` — trip_members.id[] (NOT users.id). */
		assignedTo?: string[];
		/** `not_going` — trip_members.id[] (#402). */
		notGoing?: string[];
		members?: Array<TripMember & { avatarUrl?: string }>;
		size?: number;
		/** Extra classes on the root row (the host card's in-border padding/indent). */
		class?: string;
	} = $props();

	// >1 member gate (ADR-0011): going is meaningless on a solo trip.
	const multiMember = $derived(members.length > 1);

	const bubbles = $derived(goingBubbles({ assigned_to: assignedTo, not_going: notGoing }));
	const goingCount = $derived(assignedTo.length);

	// An id with no roster match (a Departed Member the loader filtered out) becomes a
	// tombstone stand-in so the slot still reads honestly.
	const resolve = (id: string) =>
		members.find((mm) => mm.id === id) ??
		({ id, removed_at: '1', display_name: '', placeholder_name: '' } as TripMember & { avatarUrl?: string });
	const going = $derived(assignedTo.map(resolve));
	const notGoingMembers = $derived(notGoing.map(resolve));

	let sheetOpen = $state(false);
</script>

{#if multiMember && bubbles.shown.length > 0}
	<div class="flex items-center gap-2 {klass}">
		<button
			type="button"
			class="relative flex items-center rounded-full before:absolute before:-inset-x-2 before:-inset-y-3 before:content-['']"
			aria-label="{goingCount} going — view who's on this"
			onclick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				sheetOpen = true;
			}}
		>
			<span class="flex -space-x-1.5">
				{#each bubbles.shown as b (b.memberId)}
					{@const m = members.find((mm) => mm.id === b.memberId)}
					<PersonBubble
						name={m ? memberDisplayName(m) : ''}
						img={m?.avatarUrl}
						notGoing={b.notGoing}
						placeholder={!!m && !m.user}
						departed={!m || !!m.removed_at}
						{size}
					/>
				{/each}
			</span>
			{#if bubbles.extra > 0}
				<span class="text-ink-soft ml-1 text-[11px] font-semibold">+{bubbles.extra}</span>
			{/if}
		</button>
	</div>

	<AssigneeViewSheet bind:open={sheetOpen} {itemTitle} {going} notGoing={notGoingMembers} />
{/if}
