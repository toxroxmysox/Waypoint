<script lang="ts">
	import { formatCalendarDate } from '$lib/shell/format';
	import { enhance } from '$app/forms';
	import { otpAutoSubmit } from '$lib/shell/actions/otp-auto-submit';
	import { invalidateAll } from '$app/navigation';
	import Button from '$lib/ui/Button.svelte';

	let { data, form } = $props();

	let otpId = $state('');
	let email = $state('');
	let loading = $state(false);
	let error = $derived(form?.error ?? '');
	// #374 — the 6th digit (typed or dropped in by iOS one-time-code autofill)
	// submits the form itself. Latched so a second input event while the verify
	// is in flight can't fire a second POST — a double-submit burns the code.
	const otp = otpAutoSubmit();
	let selectedPlaceholder = $state<string | null>(null);
	const placeholders = $derived(data.unclaimedPlaceholders ?? []);

	const roleLabel: Record<string, string> = {
		owner: 'Owner',
		co_owner: 'Co-Owner',
		traveler: 'Traveler',
		viewer: 'Viewer'
	};

	// "Jun 1 – 3, 2026" style range from two PB date strings (UTC, date-only).
	function fmtDates(start: string, end: string): string {
		if (!start) return '';
		const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
		const sLabel = formatCalendarDate(start, opts);
		if (!end) return `${sLabel}, ${formatCalendarDate(start, { year: 'numeric' })}`;
		const eLabel = formatCalendarDate(end, { ...opts, year: 'numeric' });
		return `${sLabel} – ${eLabel}`;
	}
	const dateRange = $derived(fmtDates(data.startDate ?? '', data.endDate ?? ''));
</script>

