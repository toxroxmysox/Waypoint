<script lang="ts">
	// #271 / ADR-0023 — the PUBLIC poll page. Tap the share link → paint your days →
	// give a name (no OTP) → a name-only respondent is saved + a soft cookie keys
	// re-entry. "That's me" re-picks an existing respondent; OTP-to-enter-the-trip is
	// a separate step (the /join claim path). Mobile-first (375px gate).
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import { cycleValue, type AvailabilityValue } from '$lib/ideation/availability';
	import type { PollDay } from '$lib/ideation/availability-poll.server';

	let { data, form } = $props();

	// Local paint state: day -> my value (null=blank). Seeded from the render (blank on
	// a fresh anon load; the endpoint merges on save).
	let marks = $state<Map<string, AvailabilityValue | null>>(new Map());
	function valueOf(day: string): AvailabilityValue | null {
		return marks.get(day) ?? null;
	}

	const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

	// Drag paint.
	let dragging = $state(false);
	let dragFrom = $state<string | null>(null);
	let dragTo = $state<string | null>(null);
	const flatDays = $derived(
		(data.poll?.weeks ?? []).flat().filter((c): c is PollDay => c !== null).map((c) => c.day)
	);
	const dragSpan = $derived.by(() => {
		if (!dragging || !dragFrom || !dragTo) return new Set<string>();
		const i = flatDays.indexOf(dragFrom);
		const j = flatDays.indexOf(dragTo);
		if (i < 0 || j < 0) return new Set<string>();
		const [lo, hi] = i <= j ? [i, j] : [j, i];
		return new Set(flatDays.slice(lo, hi + 1));
	});

	function onDown(d: PollDay, e: PointerEvent) {
		(e.target as HTMLElement).setPointerCapture?.(e.pointerId);
		dragging = true;
		dragFrom = d.day;
		dragTo = d.day;
	}
	function onEnter(d: PollDay) {
		if (dragging) dragTo = d.day;
	}
	function onUp() {
		if (!dragging) return;
		const span = dragSpan;
		const from = dragFrom;
		dragging = false;
		dragFrom = null;
		dragTo = null;
		if (span.size <= 1) {
			if (from) marks.set(from, cycleValue(valueOf(from)));
			marks = new Map(marks);
			return;
		}
		for (const day of span) {
			if (valueOf(day) !== 'available') marks.set(day, 'available');
		}
		marks = new Map(marks);
	}

	// Serialize marks as deltas for the paint action.
	let deltasJson = $state('');
	let name = $state('');
	let showName = $state(false);
	let saving = $state(false);
	let paintForm = $state<HTMLFormElement>();

	// If a respondent is already known (cookie), we can paint-and-save without a name
	// prompt; a fresh tapper is asked for a name before the first save.
	const knownName = $derived(data.me?.name ?? form?.savedName ?? '');

	async function save() {
		const deltas: { day: string; value: AvailabilityValue | null }[] = [];
		for (const [day, value] of marks) deltas.push({ day, value });
		if (deltas.length === 0) return;
		if (!knownName && !name.trim()) {
			showName = true;
			return;
		}
		deltasJson = JSON.stringify(deltas);
		await tick();
		paintForm?.requestSubmit();
	}

	const paintedCount = $derived([...marks.values()].filter((v) => v !== null).length);
</script>

<svelte:head><title>When can you go? · Waypoint</title></svelte:head>

