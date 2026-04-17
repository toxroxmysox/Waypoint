<script lang="ts">
	import type { Phase, Day } from '$lib/types';

	let { data } = $props();

	function formatDate(d: string): string {
		return new Date(d).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatDateRange(start: string, end: string): string {
		const s = new Date(start);
		const e = new Date(end);
		const startStr = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		const endStr = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		return `${startStr} - ${endStr}`;
	}

	function daysInPhase(phase: Phase): Day[] {
		return data.days.filter((d: Day) => d.phase === phase.id);
	}

	function unassignedDays(): Day[] {
		return data.days.filter((d: Day) => !d.phase);
	}

	function dayLabel(d: Day): string {
		return new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	}
</script>

<div class="space-y-6">
	<!-- Trip info -->
	<div class="rounded-lg border border-slate-200 bg-white p-4">
		<div class="flex items-start justify-between">
			<div>
				<p class="text-sm text-slate-500">
					{formatDateRange(data.trip.start_date, data.trip.end_date)}
				</p>
				{#if data.trip.timezone}
					<p class="mt-0.5 text-xs text-slate-400">{data.trip.timezone}</p>
				{/if}
			</div>
			<span
				class="rounded-full px-2 py-0.5 text-xs font-medium
					{data.membership.role === 'owner'
					? 'bg-slate-900 text-white'
					: 'bg-slate-100 text-slate-600'}"
			>
				{data.membership.role.replace('_', ' ')}
			</span>
		</div>
		<p class="mt-2 text-sm text-slate-600">
			{data.days.length} days &middot; {data.phases.length} phases
		</p>
	</div>

	<!-- Phases -->
	{#if data.phases.length > 0}
		<section>
			<div class="mb-2 flex items-center justify-between">
				<h2 class="text-sm font-medium text-slate-500 uppercase">Phases</h2>
				<a
					href="/trips/{data.trip.slug}/phases"
					class="text-xs text-slate-500 hover:text-slate-700"
				>
					Manage
				</a>
			</div>
			<div class="space-y-2">
				{#each data.phases as phase}
					<a
						href="/trips/{data.trip.slug}/phases/{phase.id}"
						class="block rounded-lg border border-slate-200 bg-white p-3"
					>
						<div class="flex items-center gap-2">
							{#if phase.color}
								<span
									class="h-3 w-3 rounded-full"
									style="background-color: {phase.color}"
								></span>
							{/if}
							<h3 class="font-medium text-slate-900">{phase.name}</h3>
						</div>
						<p class="mt-1 text-xs text-slate-500">
							{formatDateRange(phase.start_date, phase.end_date)}
							{#if phase.location}
								&middot; {phase.location}
							{/if}
							&middot; {daysInPhase(phase).length} days
						</p>
					</a>
				{/each}
			</div>
		</section>
	{:else}
		<div class="rounded-lg border border-dashed border-slate-300 p-6 text-center">
			<p class="text-sm text-slate-500">No phases yet</p>
			<a
				href="/trips/{data.trip.slug}/phases"
				class="mt-2 inline-block text-sm font-medium text-slate-700 hover:text-slate-900"
			>
				Add phases
			</a>
		</div>
	{/if}

	<!-- Days timeline -->
	{#if data.days.length > 0}
		<section>
			<h2 class="mb-2 text-sm font-medium text-slate-500 uppercase">Days</h2>
			<div class="space-y-1">
				{#each data.days as day}
					<a
						href="/trips/{data.trip.slug}/days/{day.id}"
						class="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2"
					>
						<span class="text-sm text-slate-900">{dayLabel(day)}</span>
						{#if day.phase}
							{@const phase = data.phases.find((p: Phase) => p.id === day.phase)}
							{#if phase}
								<span class="flex items-center gap-1 text-xs text-slate-500">
									{#if phase.color}
										<span
											class="h-2 w-2 rounded-full"
											style="background-color: {phase.color}"
										></span>
									{/if}
									{phase.name}
								</span>
							{/if}
						{/if}
					</a>
				{/each}
			</div>
		</section>
	{/if}
</div>
