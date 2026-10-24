<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { validateForm, revealServerError } from '$lib/shell/actions/validate-form';
	import ServerErrorAlert from '$lib/ui/ServerErrorAlert.svelte';
	import { goto } from '$app/navigation';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';

	let { form } = $props();

	// Seeded from a returned `values` so a no-JS round trip (the #395 heads-up)
	// keeps what was typed; with JS the component never remounts anyway.
	const initial = untrack(() => form?.values);
	let title = $state(initial?.title ?? '');
	let startDate = $state(initial?.start_date ?? '');
	let endDate = $state(initial?.end_date ?? '');
	let timezone = $state(initial?.timezone ?? '');
	let loading = $state(false);

	// #395 — same-name heads-up (the caller's own trip, or a co-traveler's).
	// Rendered beside the submit button and scrolled into view like an error.
	// Editing the name away from the clash dismisses it.
	const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
	let duplicate = $derived(
		form?.duplicate && key(title) === key(form.duplicate.title) ? form.duplicate : null
	);
	let duplicateEl = $state<HTMLElement | null>(null);
	// Once per submit result: editing the title can unmount + remount the
	// heads-up, and re-revealing then would steal focus mid-typing.
	let revealedFor: unknown = null;
	$effect(() => {
		if (form?.duplicate && duplicateEl && form !== revealedFor) {
			revealedFor = form;
			revealServerError(duplicateEl);
		}
	});

	// While the heads-up is up, its buttons are the decision. Enter in a field
	// would "click" the form's first submit button — Request an invite / Create
	// anyway — which the user never chose (#395 review).
	function guardEnter(formEl: HTMLFormElement) {
		const onKey = (e: KeyboardEvent) => {
			if (duplicate && e.key === 'Enter' && e.target instanceof HTMLInputElement)
				e.preventDefault();
		};
		formEl.addEventListener('keydown', onKey);
		return { destroy: () => formEl.removeEventListener('keydown', onKey) };
	}

	onMount(() => {
		if (!timezone) timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});

	let duration = $derived(
		startDate && endDate
			? Math.max(
					Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1,
					0
				)
			: null
	);
</script>

