<script lang="ts">
	// #271 / ADR-0023 — the availability paint surface. A month calendar (week-aligned,
	// Monday-first) reusing the pure availability model. Two modes:
	//   • My days   — tap a day to cycle blank → available → maybe → blank; drag across
	//                 days to paint a range `available`. Live-persist per gesture.
	//   • The group — the same grid tinted green (everyone available) / gold (someone
	//                 maybe or unpainted), with small avatail count dots.
	// Green = moss, yellow = gold — the calm editorial palette (never red; ADR-0023).
	// Mobile-first (375px is the documented visual gate). All date math is in the pure
	// availability module; this is the view + gesture wiring.
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { cycleValue, type AvailabilityValue } from '$lib/ideation/availability';
	import type { PollDay } from '$lib/ideation/availability-poll.server';
	import type { MemberWithAvatar } from '$lib/collaboration/member-avatar';

	let {
		weeks,
		members,
		myMemberId,
		activeMemberCount,
		canPaint = true
	}: {
		weeks: (PollDay | null)[][];
		members: MemberWithAvatar[];
		myMemberId: string;
		activeMemberCount: number;
		/** false once the trip is dated (frozen read-only, ADR-0023 Decision 9). */
		canPaint?: boolean;
	} = $props();

	type Mode = 'mine' | 'group';
	let mode = $state<Mode>('mine');

	// Optimistic overlay: my pending value per day while a gesture is in flight, so the
	// grid re-tints instantly; server truth re-seeds via enhance invalidation.
	let pending = $state<Map<string, AvailabilityValue | null>>(new Map());
	function myValue(d: PollDay): AvailabilityValue | null {
		return pending.has(d.day) ? pending.get(d.day)! : d.mine;
	}

	const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
	const memberName = (id: string) => {
		const m = members.find((x) => x.id === id);
		return (m?.display_name || m?.placeholder_name || m?.expand?.user?.name || 'Someone') as string;
	};

	// --- persist plumbing: a hidden enhance form posts a JSON delta list ---
	let paintForm = $state<HTMLFormElement>();
	let fDeltas = $state('');
	let saving = $state(false);

	async function persist(deltas: { day: string; value: AvailabilityValue | null }[]) {
		if (!canPaint || deltas.length === 0) return;
		for (const dlt of deltas) pending.set(dlt.day, dlt.value);
		pending = new Map(pending);
		fDeltas = JSON.stringify(deltas);
		await tick();
		paintForm?.requestSubmit();
	}

	// --- tap: cycle one day (blank → available → maybe → blank) ---
	function tapDay(d: PollDay) {
		if (!canPaint || mode !== 'mine') return;
		const next = cycleValue(myValue(d));
		persist([{ day: d.day, value: next }]);
	}

	// --- drag: paint a contiguous range `available` (pointer). We record the first and
	// last day touched and paint the inclusive span on pointerup. ---
	let dragging = $state(false);
	let dragFrom = $state<string | null>(null);
	let dragTo = $state<string | null>(null);
	// Flat day list (in extent order) for span math.
	const flatDays = $derived(
		weeks.flat().filter((c): c is PollDay => c !== null).map((c) => c.day)
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
		if (!canPaint || mode !== 'mine') return;
		// A single tap and a drag both start here; we distinguish on pointerup (if the
		// span is one day, treat as a tap-cycle; else paint the span available).
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
			// A single-cell gesture is a tap — cycle it.
			const d = flatDays.find((x) => x === from);
			if (d) {
				const cell = weeks.flat().find((c) => c && c.day === d) as PollDay | undefined;
				if (cell) tapDay(cell);
			}
			return;
		}
		// Multi-day drag: paint the whole span `available` (the common "we're all free
		// this week" gesture). Skip days already available.
		const deltas: { day: string; value: AvailabilityValue | null }[] = [];
		for (const day of span) {
			const cell = weeks.flat().find((c) => c && c.day === day) as PollDay | undefined;
			if (!cell) continue;
			if (myValue(cell) !== 'available') deltas.push({ day, value: 'available' });
		}
		persist(deltas);
	}
</script>

