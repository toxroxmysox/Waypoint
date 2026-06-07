<script lang="ts">
	// Checklist body (#49) — ruled Card of TaskRows with an inline add-row, plus
	// optional "In order / Done last" sort + "Hide done" controls. Holds the
	// view-state; task mutations are progressive-enhancement forms whose actions
	// are passed in, so the same body serves the detail screen and (later) others.
	// Translated from design/lists-checklists/source-jsx → ChecklistBody.
	import { enhance } from '$app/forms';
	import Card from '$lib/ui/Card.svelte';
	import TaskRow from '$lib/itinerary/components/TaskRow.svelte';
	import SortSegmented from '$lib/itinerary/components/SortSegmented.svelte';
	import TogglePill from '$lib/itinerary/components/TogglePill.svelte';
	import { memberDisplayName, memberInitial } from '$lib/itinerary/member-name';
	import type { Task, TripMember } from '$lib/types';

	let {
		tasks,
		members,
		checklistId,
		toggleAction,
		addAction,
		showControls = true,
		addLabel = 'Add task',
		onAssign
	}: {
		tasks: Task[];
		members: TripMember[];
		checklistId: string;
		toggleAction: string;
		addAction: string;
		showControls?: boolean;
		addLabel?: string;
		onAssign?: (task: Task) => void;
	} = $props();

	let sort = $state<'order' | 'last'>('order');
	let hideDone = $state(false);

	function memberFor(id: string): TripMember | undefined {
		return members.find((m) => m.id === id);
	}

	const visibleTasks = $derived.by(() => {
		let arr = tasks;
		if (sort === 'last') {
			arr = [...tasks.filter((t) => !t.checked), ...tasks.filter((t) => t.checked)];
		}
		if (hideDone) arr = arr.filter((t) => !t.checked);
		return arr;
	});
</script>

{#if showControls}
	<div class="mb-2.5 flex flex-wrap items-center justify-between gap-2.5 px-0.5">
		<SortSegmented
			bind:value={sort}
			options={[
				['order', 'In order'],
				['last', 'Done last']
			]}
		/>
		<TogglePill bind:on={hideDone}>Hide done</TogglePill>
	</div>
{/if}

<Card>
	<div class="px-4">
		{#each visibleTasks as task, i (task.id)}
			<TaskRow
				taskId={task.id}
				title={task.title}
				checked={task.checked}
				{toggleAction}
				assigneeInitial={task.assignee ? memberInitial(memberFor(task.assignee)) : null}
				assigneeAlt={task.assignee ? memberDisplayName(memberFor(task.assignee)) : ''}
				onAssign={() => onAssign?.(task)}
				divider={i < visibleTasks.length - 1}
			/>
		{/each}
		{#if visibleTasks.length === 0}
			<p class="text-ink-muted py-3 text-xs italic">
				{tasks.length === 0 ? 'Nothing on this list.' : 'All done — nothing left to show.'}
			</p>
		{/if}
	</div>

	<div class="border-line border-t px-4">
		<form
			method="POST"
			action={addAction}
			use:enhance={() =>
				async ({ result, update, formElement }) => {
					await update({ reset: false });
					if (result.type === 'success') formElement.reset();
				}}
			class="flex items-center gap-3 py-2.5"
		>
			<input type="hidden" name="checklist_id" value={checklistId} />
			<span
				class="border-moss text-moss flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] border-dashed"
			>
				<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
					<path d="M6 2.5v7M2.5 6h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
				</svg>
			</span>
			<input
				type="text"
				name="title"
				required
				placeholder={addLabel}
				class="text-ink placeholder:text-moss flex-1 bg-transparent text-sm font-medium focus:outline-none"
			/>
		</form>
	</div>
</Card>