<main class="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pt-6 pb-10">
	{#if data.status === 'not_found'}
		<div class="mt-16 text-center">
			<p class="font-display text-ink-soft text-lg italic">This poll link isn't valid.</p>
			<p class="text-ink-muted mt-2 text-sm">It may have been revoked. Ask whoever shared it for a fresh link.</p>
		</div>
	{:else if data.status === 'inactive'}
		<div class="mt-16 text-center">
			<p class="font-display text-ink-soft text-lg italic">
				{data.dated ? 'The dates are set.' : 'This poll is closed.'}
			</p>
			<p class="text-ink-muted mt-2 text-sm">
				{data.dated
					? 'The group already picked the dates — nothing to vote on now.'
					: 'This trip is no longer taking availability.'}
			</p>
		</div>
	{:else}
		<header class="mb-4">
			<p class="text-ink-muted text-xs font-semibold tracking-wide uppercase">You're invited to weigh in</p>
			<h1 class="font-display text-ink mt-1 text-2xl">{data.tripTitle}</h1>
			<p class="text-ink-muted mt-1 text-sm">
				{#if knownName}
					Welcome back, {knownName}. Update the days you're free.
				{:else}
					Paint the days you're free — no account needed. Add your name at the end.
				{/if}
			</p>
		</header>

		{#if form?.ok}
			<div class="border-moss-soft bg-moss-tint mb-4 rounded-lg border p-3">
				<p class="text-ink text-sm font-semibold">Saved. Thanks{form.savedName ? `, ${form.savedName}` : ''}!</p>
				<p class="text-ink-muted mt-0.5 text-xs">
					You can come back to this link anytime to change your days.
				</p>
			</div>
		{/if}
		{#if form?.error}
			<p role="alert" class="text-error-deep mb-3 text-sm">{form.error}</p>
		{/if}

		<!-- "That's me" re-entry picker (name-only respondents) -->
		{#if !knownName && data.respondents.length > 0}
			<div class="border-line bg-surface mb-4 rounded-lg border p-3">
				<p class="text-ink-soft text-xs font-semibold">Already added your days?</p>
				<div class="mt-2 flex flex-wrap gap-1.5">
					{#each data.respondents as r (r.member_id)}
						<form method="POST" action="?/paint" use:enhance={() => { saving = true; return async ({ update }) => { await update({ reset: false }); saving = false; }; }}>
							<input type="hidden" name="member_id" value={r.member_id} />
							<input type="hidden" name="deltas" value="[]" />
							<button type="submit" class="border-line bg-surface-2 hover:bg-surface text-ink rounded-full border px-3 py-1 text-xs font-medium">
								That's me — {r.name}
							</button>
						</form>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Paint calendar (My-mode) -->
		<div class="border-line bg-surface rounded-xl border p-3">
			<div class="text-ink-muted mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[10px]">
				<span class="inline-flex items-center gap-1"><span class="h-3 w-3 rounded-sm" style="background:var(--color-moss)"></span> Free</span>
				<span class="inline-flex items-center gap-1"><span class="h-3 w-3 rounded-sm" style="background:var(--color-gold)"></span> Maybe</span>
				<span>Tap to cycle · drag to paint</span>
			</div>
			<div class="grid grid-cols-7 gap-1 px-0.5">
				{#each WEEKDAYS as w, i (i)}
					<div class="text-ink-muted text-center text-[10px] font-semibold">{w}</div>
				{/each}
			</div>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="mt-1 space-y-1 select-none" onpointerup={onUp} onpointerleave={onUp}>
				{#each data.poll?.weeks ?? [] as week, wi (wi)}
					<div class="grid grid-cols-7 gap-1">
						{#each week as cell, ci (ci)}
							{#if cell === null}
								<div class="aspect-square"></div>
							{:else}
								{@const mv = valueOf(cell.day)}
								{@const inDrag = dragSpan.has(cell.day)}
								<button
									type="button"
									onpointerdown={(e) => onDown(cell, e)}
									onpointerenter={() => onEnter(cell)}
									data-testid="poll-day-{cell.day}"
									data-mine={mv ?? 'blank'}
									class="relative flex aspect-square flex-col items-center justify-center rounded-md border text-[11px] {cell.isToday ? 'ring-1 ring-ink/40' : ''}"
									style={mv === 'available'
										? 'background:var(--color-moss);border-color:var(--color-moss);color:#fff'
										: mv === 'maybe'
											? 'background:var(--color-gold);border-color:var(--color-gold);color:#fff'
											: inDrag
												? 'background:var(--color-moss-tint);border-color:var(--color-moss-soft)'
												: 'background:var(--color-surface);border-color:var(--color-line)'}
								>
									{#if cell.monthTag}
										<span class="text-ink-muted absolute top-0.5 left-0.5 text-[7px] font-bold tracking-wide">{cell.monthTag}</span>
									{/if}
									<span class="font-mono leading-none">{Number(cell.day.slice(8, 10))}</span>
								</button>
							{/if}
						{/each}
					</div>
				{/each}
			</div>
		</div>

		<!-- Name + save -->
		<div class="mt-4">
			{#if showName && !knownName}
				<label for="poll-name" class="text-ink-soft block text-xs font-medium">Your name</label>
				<input
					id="poll-name"
					name="name-visible"
					bind:value={name}
					placeholder="e.g. Dana"
					autocomplete="name"
					class="border-line bg-surface text-ink mt-1 mb-3 block w-full rounded-md border px-3 py-2 text-sm"
				/>
			{/if}
			<button
				type="button"
				onclick={save}
				disabled={saving || paintedCount === 0}
				class="bg-moss text-paper w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
				data-testid="poll-save"
			>
				{saving ? 'Saving…' : knownName ? 'Update my days' : showName ? 'Save my days' : `Save my days${paintedCount ? ` (${paintedCount})` : ''}`}
			</button>
			<p class="text-ink-muted mt-2 text-center text-xs">
				Want in on the rest of the trip — ideas, the plan?
				<a href="/join/{data.token}" class="text-moss font-semibold underline decoration-dotted">Verify your email to join</a>
			</p>
		</div>
	{/if}
</main>

<!-- hidden paint form: posts name + deltas to the anon endpoint via ?/paint -->
<form
	bind:this={paintForm}
	method="POST"
	action="?/paint"
	class="hidden"
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
			showName = false;
		};
	}}
>
	<input type="hidden" name="name" value={name} />
	<input type="hidden" name="deltas" value={deltasJson} />
</form>
