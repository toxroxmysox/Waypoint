<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Pill from '$lib/ui/Pill.svelte';

	let { data, form } = $props();

	// Show claims one at a time — present the first unclaimed one.
	const claim = $derived(data.claims[0]);

	const roleLabel: Record<string, string> = {
		owner: 'Owner',
		co_owner: 'Co-Owner',
		traveler: 'Traveler',
		viewer: 'Viewer'
	};

	function rolePillVariant(role: string): 'ink' | 'info' | 'default' {
		if (role === 'owner' || role === 'co_owner') return 'ink';
		if (role === 'traveler') return 'info';
		return 'default';
	}

	let displayName = $state(untrack(() => claim?.placeholder_name ?? ''));
	let accepting = $state(false);
</script>

<NavBar title="You've been added to a trip" />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 space-y-6 px-4 pt-8 pb-8">
	{#if claim}
		<div class="space-y-1 text-center">
			<p class="text-ink-soft text-sm">Someone added you as a member of</p>
			<h1 class="text-ink text-xl font-semibold">{claim.trip_title}</h1>
		</div>

		<Card>
			<div class="space-y-4 p-4">
				{#if form?.error}
					<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">
						{form.error}
					</div>
				{/if}

				<div class="flex items-center justify-between gap-3">
					<div>
						<p class="text-ink-soft text-xs font-medium uppercase tracking-wider">Added as</p>
						<p class="text-ink mt-0.5 font-semibold">{claim.placeholder_name || '(unnamed)'}</p>
					</div>
					<Pill variant={rolePillVariant(claim.role)} size="sm">
						{roleLabel[claim.role] ?? claim.role}
					</Pill>
				</div>

				<form
					method="POST"
					action="?/accept"
					use:enhance={() => {
						accepting = true;
						return async ({ update }) => {
							accepting = false;
							await update();
						};
					}}
					class="space-y-3"
				>
					<input type="hidden" name="member_id" value={claim.member_id} />
					<input type="hidden" name="trip_slug" value={claim.trip_slug} />

					<div>
						<label for="display-name" class="text-ink-soft block text-sm font-medium">
							Your display name for this trip
						</label>
						<input
							id="display-name"
							type="text"
							name="display_name"
							bind:value={displayName}
							placeholder="Your name"
							maxlength="100"
							class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-base"
						/>
					</div>

					<Button type="submit" variant="moss" size="md" class="w-full" disabled={accepting} loading={accepting}>
						{accepting ? 'Joining…' : `Join ${claim.trip_title}`}
					</Button>
				</form>

				<form method="POST" action="?/skip">
					<button
						type="submit"
						class="text-ink-muted hover:text-ink w-full py-1 text-center text-sm"
					>
						Skip for now
					</button>
				</form>
			</div>
		</Card>

		{#if data.claims.length > 1}
			<p class="text-ink-muted text-center text-xs">
				{data.claims.length - 1} more trip{data.claims.length - 1 === 1 ? '' : 's'} pending after this one.
			</p>
		{/if}
	{/if}
</main>
