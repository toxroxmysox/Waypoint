<script lang="ts">
	// #330 / ADR-0021 V2 — the calendar phase editor. A week-aligned grid where each
	// phase tints its run of days; travel days (shared boundaries) are split cells
	// carrying a draggable route handle. Drag a handle to move a boundary, tap a day to
	// split, tap a name to rename. Live-persist: every completed gesture posts to a
	// phases server action and enhance() invalidates → the grid re-seeds from truth.
	//
	// The model is the shipped tiling engine (phase = a START day; ends derived; adjacent
	// phases share the boundary/travel day). All date math is in the pure phase-calendar
	// module; this component is the view + gesture wiring.
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { toDay, retilePhases } from '$lib/itinerary/phase-tiling';
	import { buildCalendar, addDays, dayDiff, paletteFor } from '$lib/itinerary/phase-calendar';
	import Button from '$lib/ui/Button.svelte';
	import { toast } from '$lib/shell/stores/toast';
	import type { Phase, Trip } from '$lib/types';

	let { trip, phases, form }: { trip: Trip; phases: Phase[]; form: Record<string, unknown> | null } =
		$props();

	const tripStart = $derived(toDay(String(trip.start_date)));
	const tripEnd = $derived(toDay(String(trip.end_date)));
	const totalDays = $derived(dayDiff(tripStart, tripEnd) + 1);
	const nameById = $derived(new Map(phases.map((p) => [p.id, p.name])));

	// Optimistic drag override: replace the dragged phase's start while the finger moves
	// so the grid re-tints live; committed on pointerup, then server truth re-seeds.
	let dragPhaseId = $state<string | null>(null);
	let dragStart = $state<string | null>(null); // 'YYYY-MM-DD' candidate boundary

	const effectiveTiled = $derived.by(() => {
		const starts = phases.map((p) => ({
			id: p.id,
			start_date: p.id === dragPhaseId && dragStart ? dragStart : toDay(String(p.start_date))
		}));
		return retilePhases(starts, tripEnd);
	});

	interface Row {
		id: string;
		name: string;
		index: number;
		start: string;
		end: string;
		dayStart: number;
		dayEnd: number;
		days: number;
		palette: string;
	}
	const rows = $derived<Row[]>(
		effectiveTiled.map((t, i) => ({
			id: t.id,
			name: nameById.get(t.id) ?? 'Phase',
			index: i,
			start: t.start,
			end: t.end,
			dayStart: dayDiff(tripStart, t.start) + 1,
			dayEnd: dayDiff(tripStart, t.end) + 1,
			days: dayDiff(t.start, t.end) + 1,
			palette: paletteFor(i)
		}))
	);
	const model = $derived(buildCalendar(tripStart, totalDays, effectiveTiled));
	const travelDayCount = $derived(Math.max(0, rows.length - 1));

	// --- server-action plumbing (hidden forms; enhance invalidates the load) ---
	let createForm = $state<HTMLFormElement>();
	let moveForm = $state<HTMLFormElement>();
	let renameForm = $state<HTMLFormElement>();
	let deleteForm = $state<HTMLFormElement>();
	let fCreateName = $state('');
	let fCreateStart = $state('');
	let fMoveId = $state('');
	let fMoveStart = $state('');
	let fRenameId = $state('');
	let fRenameName = $state('');
	let fDeleteId = $state('');

	// tick() before requestSubmit so the hidden inputs' DOM values reflect the $state we
	// just set — otherwise the form posts stale/empty values (Svelte flushes async).
	async function splitAt(tripDay: number) {
		fCreateName = 'New phase';
		fCreateStart = addDays(tripStart, tripDay - 1);
		await tick();
		createForm?.requestSubmit();
	}
	async function commitMove(phaseId: string, tripDay: number) {
		fMoveId = phaseId;
		fMoveStart = addDays(tripStart, tripDay - 1);
		await tick();
		moveForm?.requestSubmit();
	}
	async function deletePhase(phaseId: string) {
		fDeleteId = phaseId;
		await tick();
		deleteForm?.requestSubmit();
	}

	// --- rename (inline input on pills + list rows) ---
	// The same phase renders in TWO places (the top pill and the bottom list row), so the
	// edit target is (id, surface) — not id alone. Keying on id alone opened an input in
	// BOTH surfaces at once: two autofocus inputs bound to one draft, so focus landed on the
	// twin (no visible caret) and clicking the visible box blurred the twin → onblur closed
	// the editor. Scoping to the originating surface leaves the other as stylised text.
	type EditSurface = 'pill' | 'list';
	let editingId = $state<string | null>(null);
	let editingSurface = $state<EditSurface | null>(null);
	let draft = $state('');
	function beginRename(id: string, current: string, surface: EditSurface) {
		editingId = id;
		editingSurface = surface;
		draft = current;
	}
	function cancelRename() {
		editingId = null;
		editingSurface = null;
	}
	async function commitRename() {
		if (!editingId) return;
		const name = draft.trim();
		const id = editingId;
		editingId = null;
		editingSurface = null;
		if (!name || name === nameById.get(id)) return; // no-op keeps prior name
		fRenameId = id;
		fRenameName = name;
		await tick();
		renameForm?.requestSubmit();
	}

	// --- drag: Pointer Events + elementFromPoint reading data-day ---
	function boundsFor(phaseIndex: number): { lo: number; hi: number } {
		// A boundary is phase[phaseIndex]'s start; it must stay strictly between the
		// previous phase's start day and the next boundary (next start, or trip end).
		const lo = rows[phaseIndex - 1].dayStart; // prev phase start day
		const hi = phaseIndex < rows.length - 1 ? rows[phaseIndex + 1].dayStart : totalDays;
		return { lo, hi };
	}
	// Pointer capture lives on the STABLE grid element, not the handle button — the
	// optimistic re-tile re-renders the travel cell (and its handle) on every move, so
	// capturing on the handle loses it after 1 day (drag "stops" + never fires pointerup
	// → no save). Capturing on the grid wrapper survives the re-render, so the whole drag
	// tracks and commits on release. `dragOriginDay` is the pre-drag start (rows[i] already
	// reflects the optimistic move, so we compare against the origin to decide whether to
	// persist).
	let gridEl = $state<HTMLElement>();
	let dragBoundaryIndex = $state<number | null>(null);
	let dragOriginDay = 0;

	function onGridPointerDown(e: PointerEvent) {
		const handle = (e.target as HTMLElement | null)?.closest('[data-handle]') as HTMLElement | null;
		if (!handle) return; // a drag only starts when a route handle is grabbed
		e.preventDefault();
		const idx = Number(handle.dataset.handle);
		dragBoundaryIndex = idx;
		dragPhaseId = rows[idx].id;
		dragStart = rows[idx].start;
		dragOriginDay = rows[idx].dayStart;
		try {
			gridEl?.setPointerCapture(e.pointerId);
		} catch {
			/* capture unavailable (e.g. synthetic events) — the drag still tracks via handlers */
		}
	}
	function onGridPointerMove(e: PointerEvent) {
		if (dragBoundaryIndex == null) return;
		const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-day]') as HTMLElement | null;
		if (!cell) return;
		const day = Number(cell.getAttribute('data-day'));
		if (!day) return;
		const { lo, hi } = boundsFor(dragBoundaryIndex);
		const clamped = Math.min(hi - 1, Math.max(lo + 1, day));
		dragStart = addDays(tripStart, clamped - 1);
	}
	function onGridPointerUp(e: PointerEvent) {
		if (dragBoundaryIndex == null) return;
		try {
			gridEl?.releasePointerCapture(e.pointerId);
		} catch {
			/* capture may already be gone */
		}
		const id = rows[dragBoundaryIndex].id;
		const committedDay = dragStart ? dayDiff(tripStart, dragStart) + 1 : dragOriginDay;
		const origin = dragOriginDay;
		dragBoundaryIndex = null;
		dragPhaseId = null;
		dragStart = null;
		if (committedDay !== origin) commitMove(id, committedDay);
	}

	function fmtShort(date: string): string {
		return new Date(date + 'T00:00:00.000Z').toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}
	const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
	const saveError = $derived((form?.error as string) ?? '');

	// Palette colours are applied as INLINE STYLES (CSS vars), never as `bg-{pal}`
	// class interpolation — Tailwind's JIT can't see constructed class names, so those
	// utilities would never be generated. gold's readable text uses gold-deep.
	const bg = (pal: string) => `var(--color-${pal})`;
	const tint = (pal: string) => `var(--color-${pal}-tint)`;
	const textColor = (pal: string) => `var(--color-${pal === 'gold' ? 'gold-deep' : pal})`;