<div class="space-y-3" data-testid="availability-calendar">
	<!-- Mode toggle -->
	<div class="flex items-center justify-between px-0.5">
		<div class="border-line inline-flex rounded-full border p-0.5" role="tablist" aria-label="Poll mode">
			<button
				type="button"
				role="tab"
				aria-selected={mode === 'mine'}
				onclick={() => (mode = 'mine')}
				class="rounded-full px-3 py-1 text-xs font-semibold {mode === 'mine'
					? 'bg-ink text-paper'
					: 'text-ink-muted'}"
				data-testid="mode-mine"
			>
				My days
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={mode === 'group'}
				onclick={() => (mode = 'group')}
				class="rounded-full px-3 py-1 text-xs font-semibold {mode === 'group'
					? 'bg-ink text-paper'
					: 'text-ink-muted'}"
				data-testid="mode-group"
			>
				The group
			</button>
		</div>
		{#if saving}
			<span class="text-ink-muted text-[10px]">Saving…</span>
		{/if}
	</div>

	<!-- Legend -->
	<div class="text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[10px]">
		{#if mode === 'mine'}
			<span class="inline-flex items-center gap-1">
				<span class="h-3 w-3 rounded-sm" style="background:var(--color-moss)"></span> Free
			</span>
			<span class="inline-flex items-center gap-1">
				<span class="h-3 w-3 rounded-sm" style="background:var(--color-gold)"></span> Maybe
			</span>
			<span>Tap to cycle · drag to paint a week</span>
		{:else}
			<span class="inline-flex items-center gap-1">
				<span class="h-3 w-3 rounded-sm" style="background:var(--color-moss)"></span> Everyone free
			</span>
			<span class="inline-flex items-center gap-1">
				<span class="h-3 w-3 rounded-sm" style="background:var(--color-gold-tint); box-shadow: inset 0 0 0 1px var(--color-gold)"></span>
				Some free
			</span>
		{/if}
	</div>

	<!-- Weekday header -->
	<div class="grid grid-cols-7 gap-1 px-0.5">
		{#each WEEKDAYS as w, i (i)}
			<div class="text-ink-muted text-center text-[10px] font-semibold">{w}</div>
		{/each}
	</div>

	<!-- Calendar grid. The wrapper's pointerup/leave finalize a drag that ends off a
	     cell; the interactive controls are the day buttons within (role=group, not a
	     focusable widget itself). -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="space-y-1 select-none" onpointerup={onUp} onpointerleave={onUp}>
		{#each weeks as week, wi (wi)}
			<div class="grid grid-cols-7 gap-1">
				{#each week as cell, ci (ci)}
					{#if cell === null}
						<div class="aspect-square"></div>
					{:else}
						{@const mv = myValue(cell)}
						{@const inDrag = dragSpan.has(cell.day)}
						<button
							type="button"
							disabled={!canPaint && mode === 'mine'}
							onpointerdown={(e) => onDown(cell, e)}
							onpointerenter={() => onEnter(cell)}
							title={mode === 'group'
								? `${cell.availableCount} free · ${cell.maybeCount} maybe`
								: cell.day}
							data-testid="day-{cell.day}"
							data-mine={mode === 'mine' ? (mv ?? 'blank') : undefined}
							data-status={mode === 'group' ? (cell.status ?? 'blank') : undefined}
							class="relative flex aspect-square flex-col items-center justify-center rounded-md border text-[11px]
								{cell.isPast ? 'opacity-45' : ''}
								{cell.isToday ? 'ring-1 ring-ink/40' : ''}"
							style={mode === 'mine'
								? mv === 'available'
									? 'background:var(--color-moss);border-color:var(--color-moss);color:#fff'
									: mv === 'maybe'
										? 'background:var(--color-gold);border-color:var(--color-gold);color:#fff'
										: inDrag
											? 'background:var(--color-moss-tint);border-color:var(--color-moss-soft)'
											: 'background:var(--color-surface);border-color:var(--color-line)'
								: cell.status === 'green'
									? 'background:var(--color-moss);border-color:var(--color-moss);color:#fff'
									: cell.status === 'yellow'
										? 'background:var(--color-gold-tint);border-color:var(--color-gold)'
										: 'background:var(--color-surface);border-color:var(--color-line)'}
						>
							{#if cell.monthTag}
								<span class="text-ink-muted absolute top-0.5 left-0.5 text-[7px] font-bold tracking-wide">{cell.monthTag}</span>
							{/if}
							<span class="font-mono leading-none">{Number(cell.day.slice(8, 10))}</span>
							{#if mode === 'group' && (cell.availableCount > 0 || cell.maybeCount > 0)}
								<span class="mt-0.5 flex items-center gap-0.5">
									{#if cell.availableCount > 0}
										<span
											class="inline-block h-1.5 w-1.5 rounded-full"
											style="background:{cell.status === 'green' ? '#fff' : 'var(--color-moss)'}"
											aria-hidden="true"
										></span>
										<span class="text-[8px] font-bold {cell.status === 'green' ? 'text-paper' : 'text-moss'}">{cell.availableCount}</span>
									{/if}
									{#if cell.maybeCount > 0}
										<span class="inline-block h-1.5 w-1.5 rounded-full" style="background:var(--color-gold)" aria-hidden="true"></span>
										<span class="text-gold-deep text-[8px] font-bold">{cell.maybeCount}</span>
									{/if}
								</span>
							{/if}
						</button>
					{/if}
				{/each}
			</div>
		{/each}
	</div>

	{#if mode === 'group'}
		<p class="text-ink-muted px-0.5 text-[10px]">
			Green needs all {activeMemberCount} {activeMemberCount === 1 ? 'person' : 'people'} marked free — it un-greens as new people join.
		</p>
	{/if}
</div>

<!-- hidden persist form; the route's ?/paint action upserts/deletes my cells -->
<form
	bind:this={paintForm}
	method="POST"
	action="?/paint"
	class="hidden"
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			pending = new Map(); // server truth now authoritative
			saving = false;
		};
	}}
>
	<input type="hidden" name="deltas" value={fDeltas} />
</form>
