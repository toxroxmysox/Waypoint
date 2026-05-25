<script lang="ts">
	import { enhance } from '$app/forms';
	import { encryptText, decryptText } from '$lib/utils/crypto';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import SectionH from '$lib/components/ui/SectionH.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import type { VaultEntryDecrypted } from '$lib/types';
	import { toast } from '$lib/stores/toast';

	let { data, form } = $props();

	// Vault state
	let unlocked = $state(false);
	let vaultPassword = $state('');
	let unlockError = $state('');
	let unlockLoading = $state(false);

	// Decrypted entries
	let decryptedEntries = $state<VaultEntryDecrypted[]>([]);

	// Create entry state
	let createOpen = $state(false);
	let newTitle = $state('');
	let newBody = $state('');
	let createLoading = $state(false);

	// View entry state
	let viewEntry = $state<VaultEntryDecrypted | null>(null);

	// Delete state
	let deleteId = $state<string | null>(null);
	let deleteLoading = $state(false);

	// Check sessionStorage on mount
	import { onMount } from 'svelte';
	onMount(() => {
		const stored = sessionStorage.getItem(`vault-${data.trip.id}`);
		if (stored) {
			vaultPassword = stored;
			tryDecrypt(stored);
		}
	});

	async function tryDecrypt(password: string) {
		try {
			const results: VaultEntryDecrypted[] = [];
			for (const entry of data.entries) {
				const title = await decryptText(entry.encrypted_title, password);
				const body = await decryptText(entry.encrypted_body, password);
				results.push({
					id: entry.id,
					title,
					body,
					created_by: entry.created_by,
					created: entry.created
				});
			}
			decryptedEntries = results;
			unlocked = true;
			unlockError = '';
		} catch {
			unlockError = 'Decryption failed. Wrong password or corrupted data.';
			unlocked = false;
			sessionStorage.removeItem(`vault-${data.trip.id}`);
		}
	}

	async function handleUnlock() {
		if (!vaultPassword.trim()) return;
		unlockLoading = true;
		unlockError = '';

		try {
			const res = await fetch('/api/vault/unlock', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tripId: data.trip.id, password: vaultPassword })
			});

			if (!res.ok) {
				unlockError = 'Incorrect password.';
				unlockLoading = false;
				return;
			}

			sessionStorage.setItem(`vault-${data.trip.id}`, vaultPassword);
			await tryDecrypt(vaultPassword);
		} catch {
			unlockError = 'Failed to verify password.';
		}

		unlockLoading = false;
	}

	function handleLock() {
		unlocked = false;
		vaultPassword = '';
		decryptedEntries = [];
		sessionStorage.removeItem(`vault-${data.trip.id}`);
	}
</script>