</script>

<!-- hidden forms: JS-driven gestures submit these; enhance re-runs load on success -->
<form bind:this={createForm} method="POST" action="?/create" class="hidden"
	use:enhance={() => async ({ result, update }) => { if (result.type === 'success') toast.show('Phase added'); await update(); }}>
	<input type="hidden" name="name" value={fCreateName} />
	<input type="hidden" name="start_date" value={fCreateStart} />
</form>
<form bind:this={moveForm} method="POST" action="?/moveStart" class="hidden"
	use:enhance={() => async ({ update }) => { await update(); }}>
	<input type="hidden" name="phase_id" value={fMoveId} />
	<input type="hidden" name="start_date" value={fMoveStart} />
</form>
<form bind:this={renameForm} method="POST" action="?/rename" class="hidden"
	use:enhance={() => async ({ update }) => { await update(); }}>
	<input type="hidden" name="phase_id" value={fRenameId} />
	<input type="hidden" name="name" value={fRenameName} />
</form>
<form bind:this={deleteForm} method="POST" action="?/delete" class="hidden"
	use:enhance={() => async ({ result, update }) => {
		if (result.type === 'success') toast.show('Phase removed');
		else if (result.type === 'failure' && result.data?.error) toast.show(String(result.data.error));
		await update();
	}}>
	<input type="hidden" name="phase_id" value={fDeleteId} />
