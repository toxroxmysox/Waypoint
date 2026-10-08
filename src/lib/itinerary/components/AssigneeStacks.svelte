<script lang="ts">
	// Stacked assignee avatars for an item card (#224, ADR-0011) + one-tap
	// self-assign (#226). The card avatar slot denotes ASSIGNEES (who's doing
	// this), not voters. Renders only when the trip has >1 member (mirrors the
	// existing assigned_to capture rule). Tapping the bubbles opens the view-names
	// sheet; inside it, a member (traveler/co_owner/owner — never a viewer) can tap
	// "+ Me" / "Remove me" to toggle their OWN assignment.
	//
	// Lives OUTSIDE the card's <a> (a button must never nest in an anchor) —
	// mounted as a sibling footer on each card surface.
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import Avatar from '$lib/ui/Avatar.svelte';
	import PersonBubble from '$lib/ui/PersonBubble.svelte';
	import { goingBubbles } from '$lib/itinerary/card-anatomy';
	import AssigneeViewSheet from './AssigneeViewSheet.svelte';
	import { memberDisplayName, memberInitial } from '$lib/itinerary/member-name';
	import { canSelfAssign, toggleAssignee } from '$lib/itinerary/assignment';
	import type { TripMember } from '$lib/types';

	let {
		itemId,
		itemTitle,
		assignedTo = [],
		members = [],
		size = 20,
		variant = 'legacy',
		notGoing = [],
		class: klass = ''
	}: {
		itemId: string;
		itemTitle: string;
		/** `assigned_to` — trip_members.id[] (NOT users.id). */
		assignedTo?: string[];
		members?: Array<TripMember & { avatarUrl?: string }>;
		size?: number;
		/** `strip` (#420): the Card's Going slot. Neutral PersonBubbles (max 3, then
		 *  `+n`), struck not-going bubbles after the going ones, no own padding. The
		 *  "+ Me" chip and the sheet are the same as `legacy`. */
		variant?: 'legacy' | 'strip';
		/** `not_going` — trip_members.id[] (#402). Shown only by the `strip` variant. */
		notGoing?: string[];
		/** Extra classes on the root row. The host card passes the in-border
		 *  padding/indent here so an empty footer collapses (the row renders only
		 *  when there's something to show — #231). */
		class?: string;
	} = $props();

	// Optimistic local copy of assigned_to. Seeded from the prop; the avatar pops
	// on/off immediately on toggle and snaps back if the write fails. Re-seeds when
	// the server value (prop) changes, e.g. after an invalidate/navigation.
	let optimistic = $state<string[]>(untrack(() => [...assignedTo]));
	$effect(() => {
		optimistic = [...assignedTo];
	});

	// >1 member gate (ADR-0011): assignment is meaningless on a solo trip.
	const multiMember = $derived(members.length > 1);

	// The caller's own membership (id + role) — same merged-page-data plumb the
	// rail uses. `assigned_to` holds trip_members.id, so we match on member id.
	const myMember = $derived(page.data?.membership as (TripMember | undefined));
	const myMemberId = $derived(myMember?.id ?? '');
	const mayToggle = $derived(canSelfAssign(myMember?.role) && !!myMemberId);
	const meAssigned = $derived(!!myMemberId && optimistic.includes(myMemberId));

	// Resolve each assigned id to its member, in assigned_to order. An id with no
	// roster match (e.g. a Departed Member the loader filtered out) becomes a
	// tombstone stand-in so the slot still reads honestly.
	const assignees = $derived(
		optimistic.map((id) => {
			const m = members.find((mm) => mm.id === id);
			return (
				m ?? ({ id, removed_at: '1', display_name: '', placeholder_name: '' } as TripMember & {
					avatarUrl?: string;
				})
			);
		})
	);

	let sheetOpen = $state(false);
	let pending = $state(false);
	let failed = $state(false);

	async function toggleSelf() {
		if (!mayToggle || pending) return;
		failed = false;
		const before = [...optimistic];
		// Optimistic pop — update the avatars immediately.
		optimistic = toggleAssignee(optimistic, myMemberId);
		pending = true;
		try {
			const res = await fetch(`/api/items/${itemId}/assign-self`, { method: 'POST' });
			if (!res.ok) throw new Error('write failed');
			const data = (await res.json()) as { assigned_to?: string[] };
			// Reconcile with the authoritative server array.
			if (Array.isArray(data.assigned_to)) optimistic = data.assigned_to;
		} catch {
			// Snap back and surface a retry cue — never a silent flicker.
			optimistic = before;
			failed = true;
		} finally {
			pending = false;
		}
	}
</script>

{#if multiMember && (assignees.length > 0 || mayToggle || (variant === 'strip' && notGoing.length > 0))}
	{#if variant === 'strip'}
		{@const bubbles = goingBubbles({ assigned_to: optimistic, not_going: notGoing })}
		<div class="flex items-center gap-2 {klass}">
			{#if assignees.length === 0 && mayToggle}
				<button
					type="button"
					class="border-line text-ink-muted hover:border-ink-muted active:border-ink-muted hover:text-ink-soft active:text-ink-soft relative inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] font-medium before:absolute before:-inset-x-1 before:-inset-y-3 before:content-['']"
					aria-label="Assign yourself to this item"
					onclick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						sheetOpen = true;
					}}
				>
					+ Me
				</button>
			{/if}
			{#if bubbles.shown.length > 0}
				<button
					type="button"
					class="relative flex items-center rounded-full before:absolute before:-inset-x-2 before:-inset-y-3 before:content-['']"
					aria-label="{assignees.length} going — view who's on this"
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
			{/if}
		</div>
	{:else}
	<div class="mt-1.5 flex items-center gap-2 pl-1 {klass}">
	{#if assignees.length > 0}
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
	{:else if mayToggle}
		<!-- No one assigned yet, but the caller can join: a faint "+ Me" target. -->
		<button
			type="button"
			class="border-line text-ink-muted hover:border-ink-muted active:border-ink-muted hover:text-ink-soft active:text-ink-soft inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] font-medium"
			aria-label="Assign yourself to this item"
			onclick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				sheetOpen = true;
			}}
		>
			+ Me
		</button>
	{/if}
	</div>
	{/if}

	<AssigneeViewSheet bind:open={sheetOpen} {itemTitle} {assignees}>
		{#snippet selfAssign()}
			{#if mayToggle}
				<button
					type="button"
					onclick={toggleSelf}
					disabled={pending}
					class="flex w-full items-center justify-center gap-2 rounded-[10px] px-3 py-2.5 text-sm font-semibold disabled:opacity-60 {meAssigned
						? 'border-line text-ink-soft hover:text-ink active:text-ink border'
						: 'bg-moss text-paper'}"
				>
					{#if meAssigned}
						Remove me
					{:else}
						+ Me
					{/if}
				</button>
				{#if failed}
					<button
						type="button"
						onclick={toggleSelf}
						class="text-clay mt-2 w-full text-center text-xs font-medium"
					>
						Couldn't add you — tap to retry
					</button>
				{/if}
			{/if}
		{/snippet}
	</AssigneeViewSheet>
{/if}
