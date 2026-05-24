<script lang="ts">
	import { enhance } from '$app/forms';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Pill from '$lib/components/ui/Pill.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { InviteRole } from '$lib/types';

	let { data, form } = $props();

	let inviteLoading = $state(false);
	let placeholderLoading = $state(false);
	let revoking = $state<string | null>(null);
	let promoting = $state<string | null>(null);
	let removing = $state<string | null>(null);
	let showPlaceholderForm = $state(false);

	const allowedRoles = $derived<InviteRole[]>(
		data.isOwner ? ['co_owner', 'traveler', 'viewer'] : ['traveler', 'viewer']
	);

	const inviteForm = $derived(
		(form?.invite ?? null) as
			| { success?: boolean; email?: string; error?: string; role?: string }
			| null
	);
	const revokeForm = $derived((form?.revoke ?? null) as { success?: boolean; error?: string } | null);
	const placeholderForm = $derived(
		(form?.placeholder ?? null) as
			| { success?: boolean; displayName?: string; error?: string }
			| null
	);
	const actionForm = $derived(
		(form?.action ?? null) as { success?: boolean; error?: string } | null
	);

	const inviteSuccess = $derived(inviteForm?.success ?? false);
	const inviteError = $derived(inviteForm?.error ?? '');
	const revokeError = $derived(revokeForm?.error ?? '');
	const actionError = $derived(actionForm?.error ?? '');

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

	const isSoleOwner = $derived(
		data.membership.role === 'owner' && data.ownerCount <= 1
	);
</script>

<NavBar title="Members" subtitle={data.trip.title} back backHref="/trips/{data.trip.slug}" />
<main class="mx-auto w-full max-w-lg flex-1 space-y-6 px-4 pt-4 pb-8">
	{#if actionError}
		<div class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">
			{actionError}
		</div>
	{/if}

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
							<div class="flex items-center gap-2">
								<span class="text-ink truncate text-sm font-semibold">{m.displayLabel}</span>
								{#if m.isPlaceholder}
									<span class="text-ink-muted text-xs">(offline)</span>
								{/if}
							</div>
							{#if m.emailLabel}
								<div class="text-ink-muted truncate text-xs">{m.emailLabel}</div>
							{/if}
						</div>
						<div class="flex shrink-0 items-center gap-2">
							<Pill variant={rolePillVariant(m.role)} size="sm">{roleLabel[m.role] ?? m.role}</Pill>
							{#if data.isOwner && m.role === 'traveler'}
								<form
									method="POST"
									action="?/promote"
									use:enhance={() => {
										promoting = m.id;
										return async ({ update }) => {
											promoting = null;
											await update();
										};
									}}
								>
									<input type="hidden" name="member_id" value={m.id} />
									<button
										type="submit"
										disabled={promoting === m.id}
										class="text-ink-soft hover:text-ink disabled:text-ink-muted text-xs font-medium"
									>
										{promoting === m.id ? '…' : 'Promote'}
									</button>
								</form>
							{/if}
							{#if data.isOwner}
								{@const isSelf = m.user === data.membership.user}
								{@const blocked = isSelf && isSoleOwner}
								<form
									method="POST"
									action="?/remove"
									use:enhance={() => {
										removing = m.id;
										return async ({ update }) => {
											removing = null;
											await update();
										};
									}}
								>
									<input type="hidden" name="member_id" value={m.id} />
									<button
										type="submit"
										disabled={removing === m.id || blocked}
										title={blocked ? 'Cannot remove the sole owner' : undefined}
										class="text-clay hover:text-clay/80 disabled:text-ink-muted text-xs font-semibold"
									>
										{removing === m.id ? '…' : 'Remove'}
									</button>
								</form>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</Card>
	</section>

	<!-- Add placeholder -->
	{#if data.canAddPlaceholder}
		<section class="space-y-3">
			<div class="flex items-center justify-between">
				<h2 class="text-ink-soft text-xs font-semibold tracking-wider uppercase">
					Add offline member
				</h2>
				<button
					type="button"
					onclick={() => (showPlaceholderForm = !showPlaceholderForm)}
					class="text-ink-soft hover:text-ink text-xs font-medium"
				>
					{showPlaceholderForm ? 'Cancel' : '+ Add'}
				</button>
			</div>
			{#if showPlaceholderForm}
				<Card>
					<form
						method="POST"
						action="?/addPlaceholder"
						use:enhance={() => {
							placeholderLoading = true;
							return async ({ update }) => {
								placeholderLoading = false;
								showPlaceholderForm = false;
								await update({ reset: true });
							};
						}}
						class="space-y-3 p-4"
					>
						{#if placeholderForm?.error}
							<div class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">
								{placeholderForm.error}
							</div>
						{/if}
						{#if placeholderForm?.success}
							<div class="border-moss/30 bg-moss-tint text-moss rounded-md border p-3 text-sm">
								{placeholderForm.displayName} added.
							</div>
						{/if}

						<div>
							<label for="ph-name" class="text-ink-soft block text-sm font-medium">
								Display name <span class="text-clay">*</span>
							</label>
							<input
								type="text"
								id="ph-name"
								name="display_name"
								required
								maxlength="100"
								placeholder="Jake"
								class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-base"
							/>
						</div>

						<div>
							<label for="ph-email" class="text-ink-soft block text-sm font-medium">
								Email <span class="text-ink-muted font-normal">(optional — enables auto-join)</span>
							</label>
							<input
								type="email"
								id="ph-email"
								name="placeholder_email"
								autocomplete="email"
								placeholder="jake@example.com"
								class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-base"
							/>
						</div>

						<div>
							<label for="ph-role" class="text-ink-soft block text-sm font-medium">Role</label>
							<select
								id="ph-role"
								name="role"
								required
								class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-base"
							>
								{#each allowedRoles as role}
									<option value={role}>{roleLabel[role]}</option>
								{/each}
							</select>
						</div>

						<Button
							type="submit"
							disabled={placeholderLoading}
							loading={placeholderLoading}
							variant="moss"
							size="md"
							class="w-full"
						>
							{placeholderLoading ? 'Adding…' : 'Add member'}
						</Button>
					</form>
				</Card>
			{/if}
		</section>
	{/if}

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
						<div class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">
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

					<Button type="submit" disabled={inviteLoading} loading={inviteLoading} variant="moss" size="md" class="w-full">
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
				<div class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">
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
		<p class="text-ink-muted text-center text-xs">Viewers cannot invite new members.</p>
	{/if}
</main>