</form>

<div class="select-none px-1 pt-1 pb-2">
	{#if saveError}
		<p role="alert" class="text-error-deep mb-3 text-sm">{saveError}</p>
	{/if}

	<!-- hint -->
	<p class="text-ink-muted mb-3 text-[11.5px] leading-[1.45]">
		Drag a route handle to move a boundary. Tap a day to split. Tap a name to rename.
	</p>

	<!-- phase name pills -->
	<div class="mb-3 flex flex-wrap gap-2">
		{#each rows as row (row.id)}
			{#if editingId === row.id && editingSurface === 'pill'}
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="text-ink font-display rounded-lg border-[1.5px] bg-white px-2.5 py-1 text-sm outline-none"
					style="border-color:{bg(row.palette)};"
					bind:value={draft}
					autofocus
					onblur={commitRename}
					onkeydown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') cancelRename(); }}
				/>
			{:else}
				<button
					type="button"
					class="border-line shadow-card flex items-center gap-1.5 rounded-[20px] border bg-white px-2.5 py-1"
					onclick={() => beginRename(row.id, row.name, 'pill')}
				>
					<span class="h-[7px] w-[7px] rounded-full" style="background:{bg(row.palette)};"></span>
					<span class="font-display text-ink text-[13px] font-semibold">{row.name}</span>
				</button>
			{/if}
		{/each}
	</div>

	<!-- month header -->
	<div class="mb-3 flex items-baseline justify-between">
		<h3 class="font-display text-ink text-base font-semibold">{model.monthTitle}</h3>
		<span class="text-ink-muted font-mono text-[11px]">{model.rangeLabel}</span>
	</div>

	<!-- weekday header -->
	<div class="mb-1.5 grid grid-cols-7 gap-[5px]">
		{#each WEEKDAYS as wd}
			<span class="text-ink-muted text-center text-[9px] font-bold tracking-[0.1em]">{wd}</span>
		{/each}
	</div>

	<!-- calendar grid. Pointer handling lives HERE (stable across re-tiles), not on the
	     handle button which gets re-rendered every move. The grid only DELEGATES pointer
	     events for the drag; the interactive elements (cells, handles) carry their own
	     roles/labels. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={gridEl}
		class="grid touch-none grid-cols-7 gap-[5px]"
		onpointerdown={onGridPointerDown}
		onpointermove={onGridPointerMove}
		onpointerup={onGridPointerUp}
		onpointercancel={onGridPointerUp}
	>
		{#each model.weeks as week}
			{#each week as cell}
				{#if !cell}
					<div></div>
				{:else if cell.isTravelDay}
					{@const prev = paletteFor(cell.prevPhaseIndex ?? 0)}
					{@const next = paletteFor(cell.phaseIndex)}
					<div
						data-day={cell.tripDay}
						class="border-line relative aspect-square overflow-hidden rounded-[9px] border"
						style="background:linear-gradient(135deg, var(--color-{prev}-tint) 0 50%, var(--color-{next}-tint) 50% 100%);"
					>
						<span class="text-clay absolute top-[5px] left-[6px] font-mono text-[11px] font-semibold">{cell.date.slice(8, 10)}</span>
						{#if cell.monthTag}<span class="text-clay absolute top-[5px] right-[5px] text-[7px] font-bold tracking-[0.08em]">{cell.monthTag}</span>{/if}
						<!-- route handle: drag to move this boundary. data-handle carries the phase
						     index; the grid wrapper reads it on pointerdown and owns the drag. -->
						<div
							role="slider"
							aria-label="Move boundary"
							aria-valuenow={cell.tripDay}
							aria-valuemin={1}
							aria-valuemax={totalDays}
							tabindex="0"
							data-handle={cell.phaseIndex}
							class="border-line shadow-elevated absolute top-1/2 left-1/2 z-[6] flex h-7 w-[50px] -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-[14px] border bg-white transition-transform {dragBoundaryIndex === cell.phaseIndex ? 'shadow-dropdown scale-110' : ''}"
						>
							<svg width="30" height="14" viewBox="0 0 30 14" fill="none" stroke="var(--color-clay)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<line x1="6" y1="7" x2="24" y2="7" stroke-dasharray="2.5 2.5" />
								<polyline points="9 3.5 5 7 9 10.5" />
								<polyline points="21 3.5 25 7 21 10.5" />
							</svg>
						</div>
					</div>
				{:else}
					{@const pal = paletteFor(cell.phaseIndex)}
					<button
						type="button"
						data-day={cell.tripDay}
						class="border-line relative aspect-square cursor-copy overflow-hidden rounded-[9px] border"
						style="background:{tint(pal)};"
						aria-label="Split at {fmtShort(cell.date)}"
						onclick={() => splitAt(cell.tripDay)}
					>
						<span class="absolute top-[5px] left-[6px] font-mono text-[11px] font-semibold" style="color:{textColor(pal)};">{cell.date.slice(8, 10)}</span>
						{#if cell.monthTag}<span class="text-clay absolute top-[5px] right-[5px] text-[7px] font-bold tracking-[0.08em]">{cell.monthTag}</span>{/if}
						<span class="absolute right-1 bottom-1 flex h-[15px] w-[15px] items-center justify-center rounded-full text-[8px] font-bold text-white" style="background:{bg(pal)};">{cell.phaseIndex + 1}</span>
					</button>
				{/if}
			{/each}
		{/each}
	</div>

	<!-- phase list -->
	<div class="border-line mt-3.5 border-t">
		{#each rows as row (row.id)}
			<div class="flex items-center gap-3 py-[11px]">
				<span class="h-[11px] w-[11px] shrink-0 rounded-[3px]" style="background:{bg(row.palette)};"></span>
				<div class="min-w-0 flex-1">
					{#if editingId === row.id && editingSurface === 'list'}
						<!-- svelte-ignore a11y_autofocus -->
						<input class="text-ink font-display w-full rounded-lg border-[1.5px] bg-white px-2 py-1 text-[15px] outline-none"
							style="border-color:{bg(row.palette)};"
							bind:value={draft} autofocus onblur={commitRename}
							onkeydown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') cancelRename(); }} />
					{:else}
						<button type="button" class="font-display text-ink block truncate text-left text-[15px] font-semibold" onclick={() => beginRename(row.id, row.name, 'list')}>{row.name}</button>
					{/if}
					<p class="text-ink-muted font-mono text-[11.5px]">Days {row.dayStart}–{row.dayEnd} · {fmtShort(row.start)}–{fmtShort(row.end)}</p>
				</div>
				<span class="font-mono text-[13px] font-semibold" style="color:{textColor(row.palette)};">{row.days}d</span>
				{#if rows.length > 1}
					<button type="button" class="text-ink-muted hover:text-clay shrink-0 p-1" aria-label="Remove {row.name}" onclick={() => deletePhase(row.id)}>
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
					</button>
				{/if}
				<!-- Open Phase Detail (days + this phase's parking lot / add idea). The name is
				     the rename target, so navigation lives on this explicit chevron. -->
				<a href="/trips/{trip.slug}/phases/{row.id}" class="text-ink-muted hover:text-ink-soft shrink-0 p-1" aria-label="Open {row.name}">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
				</a>
			</div>
			{#if row.index < rows.length - 1}
				<div class="text-ink-soft flex items-center gap-2 border-y border-dashed border-line py-[7px] pl-[23px] text-[9.5px] font-bold tracking-[0.18em]">
					<svg width="18" height="10" viewBox="0 0 30 14" fill="none" stroke="var(--color-clay)" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="7" x2="24" y2="7" stroke-dasharray="2.5 2.5" /><polyline points="9 3.5 5 7 9 10.5" /><polyline points="21 3.5 25 7 21 10.5" /></svg>
					TRAVEL DAY
					<span class="text-clay ml-auto font-mono text-[10px] font-normal tracking-normal">{fmtShort(rows[row.index + 1].start)}</span>
				</div>
			{/if}
		{/each}
	</div>

	<!-- summary -->
	<div class="border-line mt-3 flex items-center justify-between border-t pt-3">
		<span class="text-ink-muted text-[11.5px]">{rows.length} phase{rows.length === 1 ? '' : 's'} · {travelDayCount} travel day{travelDayCount === 1 ? '' : 's'} · {totalDays} days</span>
		<Button variant="ghost" size="sm" href="/trips/{trip.slug}">Done</Button>
	</div>
</div>
