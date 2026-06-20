<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { validateForm } from '$lib/shell/actions/validate-form';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import Button from '$lib/ui/Button.svelte';
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import type { InviteRole } from '$lib/types';
	import { toast } from '$lib/shell/stores/toast';

	let { data, form } = $props();

	let inviteLoading = $state(false);
	let placeholderLoading = $state(false);
	let revoking = $state<string | null>(null);
	let promoting = $state<string | null>(null);
	let removing = $state<string | null>(null);
	let leaving = $state(false);
	let showPlaceholderForm = $state(false);

	// --- Remove confirmation dialog (#238, ADR-0013). Clicking Remove opens a
	// bottom sheet whose copy depends on whether the member is referenced by any
	// record (zeroRef, computed in load via the same /api/members/can-purge check):
	//   zero-ref member  → "Delete permanently — this can't be undone" (the remove
	//                      hook will hard-delete; nothing references them).
	//   member with data → they're kept as a former member (the hook tombstones).
	// load's flag is UX only — the remove hook re-checks server-side as the source
	// of truth, so a race (a ref lands between page load and submit) just yields the
	// other, still-correct outcome and the toast reflects what actually happened.
	type RemoveTarget = { id: string; label: string; zeroRef: boolean };
	let removeTarget = $state<RemoveTarget | null>(null);
	let removeOpen = $state(false);

	function openRemove(id: string, label: string, zeroRef: boolean) {
		removeTarget = { id, label, zeroRef };
		removeOpen = true;
	}

	// BottomSheet self-closes via its bindable `open` (Escape / backdrop / X) —
	// clear the target when it does, mirroring SwipeDeck's detail-sheet pattern.
	$effect(() => {
		if (!removeOpen) removeTarget = null;
	});
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
	const joinLinkByRole = $derived(new Map((data.joinLinks ?? []).map((l) => [l.role, l])));

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
		(form?.invite ?? null) as {
			success?: boolean;
			email?: string;
			error?: string;
			role?: string;
		} | null
	);
	const revokeForm = $derived(
		(form?.revoke ?? null) as { success?: boolean; error?: string } | null
	);
	const placeholderForm = $derived(
		(form?.placeholder ?? null) as {
			success?: boolean;
			displayName?: string;
			error?: string;
		} | null
	);
	const actionForm = $derived(
		(form?.action ?? null) as { success?: boolean; error?: string } | null
	);
	const leaveForm = $derived((form?.leave ?? null) as { success?: boolean; error?: string } | null);
	const leaveError = $derived(leaveForm?.error ?? '');

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

	const isSoleOwner = $derived(data.membership.role === 'owner' && data.ownerCount <= 1);
</script>

