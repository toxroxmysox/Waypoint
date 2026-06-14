<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/ui/Button.svelte';

	// Single branded boundary for every thrown error in the app (#171). SvelteKit
	// renders this in place of the page, still wrapped by the root layout (paper
	// background, skip link, Toast). Copy is status-aware; the recovery action
	// depends on whether the visitor is authenticated.
	const status = $derived(page.status);
	const authed = $derived(Boolean(page.data?.user));

	// SvelteKit's default message for the status (e.g. "Not Found") is rarely
	// useful to a human, so we lead with our own copy and only surface the
	// server-provided message when it's a custom, non-generic string.
	const generic = new Set(['Not Found', 'Forbidden', 'Internal Error', 'Bad Request', 'error']);
	const detail = $derived(
		page.error?.message && !generic.has(page.error.message) ? page.error.message : ''
	);

	type Copy = { eyebrow: string; heading: string; body: string };

	const copy = $derived.by<Copy>(() => {
		if (status === 404) {
			return {
				eyebrow: 'Page not found',
				heading: "We couldn't find that page",
				body: 'The link may be mistyped, or whatever was here has moved. Let’s get you back on the map.'
			};
		}
		if (status === 403) {
			return {
				eyebrow: 'No access',
				heading: 'This page isn’t yours to see',
				body: authed
					? 'You’re signed in, but this trip or page is restricted to certain members. If you think that’s a mistake, ask the trip’s owner to check your role.'
					: 'This page is restricted. Sign in with the email you were invited on, and we’ll check whether you have access.'
			};
		}
		if (status === 401) {
			return {
				eyebrow: 'Sign-in required',
				heading: 'Please sign in to continue',
				body: 'Your session may have expired. Sign in again to pick up where you left off.'
			};
		}
		if (status >= 500) {
			return {
				eyebrow: 'Something broke',
				heading: 'Something went wrong on our end',
				body: 'That’s on us, not you. Try again in a moment — if it keeps happening, the trip’s owner can let us know.'
			};
		}
		return {
			eyebrow: `Error ${status}`,
			heading: 'Something went wrong',
			body: 'An unexpected error stopped this page from loading. Let’s get you back to safe ground.'
		};
	});

	// 401/403 for a signed-out visitor is fundamentally an auth problem → send
	// them to login. Otherwise an authed user goes home to their trips, and a
	// signed-out user on any other error gets a route into the app via login.
	const recoverToTrips = $derived(authed && status !== 401);
</script>

<svelte:head>
	<title>{copy.heading} — Waypoint</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="bg-paper text-ink flex min-h-dvh items-center justify-center p-6">
	<div class="w-full max-w-md text-center">
		<p class="font-display text-ink text-2xl font-semibold italic">Waypoint</p>

		<p class="text-moss-soft mt-10 font-mono text-sm font-medium tracking-wide uppercase">
			{copy.eyebrow}
		</p>
		<h1 class="font-display text-ink mt-2 text-3xl font-semibold tracking-tight">
			{copy.heading}
		</h1>
		<p class="text-ink-soft mt-3 text-base">{copy.body}</p>

		{#if detail}
			<p class="border-line text-ink-muted mt-5 rounded-md border bg-surface px-3 py-2 text-sm">
				{detail}
			</p>
		{/if}

		<div class="mt-8 flex flex-col items-center gap-3">
			{#if recoverToTrips}
				<Button href="/trips" variant="moss" size="lg" class="w-full">Back to your trips</Button>
			{:else}
				<Button href="/login" variant="moss" size="lg" class="w-full">Sign in</Button>
			{/if}
			<a href="/" class="text-ink-muted hover:text-ink-soft text-sm">Go to the homepage</a>
		</div>
	</div>
</main>
