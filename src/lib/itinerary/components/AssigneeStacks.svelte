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
	import AssigneeViewSheet from './AssigneeViewSheet.svelte';
	import { memberDisplayName, memberInitial } from '$lib/itinerary/member-name';
	import { canSelfAssign, toggleAssignee } from '$lib/itinerary/assignment';
	import type { TripMember } from '$lib/types';

	let {
		itemId,
		itemTitle,
		assignedTo = [],
		members = [],
		size = 20
	}: {
		itemId: string;
		itemTitle: string;
		/** `assigned_to` — trip_members.id[] (NOT users.id). */
		assignedTo?: string[];
		members?: Array<TripMember & { avatarUrl?: string }>;
		size?: number;
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

{#if multiMember && (assignees.length > 0 || mayToggle)}
	<div class="mt-1.5 flex items-center gap-2 pl-1">
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
			class="border-line text-ink-muted hover:border-ink-muted hover:text-ink-soft inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] font-medium"
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

	<AssigneeViewSheet bind:open={sheetOpen} {itemTitle} {assignees}>
		{#snippet selfAssign()}
			{#if mayToggle}
				<button
					type="button"
					onclick={toggleSelf}
					disabled={pending}
					class="flex w-full items-center justify-center gap-2 rounded-[10px] px-3 py-2.5 text-sm font-semibold disabled:opacity-60 {meAssigned
						? 'border-line text-ink-soft hover:text-ink border'
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
