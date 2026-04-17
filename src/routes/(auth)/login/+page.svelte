<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();

	let otpId = $state('');
	let email = $state('');
	let loading = $state(false);
	let error = $derived(form?.error ?? '');
</script>

<div class="flex min-h-dvh items-center justify-center bg-slate-50 p-4">
	<div class="w-full max-w-sm">
		<div class="mb-8 text-center">
			<h1 class="text-2xl font-bold text-slate-900">Waypoint</h1>
			<p class="mt-1 text-sm text-slate-500">
				{#if otpId}
					Enter the 6-digit code sent to {email}
				{:else}
					Sign in with your email
				{/if}
			</p>
		</div>

		{#if error}
			<div class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
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
							email = result.data.email as string;
						} else {
							await update();
						}
					};
				}}
			>
				<label for="email" class="block text-sm font-medium text-slate-700">Email</label>
				<input
					type="email"
					id="email"
					name="email"
					value={email}
					required
					autocomplete="email"
					class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					placeholder="you@example.com"
				/>
				<button
					type="submit"
					disabled={loading}
					class="mt-4 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
				>
					{loading ? 'Sending...' : 'Send Code'}
				</button>
			</form>
		{:else}
			<form
				method="POST"
				action="?/verifyOTP"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
			>
				<input type="hidden" name="otpId" value={otpId} />
				<label for="code" class="block text-sm font-medium text-slate-700">Code</label>
				<input
					type="text"
					id="code"
					name="code"
					required
					autocomplete="one-time-code"
					inputmode="numeric"
					maxlength="6"
					pattern="[0-9]{6}"
					class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-center text-2xl tracking-[0.5em] text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					placeholder="000000"
				/>
				<button
					type="submit"
					disabled={loading}
					class="mt-4 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
				>
					{loading ? 'Verifying...' : 'Verify'}
				</button>
				<button
					type="button"
					class="mt-2 w-full text-sm text-slate-500 hover:text-slate-700"
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
