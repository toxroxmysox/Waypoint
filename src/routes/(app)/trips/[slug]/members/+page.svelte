<script lang="ts">
	import { enhance } from '$app/forms';
	import { validateForm } from '$lib/shell/actions/validate-form';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import Button from '$lib/ui/Button.svelte';
	import type { InviteRole } from '$lib/types';
	import { toast } from '$lib/shell/stores/toast';

	let { data, form } = $props();

	let inviteLoading = $state(false);
	let placeholderLoading = $state(false);
	let revoking = $state<string | null>(null);
	let promoting = $state<string | null>(null);
	let removing = $state<string | null>(null);
	let showPlaceholderForm = $state(false);
	// #118 join links
	let joinLinkBusy = $state<string | null>(null);
	let copiedRole = $state<string | null>(null);

	const joinLinkForm = $derived(
		(form?.joinLink ?? null) as { success?: boolean; action?: string; error?: string } | null
	);
	const joinLinkError = $derived(joinLinkForm?.error ?? '');

	// The two link slots, in display order. Merge live links onto the fixed roles
	// so each role shows either its link or a "create" affordance.
	const joinRoles: ('traveler' | 'viewer')[] = ['traveler', 'viewer'];
	const joinLinkByRole = $derived(
		new Map((data.joinLinks ?? []).map((l) => [l.role, l]))
	);

	function joinUrl(token: string): string {
		if (typeof window === 'undefined') return `/join/${token}`;
		return `${window.location.origin}/join/${token}`;
	}

	async function copyJoinLink(role: string, token: string) {
		try {
			await navigator.clipboard.writeText(joinUrl(token));
			copiedRole = role;
			toast.show('Link copied');
			setTimeout(() => {
				if (copiedRole === role) copiedRole = null;
			}, 2000);
		} catch {
			toast.show('Could not copy — long-press to copy the link');
		}
	}

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
<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 space-y-6 px-4 pt-4 pb-8">
	{#if actionError}
		<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">
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
						<Avatar img={m.avatarUrl} initial={m.displayLabel} alt={m.displayLabel} size={36} />
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
										return async ({ update, result }) => {
											promoting = null;
											if (result.type === 'success') toast.show('Member promoted');
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
										return async ({ update, result }) => {
											removing = null;
											if (result.type === 'success') toast.show('Member removed');
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

	<!-- Former members (#133 tombstones) -->
	{#if data.formerMembers.length > 0}
		<section class="space-y-3">
			<h2 class="text-ink-soft text-xs font-semibold tracking-wider uppercase">
				Former members ({data.formerMembers.length})
			</h2>
			<Card>
				<ul class="divide-line divide-y">
					{#each data.formerMembers as m (m.id)}
						<li class="flex items-center justify-between gap-3 px-4 py-3 opacity-75">
							<Avatar departed alt={m.displayLabel} size={36} />
							<div class="min-w-0 flex-1">
								<div class="text-ink-soft truncate text-sm font-medium">{m.displayLabel}</div>
								<div class="text-ink-muted truncate text-xs">
									Removed{m.removedAtLabel ? ` · ${m.removedAtLabel}` : ''}
								</div>
							</div>
							<Pill variant="default" size="sm">Departed</Pill>
						</li>
					{/each}
				</ul>
			</Card>
			<p class="text-ink-muted text-xs">
				Removed members keep their name on past expenses and records. Their money history is never deleted.
			</p>
		</section>
	{/if}

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
						use:validateForm
						use:enhance={() => {
							placeholderLoading = true;
							return async ({ update, result }) => {
								placeholderLoading = false;
								showPlaceholderForm = false;
								if (result.type === 'success') toast.show('Member added');
								await update({ reset: true });
							};
						}}
						class="space-y-3 p-4"
					>
						{#if placeholderForm?.error}
							<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">
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
							variant="ghost"
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
					use:validateForm
					use:enhance={() => {
						inviteLoading = true;
						return async ({ update, result }) => {
							inviteLoading = false;
							if (result.type === 'success') toast.show('Invite sent');
							await update({ reset: true });
						};
					}}
					class="space-y-3 p-4"
				>
					{#if inviteError}
						<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">
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

	<!-- Share join links (#118, #152) — non-viewer members, open trips only -->
	{#if data.canManageJoinLinks}
		<section class="space-y-3">
			<h2 class="text-ink-soft text-xs font-semibold tracking-wider uppercase">Share a join link</h2>
			<p class="text-ink-muted text-xs">
				Anyone with the link can join this trip at the chosen role after verifying their email. Co-owners
				stay on the email-invite path.
			</p>
			{#if joinLinkError}
				<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">
					{joinLinkError}
				</div>
			{/if}
			<Card>
				<ul class="divide-line divide-y">
					{#each joinRoles as role (role)}
						{@const link = joinLinkByRole.get(role)}
						<li class="space-y-2 px-4 py-3">
							<div class="flex items-center justify-between gap-2">
								<Pill variant={rolePillVariant(role)} size="sm">{roleLabel[role]}</Pill>
								{#if link}
									<span class="text-ink-muted text-xs">
										{#if link.expired}
											<span class="text-clay font-semibold">Expired</span>
										{:else if link.expiresAtLabel}
											expires {link.expiresAtLabel}
										{/if}
									</span>
								{/if}
							</div>

							{#if link}
								<div class="flex items-center gap-2">
									<input
										type="text"
										readonly
										value={joinUrl(link.token)}
										class="border-line bg-surface-2 text-ink-soft min-w-0 flex-1 truncate rounded-md border px-2 py-1.5 font-mono text-xs"
										onclick={(e) => e.currentTarget.select()}
									/>
									<button
										type="button"
										onclick={() => copyJoinLink(role, link.token)}
										class="text-moss hover:text-moss/80 shrink-0 text-xs font-semibold"
									>
										{copiedRole === role ? 'Copied' : 'Copy'}
									</button>
								</div>
								<div class="flex items-center gap-4">
									<form
										method="POST"
										action="?/rotateJoinLink"
										use:enhance={() => {
											joinLinkBusy = role + ':rotate';
											return async ({ update, result }) => {
												joinLinkBusy = null;
												if (result.type === 'success') toast.show('Link rotated — old link disabled');
												await update();
											};
										}}
									>
										<input type="hidden" name="role" value={role} />
										<button
											type="submit"
											disabled={joinLinkBusy === role + ':rotate'}
											class="text-ink-soft hover:text-ink disabled:text-ink-muted text-xs font-medium"
										>
											{joinLinkBusy === role + ':rotate' ? '…' : 'Rotate'}
										</button>
									</form>
									<form
										method="POST"
										action="?/revokeJoinLink"
										use:enhance={() => {
											joinLinkBusy = role + ':revoke';
											return async ({ update, result }) => {
												joinLinkBusy = null;
												if (result.type === 'success') toast.show('Link revoked');
												await update();
											};
										}}
									>
										<input type="hidden" name="role" value={role} />
										<button
											type="submit"
											disabled={joinLinkBusy === role + ':revoke'}
											class="text-clay hover:text-clay/80 disabled:text-ink-muted text-xs font-semibold"
										>
											{joinLinkBusy === role + ':revoke' ? '…' : 'Revoke'}
										</button>
									</form>
								</div>
							{:else}
								<form
									method="POST"
									action="?/createJoinLink"
									use:enhance={() => {
										joinLinkBusy = role + ':create';
										return async ({ update, result }) => {
											joinLinkBusy = null;
											if (result.type === 'success') toast.show('Join link created');
											await update();
										};
									}}
									class="flex items-end gap-2"
								>
									<input type="hidden" name="role" value={role} />
									<div class="flex-1">
										<label for="exp-{role}" class="text-ink-muted block text-xs">Expires in (days)</label>
										<input
											type="number"
											id="exp-{role}"
											name="expires_days"
											min="1"
											max="365"
											value="30"
											class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-2 py-1.5 text-sm"
										/>
									</div>
									<Button
										type="submit"
										disabled={joinLinkBusy === role + ':create'}
										loading={joinLinkBusy === role + ':create'}
										variant="ghost"
										size="md"
									>
										Create link
									</Button>
								</form>
							{/if}
						</li>
					{/each}
				</ul>
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
				<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">
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
									return async ({ update, result }) => {
										revoking = null;
										if (result.type === 'success') toast.show('Invite revoked');
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
