<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/ui/Button.svelte';

	let { form } = $props();

	let otpId = $state('');
	let email = $state('');
	let loading = $state(false);
	let error = $state('');
	$effect(() => {
		if (form?.error) error = form.error;
	});
</script>

<div class="bg-paper text-ink flex min-h-dvh md-desktop:flex-row">
	<!-- Brand panel: desktop only -->
	<div class="bg-moss hidden flex-col items-center justify-center p-12 md-desktop:flex md-desktop:w-1/2">
		<h1 class="font-display text-paper text-4xl font-bold italic">Waypoint</h1>
		<p class="text-paper/80 mt-4 max-w-sm text-center text-lg">
			Plan trips together. Share the adventure.
		</p>
	</div>

	<!-- Auth form -->
	<div class="flex min-h-dvh flex-1 items-center justify-center p-4 md-desktop:min-h-0 md-desktop:w-1/2">
		<div class="w-full max-w-sm">
			<div class="mb-8 text-center">
				<h1 class="font-display text-ink text-3xl font-semibold tracking-tight md-desktop:hidden">Waypoint</h1>
				<p class="text-ink-muted mt-2 text-sm">
					{#if otpId}
						Enter the 6-digit code sent to {email}
					{:else}
						Sign in with your email
					{/if}
				</p>
			</div>

			{#if error}
				<div role="alert" class="border-error/30 bg-error/10 text-error-deep mb-4 rounded-md border p-3 text-sm">
					{error}
				</div>
			{/if}

			{#if !otpId}
				<form
					method="POST"
					action="?/requestOTP"
					use:enhance={() => {
						loading = true;
						error = '';
						return async ({ result, update }) => {
							loading = false;
							if (result.type === 'success' && result.data?.otpId) {
								otpId = result.data.otpId as string;
								email = result.data.email as string;
							} else {
								await update();
							}
						};
					}}
				>
					<label for="email" class="text-ink-soft block text-sm font-medium">Email</label>
					<input
						type="email"
						id="email"
						name="email"
						value={email}
						required
						autocomplete="email"
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						placeholder="you@example.com"
					/>
					<Button type="submit" disabled={loading} loading={loading} variant="moss" size="lg" class="mt-4 w-full">
						{loading ? 'Sending…' : 'Send code'}
					</Button>
				</form>
			{:else}
				<form
					method="POST"
					action="?/verifyOTP"
					use:enhance={() => {
						loading = true;
						error = '';
						return async ({ update }) => {
							loading = false;
							await update();
						};
					}}
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
						class="border-line bg-surface text-ink font-mono mt-1 block w-full rounded-md border px-3 py-2 text-center text-2xl tracking-[0.5em]"
						placeholder="000000"
					/>
					<Button type="submit" disabled={loading} loading={loading} variant="moss" size="lg" class="mt-4 w-full">
						{loading ? 'Verifying…' : 'Verify'}
					</Button>
					<button
						type="button"
						class="text-ink-muted hover:text-ink-soft mt-2 w-full text-sm"
						onclick={() => {
							otpId = '';
						}}
					>
						Use a different email
					</button>
				</form>
			{/if}
		</div>
	</div>
</div>
