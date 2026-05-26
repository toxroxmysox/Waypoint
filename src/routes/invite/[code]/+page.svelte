<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';

	let { data, form } = $props();

	let otpId = $state('');
	let loading = $state(false);
	let error = $derived(form?.error ?? '');

	const roleLabel: Record<string, string> = {
		owner: 'Owner',
		co_owner: 'Co-Owner',
		traveler: 'Traveler',
		viewer: 'Viewer'
	};
</script>

<div class="bg-paper text-ink flex min-h-dvh items-center justify-center p-4">
	<div class="w-full max-w-sm">
		<div class="mb-6 text-center">
			<h1 class="font-display text-ink text-3xl font-semibold tracking-tight">Waypoint</h1>
		</div>

		{#if data.status === 'not_found'}
			<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-4 text-sm">
				<p class="font-semibold">Invite not found</p>
				<p class="mt-1">
					This link is invalid or has already been used. If you think it should still work, ask the
					person who invited you to send a fresh one.
				</p>
			</div>
			<a href="/trips" class="text-ink-muted hover:text-ink-soft mt-4 block text-center text-sm"
				>Back to your trips</a
			>
		{:else if data.status === 'expired'}
			<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-4 text-sm">
				<p class="font-semibold">Invite expired</p>
				<p class="mt-1">
					This invitation to <strong>{data.tripTitle}</strong> has expired. Ask the person who
					invited you to send a new one.
				</p>
			</div>
			<a href="/trips" class="text-ink-muted hover:text-ink-soft mt-4 block text-center text-sm"
				>Back to your trips</a
			>
		{:else if data.status === 'mismatch'}
			<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-4 text-sm">
				<p class="font-semibold">Wrong account</p>
				<p class="mt-2">
					This invite was sent to <strong>{data.email}</strong>, but you're signed in as
					<strong>{data.authEmail}</strong>.
				</p>
				<p class="mt-2">
					Sign out and accept the invite as <strong>{data.email}</strong>, or ask for a new invite
					to your current address.
				</p>
			</div>
			<form
				method="POST"
				action="?/signOut"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="mt-4"
			>
				<Button type="submit" disabled={loading} loading={loading} variant="primary" size="md" class="w-full">
					{loading ? 'Signing out…' : 'Sign out and accept as ' + data.email}
				</Button>
			</form>
		{:else if data.status === 'match'}
			<div class="text-center">
				<p class="text-ink-soft text-sm">
					You've been invited to join
				</p>
				<p class="font-display text-ink mt-1 text-2xl font-semibold tracking-tight">
					{data.tripTitle}
				</p>
				<p class="text-ink-muted mt-1 text-sm">
					as a <strong>{roleLabel[data.role] ?? data.role}</strong>
				</p>
			</div>

			{#if error}
				<div role="alert" class="border-error/30 bg-error/10 text-error-deep mt-4 rounded-md border p-3 text-sm">
					{error}
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
				<Button type="submit" disabled={loading} loading={loading} variant="moss" size="lg" class="w-full">
					{loading ? 'Joining…' : 'Accept invite'}
				</Button>
			</form>
		{:else if data.status === 'logged_out'}
			<div class="text-center">
				<p class="text-ink-soft text-sm">You've been invited to join</p>
				<p class="font-display text-ink mt-1 text-2xl font-semibold tracking-tight">
					{data.tripTitle}
				</p>
				<p class="text-ink-muted mt-1 text-sm">
					as a <strong>{roleLabel[data.role] ?? data.role}</strong>
				</p>
				<p class="text-ink-muted mt-3 text-sm">
					Verify your email <strong>{data.email}</strong> to continue.
				</p>
			</div>

			{#if error}
				<div role="alert" class="border-error/30 bg-error/10 text-error-deep mt-4 rounded-md border p-3 text-sm">
					{error}
				</div>
			{/if}

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
							} else {
								await update();
							}
						};
					}}
					class="mt-4"
				>
					<input type="hidden" name="email" value={data.email} />
					<Button type="submit" disabled={loading} loading={loading} variant="moss" size="lg" class="w-full">
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
								// Reload to pick up the new auth state; load() will return
								// status='match' and the page will show the accept button.
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
						{loading ? 'Verifying…' : 'Verify and join'}
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
	</div>
</div>
