<script lang="ts">
	// #502 — connect an AI app (the Claude connector) to Waypoint with the email
	// code. Plain forms, no `enhance`: the final 303 must be a real navigation in
	// the app's in-app browser. Both forms carry `req` (the pending request).
	import { otpAutoSubmit } from '$lib/shell/actions/otp-auto-submit';
	import Button from '$lib/ui/Button.svelte';

	let { data, form } = $props();

	const req = $derived((form?.req as string) || data.req);
	const appName = $derived((form?.appName as string) || data.appName || 'your AI app');
	const otpId = $derived((form?.otpId as string) ?? '');
	const email = $derived((form?.email as string) ?? '');
	const otp = otpAutoSubmit();

	// One post per form: auto-submit, iOS code autofill and a tap can all fire.
	let submitting = $state(false);
	function once(e: SubmitEvent) {
		if (submitting) e.preventDefault();
		submitting = true;
	}
</script>

<svelte:head><title>Connect to Waypoint</title></svelte:head>

<div class="flex min-h-dvh items-center justify-center bg-paper p-4 text-ink">
	<div class="w-full max-w-sm">
		<div class="mb-8 text-center">
			<h1 class="font-display text-2xl font-semibold tracking-tight text-ink">
				Connect {appName} to Waypoint
			</h1>
			<p class="mt-2 text-sm text-ink-muted">
				{#if otpId}
					Enter the 6-digit code sent to {email}
				{:else}
					Sign in with your email code. {appName} will see your trips the way you do.
				{/if}
			</p>
		</div>

		{#if form?.error}
			<div
				role="alert"
				class="mb-4 rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error-deep"
			>
				{form.error}
			</div>
		{/if}

		{#if !otpId}
			<form method="POST" action="?/requestOTP" onsubmit={once}>
				<input type="hidden" name="req" value={req} />
				<label for="email" class="block text-sm font-medium text-ink-soft">Email</label>
				<input
					type="email"
					id="email"
					name="email"
					value={email}
					required
					autocomplete="email"
					enterkeyhint="send"
					class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
					placeholder="you@example.com"
				/>
				<Button type="submit" variant="moss" size="lg" class="mt-4 w-full">Send code</Button>
			</form>
		{:else}
			<form method="POST" action="?/verifyOTP" onsubmit={once}>
				<input type="hidden" name="req" value={req} />
				<input type="hidden" name="otpId" value={otpId} />
				<input type="hidden" name="email" value={email} />
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
					pattern={'[0-9]{6}'}
					use:otp.action={submitting}
					class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-center font-mono text-2xl tracking-[0.5em] text-ink"
					placeholder="000000"
				/>
				<Button type="submit" variant="moss" size="lg" class="mt-4 w-full">Connect</Button>
			</form>
		{/if}
	</div>
</div>