<NavBar title="New trip" back backHref="/trips" />

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-8 md-desktop:max-w-2xl">
	<ServerErrorAlert {form} class="mb-4" />

	<Card>
		<form
			method="POST"
			action="?/create"
			use:validateForm
			use:guardEnter
			use:enhance={() => {
				loading = true;
				return async ({ update, result }) => {
					loading = false;
					if (result.type === 'redirect') {
						// replaceState so back from the new trip skips the creation
						// form and returns to the trips list (#214 / ADR-0012).
						await goto(result.location, { replaceState: true });
					} else {
						// reset: false — a successful requestInvite must keep what was typed.
						await update({ reset: false });
					}
				};
			}}
			class="space-y-4 p-4"
		>
			<div>
				<label for="title" class="block text-sm font-medium text-ink-soft">Trip name</label>
				<input
					type="text"
					id="title"
					name="title"
					required
					maxlength="200"
					bind:value={title}
					class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
					placeholder="Spain 2026"
				/>
			</div>

			<div>
				<label for="location_summary" class="block text-sm font-medium text-ink-soft">
					Location <span class="font-normal text-ink-muted">(optional)</span>
				</label>
				<input
					type="text"
					id="location_summary"
					name="location_summary"
					value={initial?.location_summary ?? ''}
					class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
					placeholder="Spain & Portugal"
				/>
				<p class="mt-1 text-xs text-ink-muted">Freeform — city, country, region, whatever fits.</p>
			</div>

			<!-- #270 / ADR-0022 — name-first create: dates are OPTIONAL and shown inline.
			     Leaving them blank creates a dateless (forming) trip you can shape first
			     (ideas, people, goals) and date later. No disclosure/dropdown — the fields
			     are right here, and the subheading says they're skippable. -->
			<div>
				<div class="flex items-baseline justify-between">
					<span class="block text-sm font-medium text-ink-soft">Dates</span>
					<span class="text-xs font-normal text-ink-muted">Optional</span>
				</div>
				<p class="mt-0.5 mb-2 text-xs text-ink-muted">
					No dates yet? Leave these blank — you can set them anytime, and doing so starts the plan.
				</p>
				<div class="flex items-end gap-3">
					<div class="min-w-0 flex-1">
						<label for="start_date" class="block text-sm font-medium text-ink-soft"
							>Start date</label
						>
						<input
							type="date"
							id="start_date"
							name="start_date"
							bind:value={startDate}
							max={endDate || undefined}
							class="mt-1 block w-full min-w-0 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
						/>
					</div>
					<div class="pb-2 font-mono text-xs text-ink-muted">
						{#if duration}
							{duration} {duration === 1 ? 'day' : 'days'}
						{:else}
							→
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<label for="end_date" class="block text-sm font-medium text-ink-soft">End date</label>
						<input
							type="date"
							id="end_date"
							name="end_date"
							bind:value={endDate}
							min={startDate || undefined}
							class="mt-1 block w-full min-w-0 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
						/>
					</div>
				</div>
			</div>

			<div>
				<label for="timezone" class="block text-sm font-medium text-ink-soft">Timezone</label>
				<input
					type="text"
					id="timezone"
					name="timezone"
					list="timezone-list"
					bind:value={timezone}
					class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
					placeholder="America/Chicago"
				/>
				<datalist id="timezone-list">
					<option value="America/New_York"></option>
					<option value="America/Chicago"></option>
					<option value="America/Denver"></option>
					<option value="America/Los_Angeles"></option>
					<option value="America/Phoenix"></option>
					<option value="America/Anchorage"></option>
					<option value="Pacific/Honolulu"></option>
					<option value="Europe/London"></option>
					<option value="Europe/Paris"></option>
					<option value="Europe/Berlin"></option>
					<option value="Europe/Madrid"></option>
					<option value="Europe/Rome"></option>
					<option value="Europe/Amsterdam"></option>
					<option value="Europe/Zurich"></option>
					<option value="Europe/Athens"></option>
					<option value="Europe/Istanbul"></option>
					<option value="Asia/Dubai"></option>
					<option value="Asia/Kolkata"></option>
					<option value="Asia/Bangkok"></option>
					<option value="Asia/Singapore"></option>
					<option value="Asia/Shanghai"></option>
					<option value="Asia/Tokyo"></option>
					<option value="Asia/Seoul"></option>
					<option value="Australia/Sydney"></option>
					<option value="Pacific/Auckland"></option>
				</datalist>
				<p class="mt-1 text-xs text-ink-muted">Leave blank to use your local timezone.</p>
			</div>

			{#if duplicate}
				<div
					bind:this={duplicateEl}
					data-testid="duplicate-trip"
					class="rounded-md border border-line bg-surface-2 p-3 text-sm text-ink"
				>
					{#if duplicate.kind === 'mine'}
						<p class="font-medium">You already have a trip called “{duplicate.title}”.</p>
						<div class="mt-3 flex flex-wrap gap-2">
							<Button href="/trips/{duplicate.slug}" variant="moss" size="sm">Open it</Button>
							<Button
								type="submit"
								name="confirm_duplicate"
								value="1"
								variant="ghost"
								size="sm"
								disabled={loading}
							>
								Create anyway
							</Button>
						</div>
					{:else}
						<!-- Someone else's trip: no way in from here. Joining is never
						     self-serve — the request only notifies its owner + co-owners. -->
						<p class="font-medium">
							{duplicate.name} already has a trip called “{duplicate.title}”.
						</p>
						{#if duplicate.requested}
							<p class="mt-1 text-moss" data-testid="invite-requested">
								{duplicate.alreadyRequested ? 'You’ve already asked.' : 'Request sent.'}
								{duplicate.name} will see it in their notifications and can add you.
							</p>
						{:else}
							<p class="mt-1 text-ink-soft">If it’s the same trip, ask to be invited.</p>
						{/if}
						<div class="mt-3 flex flex-wrap gap-2">
							{#if !duplicate.requested}
								<Button
									type="submit"
									formaction="?/requestInvite"
									name="trip_id"
									value={duplicate.trip_id}
									variant="moss"
									size="sm"
									disabled={loading}
								>
									Request an invite
								</Button>
							{/if}
							<Button
								type="submit"
								name="confirm_duplicate"
								value="1"
								variant="ghost"
								size="sm"
								disabled={loading}
							>
								Create anyway
							</Button>
						</div>
					{/if}
				</div>
			{/if}

			<!-- While the heads-up is up, its two choices are the decision; a plain
			     Create here would only re-run the check and show it again. -->
			{#if !duplicate}
				<Button type="submit" disabled={loading} {loading} variant="moss" size="lg" class="w-full">
					{loading ? 'Creating…' : 'Create trip'}
				</Button>
			{/if}
		</form>
	</Card>
</main>
