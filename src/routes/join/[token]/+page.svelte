<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Button from '$lib/ui/Button.svelte';

	let { data, form } = $props();

	let otpId = $state('');
	let email = $state('');
	let loading = $state(false);
	let error = $derived(form?.error ?? '');
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
		const s = new Date(start);
		const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };
		const sLabel = s.toLocaleDateString('en-US', opts);
		if (!end) return `${sLabel}, ${s.getUTCFullYear()}`;
		const e = new Date(end);
		const eLabel = e.toLocaleDateString('en-US', { ...opts, year: 'numeric', timeZone: 'UTC' });
		return `${sLabel} – ${eLabel}`;
	}
	const dateRange = $derived(fmtDates(data.startDate ?? '', data.endDate ?? ''));
</script>

<div class="bg-paper text-ink flex min-h-dvh items-center justify-center p-4">
	<div class="w-full max-w-sm">
		<div class="mb-6 text-center">
			<h1 class="font-display text-ink text-3xl font-semibold tracking-tight">Waypoint</h1>
		</div>

		{#if data.status === 'not_found'}
			<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-4 text-sm">
				<p class="font-semibold">Link not found</p>
				<p class="mt-1">
					This join link is invalid or has been revoked. Ask the trip organizer for a fresh one.
				</p>
			</div>
			<a href="/trips" class="text-ink-muted hover:text-ink-soft mt-4 block text-center text-sm"
				>Back to your trips</a
			>
		{:else if data.status === 'inactive'}
			<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-4 text-sm">
				<p class="font-semibold">Link no longer active</p>
				<p class="mt-1">
					{#if data.closed}
						<strong>{data.tripTitle}</strong> is closed and isn't taking new members.
					{:else}
						This link to <strong>{data.tripTitle}</strong> has expired. Ask the trip organizer for a
						new one.
					{/if}
				</p>
			</div>
			<a href="/trips" class="text-ink-muted hover:text-ink-soft mt-4 block text-center text-sm"
				>Back to your trips</a
			>
		{:else}
			<!-- Pre-auth context card: title + dates + role ONLY. -->
			<div class="text-center">
				<p class="text-ink-soft text-sm">You've been invited to join</p>
				<p class="font-display text-ink mt-1 text-2xl font-semibold tracking-tight">
					{data.tripTitle}
				</p>
				{#if dateRange}
					<p class="text-ink-muted mt-1 text-sm">{dateRange}</p>
				{/if}
				<p class="text-ink-muted mt-1 text-sm">
					as a <strong>{roleLabel[data.role] ?? data.role}</strong>
				</p>
			</div>

			{#if error}
				<div role="alert" class="border-error/30 bg-error/10 text-error-deep mt-4 rounded-md border p-3 text-sm">
					{error}
				</div>
			{/if}

			{#if data.status === 'ready'}
				{#if placeholders.length > 0}
					<div class="mt-6 space-y-2">
						<p class="text-ink-soft text-sm">Were you already added to this trip?</p>
						{#each placeholders as ph (ph.member_id)}
							<button
								type="button"
								class="border-line w-full rounded-lg border p-3 text-left transition-colors
									{selectedPlaceholder === ph.member_id
										? 'border-moss bg-moss-tint'
										: 'bg-surface hover:bg-surface-2'}"
								onclick={() => {
									selectedPlaceholder =
										selectedPlaceholder === ph.member_id ? null : ph.member_id;
								}}
							>
								<span class="text-ink font-medium">{ph.display_name}</span>
								<span class="text-ink-muted ml-1 text-sm">{roleLabel[ph.role] ?? ph.role}</span>
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
					<Button type="submit" disabled={loading} loading={loading} variant="moss" size="lg" class="w-full">
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
					<p class="text-ink-muted mt-2 text-center text-xs">
						None of those are me — join as a new member
					</p>
				{/if}
			{:else}
				<!-- logged_out: collect email → OTP -->
				<p class="text-ink-muted mt-3 text-center text-sm">
					Verify your email to continue.
				</p>

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
						<label for="email" class="text-ink-soft block text-sm font-medium">Email</label>
						<input
							type="email"
							id="email"
							name="email"
							required
							autocomplete="email"
							bind:value={email}
							class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2"
							placeholder="you@example.com"
						/>
						<Button type="submit" disabled={loading} loading={loading} variant="moss" size="lg" class="mt-4 w-full">
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
								}
							};
						}}
						class="mt-4"
					>
						<input type="hidden" name="otpId" value={otpId} />
						<label for="code" class="text-ink-soft block text-sm font-medium">Code</label>
						<input
							type="text"
							id="code"
							name="code"
							required
							autocomplete="one-time-code"
							inputmode="numeric"
							maxlength="6"
							oninput={(e) => {
								e.currentTarget.value = e.currentTarget.value.replace(/\D/g, '');
							}}
							class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-center font-mono text-2xl tracking-[0.5em]"
							placeholder="000000"
						/>
						<Button type="submit" disabled={loading} loading={loading} variant="moss" size="lg" class="mt-4 w-full">
							{loading ? 'Verifying…' : 'Verify and continue'}
						</Button>
						<button
							type="button"
							class="text-ink-muted hover:text-ink-soft mt-2 w-full text-sm"
							onclick={() => (otpId = '')}
						>
							Resend code
						</button>
					</form>
				{/if}
			{/if}
		{/if}
	</div>
</div>