<NavBar title="Members" subtitle={data.trip.title} back backHref="/trips/{data.trip.slug}" />
<main class="mx-auto w-full max-w-lg flex-1 space-y-6 px-4 pt-4 pb-8 md-desktop:max-w-2xl">
	{#if actionError || leaveError}
		<div
			role="alert"
			class="rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error-deep"
		>
			{actionError || leaveError}
		</div>
	{/if}

	<!-- Members list -->
	<section class="space-y-3">
		<h2 class="text-xs font-semibold tracking-wider text-ink-soft uppercase">
			Members ({data.members.length})
		</h2>
		<Card>
			<ul class="divide-y divide-line">
				{#each data.members as m (m.id)}
					{@const isSelf = m.user === data.membership.user}
					<li class="flex items-center justify-between gap-3 px-4 py-3">
						<Avatar img={m.avatarUrl} initial={m.displayLabel} alt={m.displayLabel} size={36} />
						<div class="min-w-0 flex-1">
							<!-- #234: flex-wrap so the "(placeholder)" tag drops to a second line on a
							     narrow viewport instead of stealing the name's width — the truncate
							     name was clipping to nothing on mobile portrait (the placeholder rows
							     also carry the extra Promote action, crowding the row). -->
							<div class="flex flex-wrap items-center gap-x-2">
								<span class="max-w-full truncate text-sm font-semibold text-ink"
									>{m.displayLabel}</span
								>
								{#if m.isPlaceholder}
									<span class="shrink-0 text-xs text-ink-muted">(placeholder)</span>
								{/if}
							</div>
							{#if m.emailLabel}
								<div class="truncate text-xs text-ink-muted">{m.emailLabel}</div>
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
										class="text-xs font-medium text-ink-soft hover:text-ink disabled:text-ink-muted"
									>
										{promoting === m.id ? '…' : 'Promote'}
									</button>
								</form>
							{/if}
							{#if isSelf}
								<!-- #180: /account was unreachable from inside a trip — the
								     self-row (you're looking at your own avatar) is the natural door. -->
								<a href="/account" class="text-xs font-medium text-ink-soft hover:text-ink"
									>Account</a
								>
								<!-- #206: self-serve leave for ANY role. Reuses the remove
								     tombstone path (?/leave → /api/members/remove, forced keep).
								     Sole active owner is blocked here and re-blocked server-side. -->
								<form
									method="POST"
									action="?/leave"
									use:enhance={() => {
										leaving = true;
										return async ({ update, result }) => {
											leaving = false;
											if (result.type === 'success') {
												toast.show('You left the trip');
												await goto('/trips');
												return;
											}
											await update();
										};
									}}
								>
									<input type="hidden" name="member_id" value={data.membership.id} />
									<button
										type="submit"
										disabled={leaving || isSoleOwner}
										title={isSoleOwner
											? 'Transfer ownership or remove others before leaving'
											: undefined}
										class="text-xs font-semibold text-clay hover:text-clay/80 disabled:text-ink-muted"
									>
										{leaving ? '…' : 'Leave trip'}
									</button>
								</form>
							{:else if data.isOwner}
								<button
									type="button"
									onclick={() => openRemove(m.id, m.displayLabel, m.zeroRef)}
									disabled={removing === m.id}
									class="text-xs font-semibold text-clay hover:text-clay/80 disabled:text-ink-muted"
								>
									{removing === m.id ? '…' : 'Remove'}
								</button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</Card>
	</section>

	<!-- Former members (#133 tombstones) — collapsed by default behind a
	     disclosure (#232) so departed/removed people don't clutter the roster.
	     <details> is uncontrolled (no `open` attr) → starts closed; native
	     toggle, no JS state needed. -->
	{#if data.formerMembers.length > 0}
		<section>
			<details class="group space-y-3">
				<summary
					class="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold tracking-wider text-ink-soft uppercase select-none hover:text-ink [&::-webkit-details-marker]:hidden"
				>
					<!-- Chevron: ink-muted (NOT text-line — it's ~1.2:1, invisible). Rotates open. -->
					<svg
						class="text-ink-muted transition-transform duration-150 group-open:rotate-90"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						width="14"
						height="14"
						aria-hidden="true"
					>
						<path d="m9 18 6-6-6-6" />
					</svg>
					Former members ({data.formerMembers.length})
				</summary>
				<Card>
					<ul class="divide-y divide-line">
						{#each data.formerMembers as m (m.id)}
							<li class="flex items-center justify-between gap-3 px-4 py-3 opacity-75">
								<Avatar departed alt={m.displayLabel} size={36} />
								<div class="min-w-0 flex-1">
									<div class="truncate text-sm font-medium text-ink-soft">{m.displayLabel}</div>
									<div class="truncate text-xs text-ink-muted">
										Removed{m.removedAtLabel ? ` · ${m.removedAtLabel}` : ''}
									</div>
								</div>
								<span class="shrink-0">
									<Pill variant="default" size="sm">Departed</Pill>
								</span>
							</li>
						{/each}
					</ul>
				</Card>
				<p class="text-xs text-ink-muted">
					Removed members keep their name on past expenses and records. Their money history is never
					deleted.
				</p>
			</details>
		</section>
	{/if}

	<!-- Add placeholder -->
	{#if data.canAddPlaceholder}
		<section class="space-y-3">
			<div class="flex items-center justify-between">
				<h2 class="text-xs font-semibold tracking-wider text-ink-soft uppercase">
					Add placeholder member
				</h2>
				<button
					type="button"
					onclick={() => (showPlaceholderForm = !showPlaceholderForm)}
					class="text-xs font-medium text-ink-soft hover:text-ink"
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
							<div
								role="alert"
								class="rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error-deep"
							>
								{placeholderForm.error}
							</div>
						{/if}

						<div>
							<label for="ph-name" class="block text-sm font-medium text-ink-soft">
								Display name <span class="text-clay">*</span>
							</label>
							<input
								type="text"
								id="ph-name"
								name="display_name"
								required
								maxlength="100"
								placeholder="Jake"
								class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink"
							/>
						</div>

						<div>
							<label for="ph-email" class="block text-sm font-medium text-ink-soft">
								Email <span class="font-normal text-ink-muted">(optional — enables auto-join)</span>
							</label>
							<input
								type="email"
								id="ph-email"
								name="placeholder_email"
								autocomplete="email"
								placeholder="jake@example.com"
								class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink"
							/>
						</div>

						<div>
							<label for="ph-role" class="block text-sm font-medium text-ink-soft">Role</label>
							<select
								id="ph-role"
								name="role"
								required
								class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink"
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
			<h2 class="text-xs font-semibold tracking-wider text-ink-soft uppercase">Invite by email</h2>
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
						<div
							role="alert"
							class="rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error-deep"
						>
							{inviteError}
						</div>
					{/if}
					{#if inviteSuccess}
						<div class="rounded-md border border-moss/30 bg-moss-tint p-3 text-sm text-moss">
							Invite sent to {inviteForm?.email}.
						</div>
					{/if}

					<div>
						<label for="invite-email" class="block text-sm font-medium text-ink-soft">Email</label>
						<input
							type="email"
							id="invite-email"
							name="email"
							required
							autocomplete="email"
							placeholder="friend@example.com"
							class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
						/>
					</div>

					<div>
						<label for="invite-role" class="block text-sm font-medium text-ink-soft">Role</label>
						<select
							id="invite-role"
							name="role"
							required
							class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
						>
							{#each allowedRoles as role}
								<option value={role}>{roleLabel[role]}</option>
							{/each}
						</select>
						{#if !data.isOwner}
							<p class="mt-1 text-xs text-ink-muted">
								Travelers can invite Travelers and Viewers only.
							</p>
						{/if}
					</div>

					<Button
						type="submit"
						disabled={inviteLoading}
						loading={inviteLoading}
						variant="moss"
						size="md"
						class="w-full"
					>
						{inviteLoading ? 'Sending…' : 'Send invite'}
					</Button>
				</form>
			</Card>
		</section>
	{/if}

	<!-- Share join links (#118, #152) — non-viewer members, open trips only -->
	{#if data.canManageJoinLinks}
		<section class="space-y-3">
			<h2 class="text-xs font-semibold tracking-wider text-ink-soft uppercase">
				Share a join link
			</h2>
			<p class="text-xs text-ink-muted">
				Anyone with the link can join this trip at the chosen role after verifying their email.
				Co-owners stay on the email-invite path.
			</p>
			{#if joinLinkError}
				<div
					role="alert"
					class="rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error-deep"
				>
					{joinLinkError}
				</div>
			{/if}
			<Card>
				<ul class="divide-y divide-line">
					{#each joinRoles as role (role)}
						{@const link = joinLinkByRole.get(role)}
						<li class="space-y-2 px-4 py-3">
							<div class="flex items-center justify-between gap-2">
								<Pill variant={rolePillVariant(role)} size="sm">{roleLabel[role]}</Pill>
								{#if link}
									<span class="text-xs text-ink-muted">
										{#if link.expired}
											<span class="font-semibold text-clay">Expired</span>
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
										class="min-w-0 flex-1 truncate rounded-md border border-line bg-surface-2 px-2 py-1.5 font-mono text-xs text-ink-soft"
										onclick={(e) => e.currentTarget.select()}
									/>
									<button
										type="button"
										onclick={() => copyJoinLink(role, link.token)}
										class="shrink-0 text-xs font-semibold text-moss hover:text-moss/80"
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
												if (result.type === 'success')
													toast.show('Link rotated — old link disabled');
												await update();
											};
										}}
									>
										<input type="hidden" name="role" value={role} />
										<button
											type="submit"
											disabled={joinLinkBusy === role + ':rotate'}
											class="text-xs font-medium text-ink-soft hover:text-ink disabled:text-ink-muted"
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
											class="text-xs font-semibold text-clay hover:text-clay/80 disabled:text-ink-muted"
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
										<label for="exp-{role}" class="block text-xs text-ink-muted"
											>Expires in (days)</label
										>
										<input
											type="number"
											id="exp-{role}"
											name="expires_days"
											min="1"
											max="365"
											value="30"
											class="mt-1 block w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
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
			<h2 class="text-xs font-semibold tracking-wider text-ink-soft uppercase">
				Pending invites ({data.pending.length})
			</h2>
			{#if revokeError}
				<div
					role="alert"
					class="rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error-deep"
				>
					{revokeError}
				</div>
			{/if}
			<Card>
				<ul class="divide-y divide-line">
					{#each data.pending as p (p.id)}
						<li class="flex items-start justify-between gap-3 px-4 py-3">
							<div class="min-w-0 flex-1">
								<div class="truncate text-sm font-semibold text-ink">{p.email}</div>
								<div class="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
									<Pill variant={rolePillVariant(p.role)} size="sm"
										>{roleLabel[p.role] ?? p.role}</Pill
									>
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
									class="text-xs font-semibold text-clay hover:text-clay/80 disabled:text-ink-muted"
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
		<p class="text-center text-xs text-ink-muted">Viewers cannot invite new members.</p>
	{/if}
</main>

<!-- Remove member confirm (#238, ADR-0013). Zero-ref members get a distinct
     "Delete permanently" confirm (no disposition picker — there's nothing to
     dispose); members with data are tombstoned as a former member. -->
{#if removeTarget}
	{@const t = removeTarget}
	<BottomSheet bind:open={removeOpen} title={t.zeroRef ? 'Delete permanently' : 'Remove member'}>
		<div class="space-y-4">
			{#if t.zeroRef}
				<p class="text-sm text-ink">
					Permanently delete <span class="font-semibold">{t.label}</span>? They haven't been added
					to any expenses, items, or other records, so there's nothing to keep.
				</p>
				<p class="text-sm font-medium text-clay">This can't be undone.</p>
			{:else}
				<p class="text-sm text-ink">
					Remove <span class="font-semibold">{t.label}</span> from this trip? They'll move to Former members.
				</p>
				<p class="text-sm text-ink-muted">
					Their name stays on the expenses and records they're part of — their money history is
					never deleted.
				</p>
			{/if}

			<div class="flex items-center justify-end gap-3 pt-2">
				<button
					type="button"
					onclick={() => (removeOpen = false)}
					class="text-sm font-medium text-ink-soft hover:text-ink"
				>
					Cancel
				</button>
				<form
					method="POST"
					action="?/remove"
					use:enhance={() => {
						removing = t.id;
						return async ({ update, result }) => {
							removing = null;
							removeOpen = false;
							if (result.type === 'success') {
								const deleted =
									(result.data as { action?: { deleted?: boolean } } | undefined)?.action
										?.deleted === true;
								toast.show(deleted ? 'Member deleted' : 'Member removed');
							}
							await update();
						};
					}}
				>
					<input type="hidden" name="member_id" value={t.id} />
					<button
						type="submit"
						disabled={removing === t.id}
						class="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40 {t.zeroRef
							? 'border-clay bg-clay text-paper hover:bg-clay/90'
							: 'border-moss bg-moss text-paper hover:bg-moss-soft'}"
					>
						{#if removing === t.id}
							…
						{:else if t.zeroRef}
							Delete permanently
						{:else}
							Remove
						{/if}
					</button>
				</form>
			</div>
		</div>
	</BottomSheet>
{/if}
