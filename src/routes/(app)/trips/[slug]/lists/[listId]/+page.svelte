<script lang="ts">
	import { enhance } from '$app/forms';
	import NavBar from '$lib/ui/NavBar.svelte';
	import PhaseChip from '$lib/ui/PhaseChip.svelte';
	import ProgressDonut from '$lib/itinerary/components/ProgressDonut.svelte';
	import ChecklistBody from '$lib/itinerary/components/ChecklistBody.svelte';
	import AssignMemberSheet from '$lib/itinerary/components/AssignMemberSheet.svelte';
	import type { Phase, Task } from '$lib/types';

	let { data } = $props();

	const phaseName = $derived(
		data.checklist.phase
			? (data.phases.find((p: Phase) => p.id === data.checklist.phase)?.name ?? null)
			: null
	);
	const doneCount = $derived(data.tasks.filter((t: Task) => t.checked).length);
	const leftCount = $derived(data.tasks.length - doneCount);

	let assignOpen = $state(false);
	let activeTask = $state<Task | null>(null);
	function openAssign(task: Task) {
		activeTask = task;
		assignOpen = true;
	}

	let renaming = $state(false);
	let confirmDeleteList = $state(false);
</script>

<NavBar
	title={data.checklist.title}
	subtitle={phaseName ?? 'Whole trip'}
	back
	backHref="/trips/{data.trip.slug}/lists"
/>

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8">
	<!-- Stat strip -->
	<div class="mb-4 flex items-center gap-3.5 px-0.5">
		<ProgressDonut done={doneCount} total={data.tasks.length} size={46} stroke={5} />
		<div class="flex-1">
			<span
				class="border-line bg-surface-2 text-ink-soft inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-1.5 text-[10.5px] font-semibold tracking-wide"
			>
				{#if phaseName}
					<PhaseChip name={phaseName} size={16} />
					{phaseName}
				{:else}
					<svg width="11" height="11" viewBox="0 0 20 20" fill="none">
						<path d="M10 2L11.5 7L16 8L11.5 9L10 14L8.5 9L4 8L8.5 7L10 2z" fill="var(--color-ink-soft)" />
					</svg>
					Whole trip
				{/if}
			</span>
			<div class="text-ink-muted mt-1.5 text-[12.5px]">
				<span class="text-ink font-mono font-semibold">{leftCount}</span>
				{leftCount === 1 ? 'task left' : 'tasks left'}
			</div>
		</div>
	</div>

	<ChecklistBody
		tasks={data.tasks}
		members={data.members}
		checklistId={data.checklist.id}
		toggleAction="?/toggleTask"
		addAction="?/addTask"
		showControls
		onAssign={openAssign}
	/>

	<!-- List management -->
	<div class="mt-5 flex items-center gap-4 px-1">
		{#if renaming}
			<form
				method="POST"
				action="?/rename"
				use:enhance={() => async ({ update }) => {
					await update();
					renaming = false;
				}}
				class="flex flex-1 items-center gap-2"
			>
				<input
					name="title"
					value={data.checklist.title}
					required
					class="border-line bg-surface text-ink flex-1 rounded-md border px-2 py-1 text-sm"
				/>
				<button type="submit" class="text-moss text-xs font-semibold">Save</button>
				<button type="button" onclick={() => (renaming = false)} class="text-ink-muted text-xs">Cancel</button>
			</form>
		{:else}
			<button type="button" onclick={() => (renaming = true)} class="text-ink-muted hover:text-ink-soft text-xs font-medium">
				Rename list
			</button>
			{#if !confirmDeleteList}
				<button type="button" onclick={() => (confirmDeleteList = true)} class="text-ink-muted hover:text-error text-xs font-medium">
					Delete list
				</button>
			{:else}
				<form method="POST" action="?/deleteList" use:enhance class="flex items-center gap-2">
					<span class="text-ink-muted text-xs">Delete this list?</span>
					<button type="submit" class="text-error text-xs font-semibold">Confirm</button>
					<button type="button" onclick={() => (confirmDeleteList = false)} class="text-ink-muted text-xs">Cancel</button>
				</form>
			{/if}
		{/if}
	</div>
</main>

{#if activeTask}
	<AssignMemberSheet
		bind:open={assignOpen}
		members={data.members}
		taskId={activeTask.id}
		taskTitle={activeTask.title}
		currentAssignee={activeTask.assignee ?? ''}
		assignAction="?/assignTask"
		deleteAction="?/deleteTask"
	/>
{/if}