<div class="flex min-h-dvh items-center justify-center bg-paper p-4 text-ink">
	<div class="w-full max-w-sm">
		<div class="mb-6 text-center">
			<h1 class="font-display text-3xl font-semibold tracking-tight text-ink">Waypoint</h1>
		</div>

		{#if data.status === 'not_found'}
			<div
				role="alert"
				class="rounded-md border border-error/30 bg-error/10 p-4 text-sm text-error-deep"
			>
				<p class="font-semibold">Link not found</p>
				<p class="mt-1">
					This join link is invalid or has been revoked. Ask the trip organizer for a fresh one.
				</p>
			</div>
			<a
				href="/trips"
				class="mt-4 block text-center text-sm text-ink-muted hover:text-ink-soft active:text-ink-soft"
				>Back to your trips</a
			>
		{:else if data.status === 'inactive'}
			<div
				role="alert"
				class="rounded-md border border-error/30 bg-error/10 p-4 text-sm text-error-deep"
			>
				<p class="font-semibold">Link no longer active</p>
				<p class="mt-1">
					{#if data.closed}
						<strong>{data.tripTitle}</strong> is closed and isn't taking new members.
					{:else}
						This link to <strong>{data.tripTitle}</strong> has expired. Ask the trip organizer for a new
						one.
					{/if}
				</p>
			</div>
			<a
				href="/trips"
				class="mt-4 block text-center text-sm text-ink-muted hover:text-ink-soft active:text-ink-soft"
				>Back to your trips</a
			>
		{:else}
			<!-- Pre-auth context card: title + dates + role ONLY. -->
			<div class="text-center">
				<p class="text-sm text-ink-soft">You've been invited to join</p>
				<p class="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">
					{data.tripTitle}
				</p>
				{#if dateRange}
					<p class="mt-1 text-sm text-ink-muted">{dateRange}</p>
				{/if}
				<p class="mt-1 text-sm text-ink-muted">
					as a <strong>{roleLabel[data.role] ?? data.role}</strong>
				</p>
			</div>

			{#if error}
				<div
					role="alert"
					class="mt-4 rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error-deep"
				>
					{error}
				</div>
			{/if}

			{#if data.status === 'ready'}
				{#if placeholders.length > 0}
					<div class="mt-6 space-y-2">
						<p class="text-sm text-ink-soft">Were you already added to this trip?</p>
						{#each placeholders as ph (ph.member_id)}
							<button
								type="button"
								class="w-full rounded-lg border border-line p-3 text-left transition-colors
									{selectedPlaceholder === ph.member_id
									? 'border-moss bg-moss-tint'
									: 'bg-surface hover:bg-surface-2 active:bg-surface-2'}"
								onclick={() => {
									selectedPlaceholder = selectedPlaceholder === ph.member_id ? null : ph.member_id;
								}}
							>
								<span class="font-medium text-ink">{ph.display_name}</span>
								<span class="ml-1 text-sm text-ink-muted">{roleLabel[ph.role] ?? ph.role}</span>
							</button>
						{/each}
					</div>
				{/if}

				<form
					method="POST"
					action="?/accept"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							loading = false;
							await update();
						};
					}}
					class="mt-6"
				>
					{#if selectedPlaceholder}
						<input type="hidden" name="claim_placeholder" value={selectedPlaceholder} />
					{/if}
					<Button
						type="submit"
						disabled={loading}
						{loading}
						variant="moss"
						size="lg"
						class="w-full"
					>
						{#if loading}
							Joining…
						{:else if selectedPlaceholder}
							Join as {placeholders.find((p) => p.member_id === selectedPlaceholder)?.display_name}
						{:else}
							Join trip
						{/if}
					</Button>
				</form>

				{#if placeholders.length > 0 && !selectedPlaceholder}
					<p class="mt-2 text-center text-xs text-ink-muted">
						None of those are me — join as a new member
					</p>
				{/if}
			{:else}
				<!-- logged_out: collect email → OTP -->
				<p class="mt-3 text-center text-sm text-ink-muted">Verify your email to continue.</p>

				{#if !otpId}
					<form
						method="POST"
						action="?/requestOTP"
						use:enhance={() => {
							loading = true;
							return async ({ result, update }) => {
								loading = false;
								if (result.type === 'success' && result.data?.otpId) {
									otpId = result.data.otpId as string;
									email = (result.data.email as string) ?? email;
								} else {
									await update();
								}
							};
						}}
						class="mt-4"
					>
						<label for="email" class="block text-sm font-medium text-ink-soft">Email</label>
						<input
							type="email"
							id="email"
							name="email"
							required
							autocomplete="email"
							enterkeyhint="send"
							bind:value={email}
							class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-ink"
							placeholder="you@example.com"
						/>
						<Button
							type="submit"
							disabled={loading}
							{loading}
							variant="moss"
							size="lg"
							class="mt-4 w-full"
						>
							{loading ? 'Sending…' : 'Send 6-digit code'}
						</Button>
					</form>
				{:else}
					<form
						method="POST"
						action="?/verifyOTP"
						use:enhance={() => {
							loading = true;
							return async ({ result, update }) => {
								loading = false;
								if (result.type === 'success') {
									await invalidateAll();
								} else {
									await update();
									// Release the latch so a corrected code auto-submits again.
									otp.release();
								}
							};
						}}
						class="mt-4"
					>
						<input type="hidden" name="otpId" value={otpId} />
						<label for="code" class="block text-sm font-medium text-ink-soft">Code</label>
						<input
							type="text"
							id="code"
							name="code"
							required
							autocomplete="one-time-code"
							inputmode="numeric"
							enterkeyhint="go"
							maxlength="6"
							use:otp.action={loading}
							class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-center font-mono text-2xl tracking-[0.5em] text-ink"
							placeholder="000000"
						/>
						<Button
							type="submit"
							disabled={loading}
							{loading}
							variant="moss"
							size="lg"
							class="mt-4 w-full"
						>
							{loading ? 'Verifying…' : 'Verify and continue'}
						</Button>
						<button
							type="button"
							class="mt-2 w-full text-sm text-ink-muted hover:text-ink-soft active:text-ink-soft"
							onclick={() => {
								otpId = '';
								otp.release();
							}}
						>
							Resend code
						</button>
					</form>
				{/if}
			{/if}
		{/if}
	</div>
</div>