<NavBar title="Vault" subtitle={data.trip.title} back backHref="/trips/{data.trip.slug}/more" />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-24 space-y-4">
	{#if !data.hasVaultPassword}
		<!-- No vault password set -->
		<Card>
			<div class="p-6 text-center">
				<svg class="text-ink-muted mx-auto" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
					<path d="M7 11V7a5 5 0 0 1 10 0v4" />
				</svg>
				<p class="text-ink mt-3 font-semibold">Vault not set up</p>
				<p class="text-ink-muted mt-1 text-sm">A trip owner must set a vault password in Settings before entries can be created.</p>
				<Button href="/trips/{data.trip.slug}/settings" variant="ghost" size="sm" class="mt-3">
					Go to Settings
				</Button>
			</div>
		</Card>
	{:else if !unlocked}
		<!-- Vault locked -->
		<Card>
			<div class="p-6 space-y-4">
				<div class="text-center">
					<svg class="text-ink-muted mx-auto" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
						<path d="M7 11V7a5 5 0 0 1 10 0v4" />
					</svg>
					<p class="text-ink mt-3 font-semibold">Vault locked</p>
					<p class="text-ink-muted mt-1 text-sm">Enter the trip vault password to view encrypted entries.</p>
				</div>

				{#if unlockError}
					<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">{unlockError}</div>
				{/if}

				<div>
					<input
						type="password"
						bind:value={vaultPassword}
						placeholder="Vault password"
						class="border-line bg-surface text-ink block w-full rounded-md border px-3 py-2 text-sm"
						onkeydown={(e) => { if (e.key === 'Enter') handleUnlock(); }}
					/>
				</div>

				<Button onclick={handleUnlock} disabled={unlockLoading || !vaultPassword.trim()} loading={unlockLoading} variant="moss" size="md" class="w-full">
					{unlockLoading ? 'Unlocking...' : 'Unlock'}
				</Button>
			</div>
		</Card>
	{:else}
		<!-- Vault unlocked -->
		<div class="flex items-center justify-between">
			<SectionH>
				{#snippet right()}
					<button onclick={handleLock} class="text-ink-muted hover:text-ink-soft text-xs">Lock</button>
				{/snippet}
				Entries ({decryptedEntries.length})
			</SectionH>
		</div>

		{#if form?.error}
			<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">{form.error}</div>
		{/if}

		{#if decryptedEntries.length === 0}
			<Card>
				<div class="p-6 text-center">
					<p class="text-ink-muted text-sm">No vault entries yet.</p>
				</div>
			</Card>
		{:else}
			{#each decryptedEntries as entry (entry.id)}
				<Card>
					<div class="p-4">
						<button
							type="button"
							onclick={() => (viewEntry = viewEntry?.id === entry.id ? null : entry)}
							class="flex w-full items-center justify-between text-left"
						>
							<h3 class="text-ink text-sm font-semibold">{entry.title}</h3>
							<svg
								class="text-ink-muted shrink-0 transition-transform {viewEntry?.id === entry.id ? 'rotate-180' : ''}"
								width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
							>
								<path d="m6 9 6 6 6-6" />
							</svg>
						</button>
						{#if viewEntry?.id === entry.id}
							<p class="text-ink-soft mt-2 text-sm whitespace-pre-wrap">{entry.body}</p>
							<form
								method="POST"
								action="?/deleteEntry"
								use:enhance={() => {
									deleteLoading = true;
									deleteId = entry.id;
									return async ({ update, result }) => {
										deleteLoading = false;
										deleteId = null;
										viewEntry = null;
										if (result.type === 'success') toast.show('Entry deleted');
										await update();
									};
								}}
								class="mt-3"
							>
								<input type="hidden" name="entry_id" value={entry.id} />
								<button
									type="submit"
									disabled={deleteLoading && deleteId === entry.id}
									class="text-clay hover:text-clay/80 text-xs font-semibold"
								>
									{deleteLoading && deleteId === entry.id ? 'Deleting...' : 'Delete entry'}
								</button>
							</form>
						{/if}
					</div>
				</Card>
			{/each}
		{/if}

		<Button onclick={() => (createOpen = true)} variant="moss" size="md" class="w-full">
			Add entry
		</Button>

		<BottomSheet bind:open={createOpen} title="New Vault Entry">
			<form
				method="POST"
				action="?/createEntry"
				use:enhance={async ({ formData, cancel }) => {
					if (!newTitle.trim() || !newBody.trim()) { cancel(); return; }
					createLoading = true;

					const encTitle = await encryptText(newTitle, vaultPassword);
					const encBody = await encryptText(newBody, vaultPassword);

					formData.set('encrypted_title', encTitle);
					formData.set('encrypted_body', encBody);

					return async ({ result, update }) => {
						createLoading = false;
						if (result.type === 'success') {
							newTitle = '';
							newBody = '';
							createOpen = false;
							toast.show('Entry created');
							await update();
						}
					};
				}}
				class="space-y-4"
			>
				<div>
					<label for="vault-title" class="text-ink-soft block text-sm font-medium">Title</label>
					<input
						type="text"
						id="vault-title"
						bind:value={newTitle}
						required
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						placeholder="e.g. Hotel safe code"
					/>
				</div>
				<div>
					<label for="vault-body" class="text-ink-soft block text-sm font-medium">Content</label>
					<textarea
						id="vault-body"
						bind:value={newBody}
						required
						rows="4"
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm resize-none"
						placeholder="Sensitive information..."
					></textarea>
				</div>
				<Button type="submit" disabled={createLoading || !newTitle.trim() || !newBody.trim()} loading={createLoading} variant="moss" size="md" class="w-full">
					{createLoading ? 'Encrypting...' : 'Save encrypted'}
				</Button>
			</form>
		</BottomSheet>
	{/if}
</main>
