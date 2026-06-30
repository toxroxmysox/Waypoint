<script lang="ts">
	// Publish control (#241/#195 — Slice 3). Binary: Keep private (default) / Publish,
	// with an inline date defaulting to TODAY (leave = publish now; change = schedule).
	// Owner/co_owner only — the parent gates rendering AND the server re-checks the role
	// on the write (this is just the form fields, not a trust boundary).
	//
	// Emits the fields finishCloseout / the record-view publishRecord action read:
	//   publish      = "on" when Publish is selected
	//   publish_date = the inline date (defaults to today)
	//   show_budget  = "on" when the opt-in budget summary is selected (Slice 5)
	//
	// Not a <form> itself — drop it inside a parent <form> (closeout summary, record-view
	// Share panel) so the same control serves the final closeout step and the standalone
	// "Publish record" control.

	let {
		publish = $bindable(false),
		publishDate = $bindable(''),
		showBudget = $bindable(false),
		showBudgetToggle = false,
		today = ''
	}: {
		publish?: boolean;
		publishDate?: string;
		showBudget?: boolean;
		/** Slice 5: surface the opt-in public budget summary toggle when publishing. */
		showBudgetToggle?: boolean;
		/**
		 * Trip-LOCAL "today" (YYYY-MM-DD) used to default the inline date. MUST be the
		 * trip-local date, not UTC: the visibility gate (publishStatus) reads trip-local,
		 * so a UTC default scheduled "publish now" to tomorrow evening in a behind-UTC
		 * zone -> "Publishes on <tomorrow>" instead of live (#301). Callers pass
		 * tripToday(tripTz(trip)). Falls back to the UTC date only if unset.
		 */
		today?: string;
	} = $props();

	const defaultDay = $derived(today || new Date().toISOString().split('T')[0]);
	// Default the inline date to today so "Publish" with no further interaction = now.
	// Set it on the toggle event (not via $effect, which doesn't run in SSR and would
	// fire post-hydration — cerebrum scar 2026-06-02). If the parent pre-seeds publish
	// (record view re-edit), it passes publishDate too, so the field is never blank.
	function selectPublish() {
		publish = true;
		if (!publishDate) publishDate = defaultDay;
	}
</script>

<fieldset class="space-y-3">
	<legend class="sr-only">Publish the public record</legend>

	<!-- Binary choice. Keep private is the default + a real terminal state. -->
	<div class="grid grid-cols-2 gap-2">
		<label
			class="flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 {!publish
				? 'border-ink bg-surface-2'
				: 'border-line bg-surface hover:bg-surface-2'}"
		>
			<span class="flex items-center gap-2">
				<input type="radio" name="publish" value="off" checked={!publish} onchange={() => (publish = false)} class="sr-only" />
				<span class="text-ink text-sm font-semibold">Keep private</span>
			</span>
			<span class="text-ink-muted text-xs">Only members can see the record.</span>
		</label>
		<label
			class="flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 {publish
				? 'border-moss bg-moss-tint'
				: 'border-line bg-surface hover:bg-surface-2'}"
		>
			<span class="flex items-center gap-2">
				<input type="radio" name="publish" value="on" checked={publish} onchange={selectPublish} class="sr-only" />
				<span class="text-ink text-sm font-semibold">Publish</span>
			</span>
			<span class="text-ink-muted text-xs">Anyone with the link can view it.</span>
		</label>
	</div>

	{#if publish}
		<!-- name="publish" is sent by the radio above; the hidden mirror is unnecessary,
		     but the date field only matters when publishing. -->
		<div class="space-y-1.5">
			<label for="publish_date" class="text-ink-soft block text-sm font-medium">
				When should it go live?
			</label>
			<input
				type="date"
				id="publish_date"
				name="publish_date"
				bind:value={publishDate}
				class="border-line bg-surface text-ink focus:border-moss w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
			/>
			<p class="text-ink-muted text-xs">
				Today means it publishes now. A future date schedules it — visitors see a friendly
				"coming soon" page until then.
			</p>
		</div>

		{#if showBudgetToggle}
			<!-- Opt-in public budget summary (#243). Default off. Summary only — never
			     itemized expenses or who-owes-whom. -->
			<label class="border-line bg-surface flex items-start gap-2.5 rounded-lg border p-3">
				<input type="checkbox" name="show_budget" checked={showBudget} onchange={(e) => (showBudget = e.currentTarget.checked)} class="mt-0.5" />
				<span class="min-w-0">
					<span class="text-ink block text-sm font-medium">Include budget summary</span>
					<span class="text-ink-muted block text-xs">
						Shows the trip total and rough per-person cost only — never individual expenses
						or who owes whom.
					</span>
				</span>
			</label>
		{/if}
	{/if}
</fieldset>
