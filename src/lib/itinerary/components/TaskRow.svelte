<script lang="ts">
	// Art direction B "Ledger" task row (issue #55). Square checkbox + text
	// (strike + dim in place when done) + ⋯ overflow + single assignee avatar.
	// Translated from design/lists-checklists/source-jsx → TaskLedgerRow.
	//
	// Presentational: the toggle is a real progressive-enhancement form (the
	// action is passed in, so #49's list detail can reuse this with its own
	// action). The ⋯ overflow is a JS callback — a member picker is inherently
	// interactive — which the parent wires to AssignMemberSheet.
	import { enhance } from '$app/forms';
	import Avatar from '$lib/ui/Avatar.svelte';

	let {
		taskId,
		title,
		checked,
		toggleAction,
		assigneeInitial = null,
		assigneeAlt = '',
		assigneeImg = '',
		assignable = true,
		divider = true,
		onAssign
	}: {
		taskId: string;
		title: string;
		checked: boolean;
		toggleAction: string;
		assigneeInitial?: string | null;
		assigneeAlt?: string;
		assigneeImg?: string;
		assignable?: boolean;
		divider?: boolean;
		onAssign?: () => void;
	} = $props();
</script>

<div
	class="flex items-center gap-3 py-3 {divider ? 'border-line border-b' : ''}"
>
	<form method="POST" action={toggleAction} use:enhance class="flex min-w-0 flex-1">
		<input type="hidden" name="task_id" value={taskId} />
		<button
			type="submit"
			class="flex min-w-0 flex-1 items-center gap-3 text-left select-none"
			aria-label={checked ? 'Uncheck task' : 'Check task'}
		>
			<span
				class="flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors
					{checked ? 'border-moss bg-moss text-paper' : 'border-line bg-surface'}"
			>
				{#if checked}
					<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
						<path d="M2.5 6.2l2.3 2.3L9.5 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				{/if}
			</span>
			<span
				class="min-w-0 flex-1 text-[14.5px] leading-snug font-medium {checked
					? 'text-ink-muted line-through decoration-ink-muted/50'
					: 'text-ink'}"
			>
				{title}
			</span>
		</button>
	</form>

	{#if assignable}
		<button
			type="button"
			onclick={onAssign}
			class="text-ink-muted hover:text-ink-soft shrink-0 px-1 py-0.5"
			aria-label="Assign or remove task"
		>
			<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
				<circle cx="10" cy="4.5" r="1.4" /><circle cx="10" cy="10" r="1.4" /><circle cx="10" cy="15.5" r="1.4" />
			</svg>
		</button>
		{#if assigneeInitial}
			<span class="shrink-0 transition-opacity" style="opacity:{checked ? 0.4 : 1};">
				<Avatar img={assigneeImg} initial={assigneeInitial} alt={assigneeAlt} size={24} />
			</span>
		{:else}
			<span class="border-line h-6 w-6 shrink-0 rounded-full border-[1.5px] border-dashed"></span>
		{/if}
	{/if}
</div>
