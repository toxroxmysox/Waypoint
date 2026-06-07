<script lang="ts">
	// Assign-a-member picker (issue #55). Wraps the shipped BottomSheet; the
	// design's member list (avatar + name + radio) + Unassign / Done, plus a
	// destructive "Delete task" (the ledger row has no inline delete, so it
	// lives here behind the ⋯ overflow).
	// Translated from design/lists-checklists/source-jsx → AssignContent.
	import { enhance } from '$app/forms';
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import Button from '$lib/ui/Button.svelte';
	import type { TripMember } from '$lib/types';

	let {
		open = $bindable(false),
		members,
		taskId,
		taskTitle,
		currentAssignee = '',
		assignAction,
		deleteAction
	}: {
		open?: boolean;
		members: TripMember[];
		taskId: string;
		taskTitle: string;
		currentAssignee?: string;
		assignAction: string;
		deleteAction: string;
	} = $props();

	let selected = $state('');

	// Re-seed the selection whenever the sheet targets a different task.
	$effect(() => {
		taskId;
		selected = currentAssignee;
	});

	function memberName(m: TripMember): string {
		return (
			m.display_name ||
			m.expand?.user?.name ||
			m.expand?.user?.email ||
			m.placeholder_name ||
			'Unknown'
		);
	}

	const closeOnDone = () => async ({ update }: { update: () => Promise<void> }) => {
		await update();
		open = false;
	};
</script>

<BottomSheet bind:open title="Assign a member">
	<p class="text-ink-muted mb-3 text-[12.5px]">{taskTitle}</p>

	<div class="flex flex-col gap-0.5" role="radiogroup" aria-label="Trip members">
		{#each members as m (m.id)}
			{@const on = selected === m.id}
			<button
				type="button"
				role="radio"
				aria-checked={on}
				onclick={() => (selected = m.id)}
				class="flex items-center gap-3 rounded-[10px] px-2.5 py-2.5 text-left {on ? 'bg-moss-tint' : ''}"
			>
				<Avatar initial={memberName(m).slice(0, 1)} alt={memberName(m)} size={32} />
				<span class="text-ink flex-1 text-sm font-semibold">{memberName(m)}</span>
				<span
					class="flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] {on
						? 'border-moss bg-moss text-paper'
						: 'border-line'}"
				>
					{#if on}
						<svg width="10" height="10" viewBox="0 0 12 12" fill="none">
							<path d="M2.5 6.2l2.3 2.3L9.5 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
					{/if}
				</span>
			</button>
		{/each}
	</div>

	<div class="mt-4 flex gap-2">
		<form method="POST" action={assignAction} use:enhance={closeOnDone} class="flex-1">
			<input type="hidden" name="task_id" value={taskId} />
			<input type="hidden" name="assignee" value="" />
			<Button type="submit" variant="outline" size="md" class="w-full">Unassign</Button>
		</form>
		<form method="POST" action={assignAction} use:enhance={closeOnDone} class="flex-1">
			<input type="hidden" name="task_id" value={taskId} />
			<input type="hidden" name="assignee" value={selected} />
			<Button type="submit" variant="moss" size="md" class="w-full">Done</Button>
		</form>
	</div>

	<form method="POST" action={deleteAction} use:enhance={closeOnDone} class="mt-3 text-center">
		<input type="hidden" name="task_id" value={taskId} />
		<button type="submit" class="text-ink-muted hover:text-clay text-xs font-medium">
			Delete task
		</button>
	</form>
</BottomSheet>
