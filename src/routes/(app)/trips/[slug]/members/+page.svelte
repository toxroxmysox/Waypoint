<script lang="ts">
	import { enhance } from '$app/forms';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Pill from '$lib/components/ui/Pill.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TripTabs from '$lib/components/TripTabs.svelte';
	import type { InviteRole } from '$lib/types';

	let { data, form } = $props();

	let inviteLoading = $state(false);
	let revoking = $state<string | null>(null);

	// Inviter role gating per SPEC §3:
	//   owner/co_owner → all 3 roles
	//   traveler → traveler/viewer only
	//   viewer → cannot invite (handled by `canInvite`)
	const allowedRoles = $derived<InviteRole[]>(
		data.isOwner ? ['co_owner', 'traveler', 'viewer'] : ['traveler', 'viewer']
	);

	// SvelteKit narrows form action returns into a union; use a permissive
	// shape here so we can read either branch without ts-pattern matching.
	const inviteForm = $derived(
		(form?.invite ?? null) as
			| { success?: boolean; email?: string; error?: string; role?: string }
			| null
	);
	const revokeForm = $derived((form?.revoke ?? null) as { success?: boolean; error?: string } | null);
	const inviteSuccess = $derived(inviteForm?.success ?? false);
	const inviteError = $derived(inviteForm?.error ?? '');
	const revokeError = $derived(revokeForm?.error ?? '');

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
</script>

<NavBar title="Members" subtitle={data.trip.title} back backHref="/trips/{data.trip.slug}" />
<TripTabs slug={data.trip.slug} />

<main class="mx-auto w-full max-w-lg flex-1 space-y-6 px-4 pt-4 pb-8">
	<!-- Members list -->
	<section class="space-y-3">
		<h2 class="text-ink-soft text-xs font-semibold tracking-wider uppercase">
			Members ({data.members.length})
		</h2>
		<Card>
			<ul class="divide-line divide-y">
				{#each data.members as m (m.id)}
					<li class="flex items-center justify-between gap-3 px-4 py-3">
						<div class="min-w-0 flex-1">
							<div class="text-ink truncate text-sm font-semibold">{m.displayLabel}</div>
							{#if m.emailLabel}
								<div class="text-ink-muted truncate text-xs">{m.emailLabel}</div>
							{/if}
						</div>
						<Pill variant={rolePillVariant(m.role)} size="sm">{roleLabel[m.role] ?? m.role}</Pill>
					</li>
				{/each}
			</ul>
		</Card>
	</section>

	<!-- Invite form -->
	{#if data.canInvite}
		<section class="space-y-3">
			<h2 class="text-ink-soft text-xs font-semibold tracking-wider uppercase">Invite by email</h2>
			<Card>
				<form
					method="POST"
					action="?/invite"
					use:enhance={() => {
						inviteLoading = true;
						return async ({ update }) => {
							inviteLoading = false;
							await update({ reset: true });
						};
					}}
					class="space-y-3 p-4"
				>
					{#if inviteError}
						<div class="border-clay/30 bg-clay/10 text-clay rounded-md border p-3 text-sm">
							{inviteError}
						</div>
					{/if}
					{#if inviteSuccess}
						<div class="border-moss/30 bg-moss-tint text-moss rounded-md border p-3 text-sm">
							Invite sent to {inviteForm?.email}.
						</div>
					{/if}

					<div>
						<label for="invite-email" class="text-ink-soft block text-sm font-medium">Email</label>
						<input
							type="email"
							id="invite-email"
							name="email"
							required
							autocomplete="email"
							placeholder="friend@example.com"
							class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						/>
					</div>

					<div>
						<label for="invite-role" class="text-ink-soft block text-sm font-medium">Role</label>
						<select
							id="invite-role"
							name="role"
							required
							class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						>
							{#each allowedRoles as role}
								<option value={role}>{roleLabel[role]}</option>
							{/each}
						</select>
						{#if !data.isOwner}
							<p class="text-ink-muted mt-1 text-xs">
								Travelers can invite Travelers and Viewers only.
							</p>
						{/if}
					</div>

					<Button type="submit" disabled={inviteLoading} variant="moss" size="md" class="w-full">
						{inviteLoading ? 'Sending…' : 'Send invite'}
					</Button>
				</form>
			</Card>
		</section>
	{/if}

	<!-- Pending invites -->
	{#if data.pending.length > 0}
		<section class="space-y-3">
			<h2 class="text-ink-soft text-xs font-semibold tracking-wider uppercase">
				Pending invites ({data.pending.length})
			</h2>
			{#if revokeError}
				<div class="border-clay/30 bg-clay/10 text-clay rounded-md border p-3 text-sm">
					{revokeError}
				</div>
			{/if}
			<Card>
				<ul class="divide-line divide-y">
					{#each data.pending as p (p.id)}
						<li class="flex items-start justify-between gap-3 px-4 py-3">
							<div class="min-w-0 flex-1">
								<div class="text-ink truncate text-sm font-semibold">{p.email}</div>
								<div class="text-ink-muted mt-0.5 flex items-center gap-2 text-xs">
									<Pill variant={rolePillVariant(p.role)} size="sm">{roleLabel[p.role] ?? p.role}</Pill>
									<span>invited by {p.inviterLabel}</span>
									{#if p.expiresAtLabel}
										<span>· expires {p.expiresAtLabel}</span>
									{/if}
								</div>
							</div>
							<form
								method="POST"
								action="?/revoke"
								use:enhance={() => {
									revoking = p.id;
									return async ({ update }) => {
										revoking = null;
										await update();
									};
								}}
							>
								<input type="hidden" name="invite_id" value={p.id} />
								<button
									type="submit"
									disabled={revoking === p.id}
									class="text-clay hover:text-clay/80 disabled:text-ink-muted text-xs font-semibold"
								>
									{revoking === p.id ? 'Revoking…' : 'Revoke'}
								</button>
							</form>
						</li>
					{/each}
				</ul>
			</Card>
		</section>
	{/if}

	{#if !data.canInvite}
		<p class="text-ink-muted text-center text-xs">
			Viewers cannot invite new members.
		</p>
	{/if}
</main>
